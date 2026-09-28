import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { emailTakenBySomeoneElse, insertContact, selectContacts, updateContact, withHumanStamp } from "../../../lib/contactWrite";
import { getValidAccessToken } from "@/app/lib/google";
import { inngest } from "@/app/lib/inngest";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("tom_session")?.value || null;
}

async function pushToGoogleContacts(
  accessToken: string,
  googleResourceName: string,
  updates: { notes?: string; company?: string; jobTitle?: string; phone?: string; }
): Promise<boolean> {
  try {
    const getRes = await fetch(
      `https://people.googleapis.com/v1/${googleResourceName}?personFields=names,emailAddresses,phoneNumbers,biographies,organizations`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const current = await getRes.json();
    if (!current.etag) return false;
    const updateBody: any = { etag: current.etag };
    const fields: string[] = [];
    if (updates.notes) { updateBody.biographies = [{ value: updates.notes, contentType: "TEXT_PLAIN" }]; fields.push("biographies"); }
    if (updates.company || updates.jobTitle) { updateBody.organizations = [{ name: updates.company || current.organizations?.[0]?.name || "", title: updates.jobTitle || current.organizations?.[0]?.title || "" }]; fields.push("organizations"); }
    if (updates.phone) { updateBody.phoneNumbers = [{ value: updates.phone, type: "mobile" }]; fields.push("phoneNumbers"); }
    if (fields.length === 0) return false;
    const updateRes = await fetch(
      `https://people.googleapis.com/v1/${googleResourceName}:updateContact?updatePersonFields=${fields.join(",")}`,
      { method: "PATCH", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(updateBody) }
    );
    return updateRes.ok;
  } catch (e) {
    console.error("Google Contacts push error:", e);
    return false;
  }
}

const LIFE_EVENT_KEYWORDS: Record<string, string> = {
  new_pet: "new pet|new dog|new cat|new puppy|new kitten|adopted a dog|adopted a cat|got a dog|got a cat",
  new_baby: "new baby|had a baby|newborn|just had|gave birth|baby boy|baby girl",
  pregnancy: "pregnant|expecting|baby on the way",
  wedding: "got married|just married|wedding|tied the knot",
  engagement: "got engaged|engagement|proposed|said yes",
  new_home: "new home|bought a house|new house|closing on",
  moving: "moving|moved|new place|new apartment",
  graduation: "graduated|graduation|finished school|got my degree",
  retirement: "retiring|retired|retirement",
  promotion: "promoted|new role|just got promoted|new title",
  new_job: "new job|starting at|joined|new position",
  acquisition: "acquired|acquisition|bought by|merger",
  funding_round: "raised|funding|series a|series b|investment round",
  award_won: "won an award|best places to work|innovator|40 under 40|recognized",
  major_deal: "closed a deal|big win|landed|signed a contract",
  cancer_free: "cancer free|in remission|beat cancer|clear scans|no evidence",
  marathon_completed: "finished the marathon|ran a marathon|completed the race",
  health_milestone: "sober|sobriety|recovery|overcame|beat",
  made_a_purchase: "bought from me|purchased from me|ordered from me|placed an order|became a customer|signed up|paid for|invoice paid|paid invoice",
};

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { contacts } = await req.json();
    if (!contacts || contacts.length === 0) {
      return NextResponse.json({ error: "No contacts to save" }, { status: 400 });
    }

    let accessToken: string | null = null;
    try { accessToken = await getValidAccessToken(userId); } catch (e) { console.error("Could not get access token:", e); }

    let saved = 0, updated = 0, created = 0, googleUpdated = 0;
    const results: any[] = [];

    for (const contact of contacts) {
      if (!contact.full_name) continue;

      // ── Find existing contact ────────────────────────────────────────────
      // Email, or an exact full name. First-name and fuzzy matches were
      // writing one person's email and phone onto a different person.
      let existing = null;
      let matchedBy: "email" | "name" | null = null;
      const journalSelect = "id, google_resource_name, key_context, notes, journal_signals, email";

      if (contact.email) {
        const { data } = await selectContacts(supabase, journalSelect, (query) =>
          query.eq("user_id", userId).ilike("email", contact.email).limit(2)
        );
        if ((data || []).length === 1) {
          existing = data[0];
          matchedBy = "email";
        } else if ((data || []).length > 1) {
          continue;
        }
      }
      if (!existing && contact.full_name) {
        const { data } = await selectContacts(supabase, journalSelect, (query) =>
          query.eq("user_id", userId).ilike("full_name", contact.full_name).limit(2)
        );
        if ((data || []).length === 1) {
          existing = data[0];
          matchedBy = "name";
        }
      }

      if (
        existing &&
        matchedBy === "name" &&
        existing.email &&
        contact.email &&
        existing.email.toLowerCase() !== contact.email.toLowerCase()
      ) {
        continue;
      }

      // ── Build signals and notes ──────────────────────────────────────────
      const newSignal = { date: new Date().toISOString(), relationship_type: contact.relationship_type, confidence: contact.confidence, how_they_met: contact.how_they_met, current_status: contact.current_status, shared_history: contact.shared_history, wants_to_reconnect: contact.wants_to_reconnect, notes: contact.notes, source: "journal_conversation" };
      const updatedSignals = [...(existing?.journal_signals || []), newSignal];
      const enrichedNotes = [existing?.notes, contact.notes, contact.how_they_met ? `How we met: ${contact.how_they_met}` : null, contact.shared_history?.length ? `Shared history: ${contact.shared_history.join(", ")}` : null, contact.wants_to_reconnect ? "Wants to reconnect." : null].filter(Boolean).join("\n");
      const keyContext = contact.key_context || existing?.key_context || "";

      // ── Build contact data ───────────────────────────────────────────────
      const contactData: any = { user_id: userId, journal_signals: updatedSignals, last_synced_at: new Date().toISOString() };
      if (contact.full_name) contactData.full_name = contact.full_name;
      if (contact.email) contactData.email = contact.email;
      if (contact.phone) contactData.phone = contact.phone;
      if (contact.company) contactData.company = contact.company;
      if (contact.job_title) contactData.job_title = contact.job_title;
      if (enrichedNotes) contactData.notes = enrichedNotes;
      if (keyContext) contactData.key_context = keyContext;
      if (contact.topics?.length) contactData.topics = contact.topics;
      if (contact.city) contactData.home_address = { city: contact.city };

      const shouldApply = contact.is_explicit_statement === true || contact.confidence >= 70;
      if (shouldApply) {
        contactData.relationship_type = contact.relationship_type;
        contactData.relationship_strength = contact.relationship_strength;
        contactData.classifier_confidence = contact.is_explicit_statement ? 100 : contact.confidence;
        contactData.last_classified_at = new Date().toISOString();
        if (contact.relationship_tag) contactData.relationship_tag = contact.relationship_tag;
        if (contact.bucket) {
          contactData.bucket = contact.bucket;
        } else if (contact.relationship_type) {
          const personalTypes = ["friend", "close_friend", "family"];
          const professionalTypes = ["customer", "vendor", "colleague", "client"];
          if (personalTypes.includes(contact.relationship_type)) contactData.bucket = "personal";
          else if (professionalTypes.includes(contact.relationship_type)) contactData.bucket = "professional";
        }
        // Assign dunbar_bucket directly — never use bucket column
        if (contact.bucket) {
          contactData.dunbar_bucket = [contact.bucket];
        } else if (contact.relationship_type) {
          const personalTypes = ["friend", "close_friend", "family"];
          const professionalTypes = ["customer", "vendor", "colleague", "client"];
          if (personalTypes.includes(contact.relationship_type)) {
            contactData.dunbar_bucket = ["personal"];
          } else if (professionalTypes.includes(contact.relationship_type)) {
            contactData.dunbar_bucket = ["professional"];
          }
        }
        if (contact.dunbar_tier) {
          contactData.dunbar_tier = contact.dunbar_tier;
          if (contact.is_explicit_statement || contact.dunbar_tier <= 2) { contactData.tier_override = true; contactData.relationship_override = true; }
        }
        contactData.journal_classified = true;
      }

      contactData.last_meaningful_touch_at = new Date().toISOString();

      // ── Merge tags and intelligence ──────────────────────────────────────
      if (existing && (contact.tags?.length > 0 || contact.intelligence)) {
        const { data: dbContact } = await supabase.from("tom_contacts").select("tags, intelligence").eq("id", existing.id).single();
        const existingTags = dbContact?.tags || [];
        const newTags = contact.tags || [];
        const mergedTags = [...existingTags];
        for (const t of newTags) {
          const idx = mergedTags.findIndex((e: any) => e.tag === t.tag);
          if (idx >= 0) { if (t.confidence > mergedTags[idx].confidence) mergedTags[idx] = t; }
          else mergedTags.push(t);
        }
        const intel = contact.intelligence || {};
        if (intel.sports?.plays?.length) {
          for (const sport of intel.sports.plays) {
            const tag = { tag: "plays_sport", value: sport, confidence: 90, source: "journal" };
            if (!mergedTags.find((t: any) => t.tag === "plays_sport" && t.value === sport)) mergedTags.push(tag);
          }
        }
        if (intel.pets?.length) {
          for (const pet of intel.pets) {
            const petVal = [pet.name, pet.breed, pet.type].filter(Boolean).join(" ");
            const tag = { tag: "has_pet", value: petVal, confidence: 90, source: "journal" };
            if (!mergedTags.find((t: any) => t.tag === "has_pet" && t.value === petVal)) mergedTags.push(tag);
          }
        }
        if (intel.family?.spouse) {
          const tag = { tag: "married", value: `spouse: ${intel.family.spouse}`, confidence: 95, source: "journal" };
          if (!mergedTags.find((t: any) => t.tag === "married")) mergedTags.push(tag);
        }
        const mergedIntel = mergeDeep(dbContact?.intelligence || {}, intel);
        contactData.tags = mergedTags;
        contactData.intelligence = mergedIntel;
      } else if (!existing && contact.tags?.length) {
        contactData.tags = contact.tags;
        contactData.intelligence = contact.intelligence || {};
      }

      // ── Save to Supabase ─────────────────────────────────────────────────
      if (contactData.email) {
        const decision = await emailTakenBySomeoneElse(
          supabase,
          userId,
          contactData.email,
          existing?.id,
          contactData.full_name || existing?.full_name
        );
        if (decision === "reject") delete contactData.email;
      }
      const stamped = withHumanStamp(existing?.field_provenance, contactData);
      if (existing) {
        await updateContact(supabase, existing.id, userId, stamped);
        updated++;
      } else {
        await insertContact(supabase, stamped);
        created++;
      }

      // ── Detect life events and fire Inngest ──────────────────────────────
      const intelligenceSignals = [
        ...(contact.intelligence?.life_events || []),
        ...(contact.intelligence?.pets?.map((p: any) => `new pet ${p.type} ${p.name}`).filter(Boolean) || []),
      ].join(" ");
      const signalText = [contact.notes, contact.key_context, intelligenceSignals].filter(Boolean).join(" ").toLowerCase();
      if (existing?.id && signalText) {
        for (const [eventType, keywords] of Object.entries(LIFE_EVENT_KEYWORDS)) {
          const keywordList = keywords.split("|");
          if (keywordList.some(kw => signalText.includes(kw))) {
            const { data: existingEvent } = await supabase.from("life_events").select("id").eq("user_id", userId).eq("contact_id", existing.id).eq("event_type", eventType).maybeSingle();
            if (!existingEvent) {
              const { data: newEvent } = await supabase.from("life_events").insert({
                user_id: userId,
                contact_id: existing.id,
                contact_name: contact.full_name,
                event_type: eventType,
                event_date: new Date().toISOString(),
                source: "journal",
                detected_at: new Date().toISOString(),
                raw_signal: signalText.slice(0, 200),
              }).select().single();
              if (newEvent) {
                await inngest.send({
                  name: "tom/life-event.detected",
                  data: { user_id: userId, contact_id: existing.id, contact_name: contact.full_name, event_type: eventType, raw_signal: signalText.slice(0, 200), life_event_id: newEvent.id },
                });
                console.log(`Life event detected: ${eventType} for ${contact.full_name}`);
              }
            }
            break;
          }
        }
      }

      // ── Push to Google Contacts ──────────────────────────────────────────
      const resourceName = existing?.google_resource_name;
      if (resourceName && accessToken) {
        const googleNotes = [keyContext, contact.notes, contact.how_they_met ? `How we met: ${contact.how_they_met}` : null, contact.shared_history?.length ? `Shared history: ${contact.shared_history.join(", ")}` : null, `Relationship: ${contact.relationship_type?.replace("_", " ")}`, contact.wants_to_reconnect ? "Wants to reconnect." : null, `Last updated by Humble Hello: ${new Date().toLocaleDateString()}`].filter(Boolean).join("\n");
        const pushed = await pushToGoogleContacts(accessToken, resourceName, { notes: googleNotes, company: contact.company, jobTitle: contact.job_title, phone: contact.phone });
        if (pushed) googleUpdated++;
      }

      saved++;
      results.push({ name: contact.full_name, action: existing ? "updated" : "created", google_synced: !!resourceName && !!accessToken, confidence: contact.confidence, relationship_type: contact.relationship_type });
    }

    return NextResponse.json({ success: true, saved, created, updated, google_updated: googleUpdated, results });

  } catch (e: any) {
    console.error("Journal extract error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

function mergeDeep(existing: any, incoming: any): any {
  if (!incoming) return existing;
  const result = { ...existing };
  for (const key of Object.keys(incoming)) {
    if (incoming[key] === null || incoming[key] === undefined) continue;
    if (Array.isArray(incoming[key])) {
      if (!Array.isArray(result[key]) || result[key].length === 0) result[key] = incoming[key];
      else {
        const merged = [...result[key]];
        for (const item of incoming[key]) {
          if (typeof item === "string" && !merged.includes(item)) merged.push(item);
          else if (typeof item === "object") merged.push(item);
        }
        result[key] = merged;
      }
    } else if (typeof incoming[key] === "object") {
      result[key] = mergeDeep(result[key] || {}, incoming[key]);
    } else {
      if (!result[key]) result[key] = incoming[key];
    }
  }
  return result;
}