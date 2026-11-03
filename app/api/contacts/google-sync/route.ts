import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getValidAccessToken } from "@/app/lib/google";
import { updateGoogleContact } from "@/app/lib/googleContacts";
import { isBlockedEmail } from "@/app/lib/contact-blocklist";
import { findContactsByEmail } from "@/app/lib/contact-dedupe";
import { planCursorWrite, planSyncRequest } from "@/app/lib/google-sync-cursor";
import { inngest } from "@/app/lib/inngest";

function fmtPhone(raw: string): string {
  if (!raw) return raw;
  // Strip extensions like ;1017 or ext. 123
  const cleaned = raw.split(/[;,]|ext/i)[0].trim();
  const digits = cleaned.replace(/\D/g, "");
  if (digits.length === 10) return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits[0] === "1") return `+1 (${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}`;
  return cleaned;
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("tom_session")?.value || null;
}

async function saveSyncCursor(userId: string, write: { syncToken?: string | null; pageToken: string | null; mode: string | null }) {
  if (write.syncToken !== undefined) {
    await supabase
      .from("tom_users")
      .update({ google_sync_token: write.syncToken })
      .eq("id", userId);
  }
  const extra: Record<string, string | null> = {
    google_sync_page_token: write.pageToken,
    google_sync_mode: write.mode,
  };
  const { error } = await supabase.from("tom_users").update(extra).eq("id", userId);
  if (error) {
    console.warn("Google sync cursor was not stored. Run the sync-cursor migration.", error.message);
  }
}

function fixReversedName(displayName: string, givenName: string, familyName: string): string {
  if (givenName && familyName) return `${givenName} ${familyName}`;
  if (givenName) return givenName;
  if (familyName) return familyName;
  return displayName;
}

// READ: Pull from Google Contacts → Supabase (last-write-wins + deletion sync)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const secret = searchParams.get("secret");
  let userId: string | null = null;

  if (secret === process.env.CRON_SECRET) {
    userId = searchParams.get("userId");
  } else {
    const cookieStore = await cookies();
    userId = cookieStore.get("tom_session")?.value || null;
  }

  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    if (searchParams.get("enqueue") === "1") {
      await inngest.send({ name: "tom/contacts.sync", data: { userId } });
      return NextResponse.json({
        queued: true,
        synced: 0,
        message: "Google sync is running in the background, one page at a time.",
      });
    }

    const accessToken = await getValidAccessToken(userId);

    const rich = await supabase
      .from("tom_users")
      .select("google_sync_token, google_sync_page_token, google_sync_mode")
      .eq("id", userId)
      .single();

    let storedSyncToken: string | null = null;
    let storedPageToken: string | null = null;
    let storedMode: string | null = null;
    if (rich.error) {
      const basic = await supabase
        .from("tom_users")
        .select("google_sync_token")
        .eq("id", userId)
        .single();
      storedSyncToken = basic.data?.google_sync_token || null;
    } else {
      storedSyncToken = rich.data?.google_sync_token || null;
      storedPageToken = rich.data?.google_sync_page_token || null;
      storedMode = rich.data?.google_sync_mode || null;
    }

    const requestPlan = planSyncRequest({
      storedSyncToken,
      storedPageToken,
      storedMode,
      requestedPageToken: searchParams.get("pageToken"),
      forceFull: searchParams.get("full") === "1",
    });

    // One page per call. The caller (Inngest) continues with nextPageToken.
    const url = new URL("https://people.googleapis.com/v1/people/me/connections");
    url.searchParams.set(
      "personFields",
      "names,emailAddresses,phoneNumbers,birthdays,events,addresses,organizations,biographies,metadata"
    );
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("requestSyncToken", "true");
    if (requestPlan.useSyncToken && requestPlan.syncToken) {
      url.searchParams.set("syncToken", requestPlan.syncToken);
    }
    if (requestPlan.pageToken) url.searchParams.set("pageToken", requestPlan.pageToken);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const cursorWrite = planCursorWrite({
      httpStatus: res.status,
      nextPageToken: null,
      nextSyncToken: null,
      requestMode: requestPlan.mode,
    });

    // Sync token can become invalid. Clear it and let the next run start a full sync.
    if (res.status === 410) {
      console.log("Sync token expired. Next run will start a full sync.");
      await saveSyncCursor(userId, cursorWrite);
      return NextResponse.json({
        synced: 0,
        deleted: 0,
        nextPageToken: null,
        has_more: false,
        mode: "full",
        sync_token_expired: true,
        restart_full: true,
        message: "Sync token expired. A full sync continues on the next run.",
      });
    }

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ error: errText || "Google sync failed" }, { status: res.status });
    }

    const data = await res.json();
    const contacts = data.connections || [];
    const nextPageToken = data.nextPageToken || null;
    const newSyncToken = data.nextSyncToken || null;
    const progress = planCursorWrite({
      httpStatus: 200,
      nextPageToken,
      nextSyncToken: newSyncToken,
      requestMode: requestPlan.mode,
    });
    await saveSyncCursor(userId, progress);

    let synced = 0;
    let deleted = 0;
    let birthdays_found = 0;
    let life_events_added = 0;
    let google_wins = 0;
    let tom_wins = 0;

    for (const person of contacts) {
      const resourceName = person.resourceName;

      // ── DELETION DETECTION ──────────────────────────────────────────────
      // Google marks deleted contacts with metadata.deleted: true
      const isDeleted = person.metadata?.deleted === true;

      if (isDeleted) {
        // Delete from tom_contacts immediately
        const { data: deletedContact } = await supabase
          .from("tom_contacts")
          .select("id, full_name")
          .eq("user_id", userId)
          .eq("google_resource_name", resourceName)
          .maybeSingle();

        if (deletedContact) {
          await supabase
            .from("tom_contacts")
            .delete()
            .eq("id", deletedContact.id)
            .eq("user_id", userId);

          console.log(`Deleted contact from Humble Hello (removed in Google): ${deletedContact.full_name}`);
          deleted++;
        }
        continue; // Skip normal processing for deleted contacts
      }

      // ── NORMAL CONTACT PROCESSING ────────────────────────────────────────
      const name = person.names?.[0];
      const givenName = name?.givenName?.trim() || "";
      const familyName = name?.familyName?.trim() || "";
      const fullName = givenName && familyName
        ? `${givenName} ${familyName}`
        : givenName || familyName || name?.displayName?.trim() || null;

      if (!fullName) continue;

const googleEmail = person.emailAddresses?.[0]?.value || null;
const allEmails = person.emailAddresses?.map((e: any) => e.value).filter(Boolean) || [];

// Local-part blocklist moved to app/lib/contact-blocklist.ts (substring match, 2026-05-10)
// Domain blocklist kept inline — these are sending-infrastructure domains, not local-part keywords
const BLOCKED_DOMAINS = [
  "stripe.com","mailchimp.com","sendgrid.net","constantcontact.com",
  "shared1.ccsend.com","scoop.","amazonses.com","hubspot.com",
];

const isJunk = (() => {
  if (!googleEmail) return false;
  if (isBlockedEmail(googleEmail)) return true;
  const domain = googleEmail.toLowerCase().split("@")[1] || "";
  if (BLOCKED_DOMAINS.some(d => domain.includes(d))) return true;
  return false;
})();

if (isJunk) continue;
// Block known bot/notetaker contacts by name
const BLOCKED_NAMES = ["fyxer", "notetaker", "otter.ai", "fireflies", "fathom", "krisp"];
if (BLOCKED_NAMES.some(n => fullName.toLowerCase().includes(n))) continue;

const googlePhone = person.phoneNumbers?.[0]?.value || null;
const allPhones = person.phoneNumbers?.map((p: any) => p.value).filter(Boolean) || [];
      const org = person.organizations?.[0];
      const rawCompany = org?.name || null;
      const rawJobTitle = org?.title || null;
      const SELF_NAMES = ["thomas rector", "tom rector"];
      const googleCompany = rawCompany && !SELF_NAMES.some(n => rawCompany.toLowerCase().includes(n)) ? rawCompany : null;
      const googleJobTitle = rawJobTitle && !SELF_NAMES.some(n => rawJobTitle.toLowerCase().includes(n)) ? rawJobTitle : null;
      const googleBio = person.biographies?.[0]?.value || null;

      const addr = person.addresses?.[0];
      const googleAddress = addr ? {
        streetAddress: addr.streetAddress,
        city: addr.city,
        region: addr.region,
        postalCode: addr.postalCode,
        country: addr.country,
      } : null;

      const birthdayObj = person.birthdays?.[0]?.date;
      const birthday = birthdayObj
        ? `${String(birthdayObj.month).padStart(2, "0")}-${String(birthdayObj.day).padStart(2, "0")}`
        : null;

      const anniversaryEvent = person.events?.find((e: any) => e.type === "anniversary");
      const anniversaryDate = anniversaryEvent?.date
        ? `${String(anniversaryEvent.date.month).padStart(2, "0")}-${String(anniversaryEvent.date.day).padStart(2, "0")}`
        : null;

      const googleUpdatedAt = person.metadata?.sources?.find(
        (s: any) => s.type === "CONTACT"
      )?.updateTime || null;
      const googleCreatedAt = googleUpdatedAt;

      const { data: existing } = await supabase
        .from("tom_contacts")
        .select("id, created_at, full_name, email, phone, company, job_title, notes, home_address, birthday, tom_ai_updated_at, google_resource_name")
        .eq("user_id", userId)
        .eq("google_resource_name", resourceName)
        .maybeSingle();

      let contactId: string = "";
      if (existing) {
        const tomUpdatedAt = existing.tom_ai_updated_at ? new Date(existing.tom_ai_updated_at) : null;
        const googleUpdatedDate = googleUpdatedAt ? new Date(googleUpdatedAt) : null;
        const googleShouldWin = googleUpdatedDate && (!tomUpdatedAt || googleUpdatedDate > tomUpdatedAt);

        if (googleShouldWin) {
          // Build phones array from all Google phones
          const phonesArray = person.phoneNumbers?.map((p: any) => ({
            number: fmtPhone(p.value),
            type: p.type === "mobile" ? "cell" : p.type === "work" ? "work" : "home",
            primary: false,
          })) || [];
          if (phonesArray.length > 0) phonesArray[0].primary = true;

          const updates: any = {
            last_synced_at: new Date().toISOString(),
            ...(allEmails.length > 0 && {
              all_emails: allEmails,
              email: allEmails[0],
            }),
            ...(phonesArray.length > 0 && {
              phones: phonesArray,
              all_phones: allPhones,
              phone: phonesArray[0]?.number || null,
            }),
            ...(googleCompany && { company: googleCompany }),
            ...(googleJobTitle && { job_title: googleJobTitle }),
            ...(googleAddress && { home_address: googleAddress }),
            ...(birthday && { birthday }),
            ...(fullName && { full_name: fullName }),
          };
          await supabase.from("tom_contacts").update(updates).eq("id", existing.id).eq("user_id", userId);
          google_wins++;
        } else {
          // Humble Hello wins — push our data back to Google, still sync arrays
          tom_wins++;
          const updates: any = {
            last_synced_at: new Date().toISOString(),
            ...(allEmails.length > 0 && { all_emails: allEmails }),
            ...(allPhones.length > 0 && { all_phones: allPhones }),
          };
          await supabase.from("tom_contacts").update(updates).eq("id", existing.id).eq("user_id", userId);
          try {
            await updateGoogleContact(accessToken, resourceName, {
              full_name: existing.full_name,
              email: existing.email,
              phone: existing.phone,
              company: existing.company,
              job_title: existing.job_title,
              notes: existing.notes,
              address: existing.home_address,
              birthday: existing.birthday,
            });
          } catch (e) {
            console.error("Push to Google failed:", e);
          }
        }

        contactId = existing.id;
      } else {
          const fixedName = fixReversedName(fullName, givenName, familyName);

          // Check blocklist + suppression list
          if (googleEmail) {
            const { contactImportGuard } = await import("@/app/lib/contactGuard");
            const guard = await contactImportGuard(userId, googleEmail.toLowerCase(), fixedName, "google_sync", { resourceName });
            if (guard !== "allow") continue;
          }

          // Check if contact already exists by email before inserting.
          // maybeSingle() returns no row when this email is already on more
          // than one contact, and the old code then inserted another copy.
          let existingByEmail: { id: string; phone?: string | null } | null = null;
          let emailAlreadyStored = false;
          if (googleEmail) {
            const emailMatch = await findContactsByEmail(supabase, userId, googleEmail);
            if (emailMatch.status === "one") existingByEmail = emailMatch.contact;
            else if (emailMatch.status === "many" || emailMatch.status === "error") emailAlreadyStored = true;
          }

        if (emailAlreadyStored) {
          console.warn(`Skipping Google insert; ${googleEmail} is already on more than one contact`);
          continue;
        }

        if (existingByEmail) {
          await supabase
            .from("tom_contacts")
            .update({
              google_resource_name: resourceName,
              last_synced_at: new Date().toISOString(),
              // Don't replace a phone Humble Hello already stored. Google can fill a blank.
              ...(googlePhone && !existingByEmail.phone && { phone: fmtPhone(googlePhone) }),
              ...(googleCompany && { company: googleCompany }),
              ...(googleJobTitle && { job_title: googleJobTitle }),
            })
            .eq("id", existingByEmail.id)
            .eq("user_id", userId);
          contactId = existingByEmail.id;
          google_wins++;
        } else {
          // Determine if this was manually created in Google
          // A contact is "manual" if it has a name but came from Google directly
          // (as opposed to being scanned from email signatures or calendar)
          const isManualContact = !!fixedName && (googlePhone || googleEmail);

          if (isManualContact) {
            // Auto-import directly — user manually created this, trust it
            const phonesArray = person.phoneNumbers?.map((p: any) => ({
              number: fmtPhone(p.value),
              type: p.type === "mobile" ? "cell" : p.type === "work" ? "work" : "home",
              primary: false,
            })) || [];
            if (phonesArray.length > 0) phonesArray[0].primary = true;

            const { data: newContact } = await supabase
              .from("tom_contacts")
              .insert({
                user_id: userId,
                full_name: fixedName,
                email: googleEmail || null,
                all_emails: allEmails.length > 0 ? allEmails : (googleEmail ? [googleEmail] : []),
                phone: googlePhone ? fmtPhone(googlePhone) : null,
                phones: phonesArray,
                all_phones: allPhones.length > 0 ? allPhones : (googlePhone ? [googlePhone] : []),
                company: googleCompany || null,
                job_title: googleJobTitle || null,
                home_address: googleAddress || null,
                notes: googleBio || null,
                birthday: birthday || null,
                google_resource_name: resourceName,
                last_synced_at: new Date().toISOString(),
                // High confidence since manually created
                relationship_strength: 65,
                relationship_health: "warm",
                manually_created: true,
                tier_override: false,
              })
              .select("id")
              .single();

            if (newContact) {
              contactId = newContact.id;
              synced++;
              console.log(`Auto-imported manual Google contact: ${fixedName}`);
            }
          } else {
            // Queue for approval — came from bulk/automated source
            await supabase
              .from("google_pending_contacts")
              .upsert({
                user_id: userId,
                full_name: fixedName,
                email: googleEmail,
                phone: googlePhone ? fmtPhone(googlePhone) : null,
                all_emails: allEmails.length > 0 ? allEmails : (googleEmail ? [googleEmail] : []),
                all_phones: allPhones.length > 0 ? allPhones : (googlePhone ? [googlePhone] : []),
                company: googleCompany,
                job_title: googleJobTitle,
                home_address: googleAddress,
                notes: googleBio,
                birthday,
                google_resource_name: resourceName,
              }, { onConflict: "user_id,google_resource_name" });
            synced++;
          }
        }
      }
      
      // ── Life events ──────────────────────────────────────────────────────
      if (birthday && contactId) {
        birthdays_found++;
        const { data: existingBday } = await supabase
          .from("life_events")
          .select("id")
          .eq("user_id", userId)
          .eq("contact_name", fullName)
          .eq("event_type", "Birthday")
          .maybeSingle();

        if (!existingBday) {
          await supabase.from("life_events").insert({
            user_id: userId,
            contact_name: fullName,
            event_type: "Birthday",
            event_date: `${new Date().getFullYear()}-${birthday}`,
            relationship_type: "contact",
            recurring: true,
            notes: "Synced from Google Contacts",
          });
          life_events_added++;
        }
      }

      if (anniversaryDate && contactId) {
        const { data: existingAnniv } = await supabase
          .from("life_events")
          .select("id")
          .eq("user_id", userId)
          .eq("contact_name", fullName)
          .eq("event_type", "Anniversary")
          .maybeSingle();

        if (!existingAnniv) {
          await supabase.from("life_events").insert({
            user_id: userId,
            contact_name: fullName,
            event_type: "Anniversary",
            event_date: `${new Date().getFullYear()}-${anniversaryDate}`,
            relationship_type: "contact",
            recurring: true,
            notes: "Synced from Google Contacts",
          });
          life_events_added++;
        }
      }
    }

    // Count total pending approvals
    const { count: pendingCount } = await supabase
      .from("google_pending_contacts")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);

    return NextResponse.json({
      synced,
      deleted,
      birthdays_found,
      life_events_added,
      google_wins,
      tom_wins,
      nextPageToken,
      has_more: !!nextPageToken,
      mode: progress.mode,
      restart_full: false,
      sync_token_saved: progress.finished && !!progress.syncToken,
      pending: pendingCount || 0,
    });
  } catch (e: any) {
    console.error("Google sync error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// WRITE: Push enriched data back to Google Contacts
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { contact_id, updates } = await req.json();
    const accessToken = await getValidAccessToken(userId);

     const { data: contact } = await supabase
      .from("tom_contacts")
      .select("google_resource_name, full_name, email")
      .eq("id", contact_id)
      .eq("user_id", userId)
      .single();

    if (!contact?.google_resource_name) {
      return NextResponse.json({ error: "No Google resource name found" }, { status: 404 });
    }

    const getRes = await fetch(
      `https://people.googleapis.com/v1/${contact.google_resource_name}?personFields=names,emailAddresses,phoneNumbers,birthdays,addresses,organizations`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const current = await getRes.json();
    const etag = current.etag;

    const updateBody: any = { etag };
    const fields: string[] = [];

    if (updates.birthday) {
      const [month, day] = updates.birthday.split("-");
      updateBody.birthdays = [{ date: { month: parseInt(month), day: parseInt(day) } }];
      fields.push("birthdays");
    }

    if (updates.address) {
      updateBody.addresses = [{
        streetAddress: updates.address.streetAddress,
        city: updates.address.city,
        region: updates.address.region,
        postalCode: updates.address.postalCode,
        country: updates.address.country || "US",
        type: "home",
      }];
      fields.push("addresses");
    }

    if (updates.phone) {
      updateBody.phoneNumbers = [{ value: updates.phone, type: "mobile" }];
      fields.push("phoneNumbers");
    }

    if (fields.length === 0) {
      return NextResponse.json({ message: "Nothing to update" });
    }

    const updateRes = await fetch(
      `https://people.googleapis.com/v1/${contact.google_resource_name}:updateContact?updatePersonFields=${fields.join(",")}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updateBody),
      }
    );

    if (!updateRes.ok) {
      const err = await updateRes.json();
      return NextResponse.json({ error: err }, { status: 400 });
    }

    return NextResponse.json({ success: true, updated_fields: fields });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE: Remove contact from Google Contacts + Supabase
export async function DELETE(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const contact_id = searchParams.get("contact_id");
    if (!contact_id) return NextResponse.json({ error: "Missing contact_id" }, { status: 400 });

    const accessToken = await getValidAccessToken(userId);

    const { data: contact } = await supabase
      .from("tom_contacts")
      .select("google_resource_name, full_name, email")
      .eq("id", contact_id)
      .eq("user_id", userId)
      .single();

   if (contact?.google_resource_name) {
      await fetch(
        `https://people.googleapis.com/v1/${contact.google_resource_name}:deleteContact`,
        { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } }
      );
    }

     // Record deletion to prevent re-import from inbox scanner
    if (contact?.email) {
      await supabase
        .from("tom_deleted_contacts")
        .upsert({ 
          user_id: userId, 
          email: contact.email,
          google_resource_name: contact.google_resource_name || null,
          deleted_at: new Date().toISOString() 
        }, { onConflict: "user_id,email" });

      const { recordContactDeletion } = await import("@/app/lib/contactGuard");
      await recordContactDeletion(userId, contact.email, contact.full_name);
    }

    // Always delete from Supabase regardless of Google result
    await supabase
      .from("tom_contacts")
      .delete()
      .eq("id", contact_id)
      .eq("user_id", userId);

    return NextResponse.json({ success: true, deleted: contact?.full_name });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}