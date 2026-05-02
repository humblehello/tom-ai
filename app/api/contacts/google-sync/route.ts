import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getValidAccessToken } from "@/app/lib/google";
import { updateGoogleContact } from "@/app/lib/googleContacts";

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
    const accessToken = await getValidAccessToken(userId);

    // Get stored sync token for this user
    const { data: userData } = await supabase
      .from("tom_users")
      .select("google_sync_token")
      .eq("id", userId)
      .single();

    const storedSyncToken = userData?.google_sync_token || null;
    const pageToken = searchParams.get("pageToken") || undefined;

    // Build request URL — use syncToken if available for delta sync
    const url = new URL("https://people.googleapis.com/v1/people/me/connections");
    url.searchParams.set(
      "personFields",
      "names,emailAddresses,phoneNumbers,birthdays,events,addresses,organizations,biographies,metadata"
    );
    url.searchParams.set("pageSize", "100");

    // If we have a sync token and no pageToken, use delta sync
    // Delta sync only returns changed/deleted contacts since last sync
    if (storedSyncToken && !pageToken) {
      url.searchParams.set("syncToken", storedSyncToken);
      url.searchParams.set("requestSyncToken", "true");
    } else {
      // Full sync — request a new sync token at the end
      url.searchParams.set("requestSyncToken", "true");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
    }

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    // Sync token can become invalid — fall back to full sync
    if (res.status === 410) {
      console.log("Sync token expired, falling back to full sync");
      await supabase
        .from("tom_users")
        .update({ google_sync_token: null })
        .eq("id", userId);

      return NextResponse.json({
        synced: 0,
        deleted: 0,
        nextPageToken: null,
        has_more: false,
        sync_token_expired: true,
        message: "Sync token expired — full sync will run on next call",
      });
    }

    const data = await res.json();
    const contacts = data.connections || [];
    const nextPageToken = data.nextPageToken || null;
    const newSyncToken = data.nextSyncToken || null;

    // Save new sync token when we reach the last page
    if (newSyncToken && !nextPageToken) {
      await supabase
        .from("tom_users")
        .update({ google_sync_token: newSyncToken })
        .eq("id", userId);
    }

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

// Skip obvious spam/newsletter contacts
const BLOCKED_LOCAL_PARTS = new Set([
  "noreply","no-reply","donotreply","do-not-reply",
  "notifications","notification","notify",
  "mailer","mailer-daemon","postmaster","bounce","bounces",
  "support","help","helpdesk",
  "info","information",
  "hello","hi",
  "team","teams",
  "admin","administrator",
  "contact","contacts",
  "sales","marketing",
  "newsletter","newsletters",
  "updates","update",
  "alerts","alert",
  "billing","invoice","invoices","payments","receipts",
  "communication","communications",
  "ap","ar","accounting",
  "careers","jobs","hiring",
  "unsubscribe","optout",
  "automated","automate","automatic",
  "system","robot","bot","notetaker",
  "jobalert", "fyxer", "sales", "customer"
]);

const BLOCKED_DOMAINS = [
  "stripe.com","mailchimp.com","sendgrid.net","constantcontact.com",
  "shared1.ccsend.com","scoop.","amazonses.com","hubspot.com", 
];

const isJunk = (() => {
  if (!googleEmail) return false;
  const lower = googleEmail.toLowerCase();
  const atIndex = lower.indexOf("@");
  if (atIndex === -1) return false;
  const local = lower.slice(0, atIndex);
  const domain = lower.slice(atIndex + 1);
  if (BLOCKED_LOCAL_PARTS.has(local)) return true;
  if (local.startsWith("noreply") || local.startsWith("no_reply") || local.startsWith("donotreply") || local.startsWith("bounce") || local.startsWith("mailer")) return true;
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

          // Check if contact already exists by email before inserting
          let existingByEmail = null;
          if (googleEmail) {
          const { data: emailMatch } = await supabase
            .from("tom_contacts")
            .select("id, google_resource_name")
            .eq("user_id", userId)
            .ilike("email", googleEmail)
            .maybeSingle();
          existingByEmail = emailMatch;
        }

        if (existingByEmail) {
          await supabase
            .from("tom_contacts")
            .update({
              google_resource_name: resourceName,
              last_synced_at: new Date().toISOString(),
              ...(googlePhone && { phone: fmtPhone(googlePhone) }),
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
      sync_token_saved: !!(newSyncToken && !nextPageToken),
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