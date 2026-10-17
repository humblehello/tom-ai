import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { checkFeature } from "@/app/lib/requireFeature";
import { createClient } from "@supabase/supabase-js";
import { createGoogleContact } from "../../../lib/googleContacts";
import { getValidAccessToken } from "../../../lib/google";
import { inngest } from "../../../lib/inngest";
import { findContactsByEmail, findContactsByName } from "../../../lib/contact-dedupe";

export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("tom_session")?.value || null;
}

// ── VCF Parser ───────────────────────────────────────────────────────────────
function parseVCF(text: string): any[] {
  const contacts: any[] = [];
  const cards = text.split(/BEGIN:VCARD/i).filter(c => c.trim());

  for (const card of cards) {
    const contact: any = {};
    const lines = card.split(/\r?\n/);

    for (const line of lines) {
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).toUpperCase().split(";")[0];
      const value = line.slice(colonIdx + 1).trim();
      if (!value) continue;

      if (key === "FN") contact.full_name = value;
      else if (key === "EMAIL") contact.email = contact.email || value;
      else if (key === "TEL") contact.phone = contact.phone || value;
      else if (key === "ORG") contact.company = value.split(";")[0];
      else if (key === "TITLE") contact.job_title = value;
      else if (key === "NOTE") contact.notes = value;
      else if (key === "BDAY") contact.birthday = value;
      else if (key === "ADR") {
        const parts = value.split(";");
        contact.home_address = {
          streetAddress: parts[2] || "",
          city: parts[3] || "",
          region: parts[4] || "",
          postalCode: parts[5] || "",
          country: parts[6] || "",
        };
      }
    }

    if (contact.full_name || contact.email) contacts.push(contact);
  }

  return contacts;
}

// ── Claude text parser (CSV / TXT / Excel text) ──────────────────────────────
async function parseTextWithClaude(text: string): Promise<any[]> {
  const rows = text.trim().split(/\r?\n/);
  if (rows.length === 0) return [];

  const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      messages: [{
        role: "user",
        content: `Parse this contact data and return a JSON array of contacts.

Map whatever columns or fields exist to:
- full_name (combine first + last if separate)
- email (primary email)
- phone (primary phone)
- company
- job_title
- notes
- birthday (YYYY-MM-DD if possible)
- home_address (object: streetAddress, city, region, postalCode, country)

Rules:
- Skip rows with no name AND no email
- Combine first/last name columns if separate
- Return ONLY valid JSON array, no markdown
- If no valid contacts return []

Data:
${rows.join("\n")}`,
      }],
    }),
  });

  const data = await claudeRes.json();
  const raw = data.content?.[0]?.text || "[]";
  try {
    return JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    return [];
  }
}

// ── Claude Vision parser (images — business cards, screenshots) ──────────────
async function parseImageWithClaude(base64: string, mimeType: string): Promise<any[]> {
  const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mimeType, data: base64 },
          },
          {
            type: "text",
            text: `Extract all contact information from this image (business card, screenshot, photo, etc).

Return a JSON array with these fields for each person found:
- full_name
- email
- phone
- company
- job_title
- notes (anything else relevant)
- home_address (object: streetAddress, city, region, postalCode, country)
- website

Rules:
- Extract every person visible
- Return ONLY valid JSON array, no markdown
- If no contacts found return []
- Do not guess or invent information not visible in the image`,
          },
        ],
      }],
    }),
  });

  const data = await claudeRes.json();
  const raw = data.content?.[0]?.text || "[]";
  try {
    return JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    return [];
  }
}

// ── Save contact to Supabase + Google ────────────────────────────────────────
async function saveContact(contact: any, userId: string, accessToken: string | null): Promise<"imported" | "skipped" | "error"> {
  if (!contact.full_name?.trim()) return "skipped";

  try {
    // Check for existing contact — merge if found.
    // An ambiguous or failed lookup must not insert another copy.
    if (contact.email) {
      const found = await findContactsByEmail(supabase, userId, contact.email.trim());
      if (found.status === "many" || found.status === "error") return "skipped";
      const existing = found.status === "one" ? found.contact : null;

      if (existing) {
        // Merge — fill in missing fields only
        const patch: any = {};
        if (!existing.phone && contact.phone) patch.phone = contact.phone;
        if (!existing.company && contact.company) patch.company = contact.company;
        if (!existing.job_title && contact.job_title) patch.job_title = contact.job_title;
        if (!existing.birthday && contact.birthday) patch.birthday = contact.birthday;
        if (!existing.home_address && contact.home_address) patch.home_address = contact.home_address;

        if (Object.keys(patch).length > 0) {
          await supabase.from("tom_contacts").update(patch).eq("id", existing.id).eq("user_id", userId);
          return "imported"; // count as imported since we updated something
        }
        return "skipped";
      }
    }

    // Deduplicate by name if no email. Two existing rows means "already stored", not "insert a third".
    if (!contact.email) {
      const found = await findContactsByName(supabase, userId, contact.full_name.trim());
      if (found.status !== "none") return "skipped";
    }

    // Insert to Supabase
    const { data: newContact, error } = await supabase
      .from("tom_contacts")
      .insert({
        user_id: userId,
        full_name: contact.full_name.trim(),
        email: contact.email?.toLowerCase().trim() || null,
        phone: contact.phone || null,
        company: contact.company || null,
        job_title: contact.job_title || null,
        notes: contact.notes || null,
        birthday: contact.birthday || null,
        home_address: contact.home_address || null,
        last_synced_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error || !newContact) return "error";

    // Create in Google Contacts so it syncs to phone
    if (accessToken) {
      try {
        const googleResourceName = await createGoogleContact(accessToken, {
          full_name: newContact.full_name,
          email: newContact.email,
          phone: newContact.phone,
          address: newContact.home_address,
          company: newContact.company,
          job_title: newContact.job_title,
        });

        if (googleResourceName) {
          await supabase
            .from("tom_contacts")
            .update({ google_resource_name: googleResourceName })
            .eq("id", newContact.id)
            .eq("user_id", userId);
        }
      } catch (e) {
        console.error("Google Contact creation failed for hopper contact:", e);
      }
    }

    return "imported";
  } catch (e) {
    console.error("Save contact error:", e);
    return "error";
  }
}

// ── Main Route ───────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const block = await checkFeature("hopper_imports");
  if (block) return block;

  try {
    const formData = await req.formData();
    const files = formData.getAll("files") as File[];

    if (!files.length) return NextResponse.json({ error: "No files provided" }, { status: 400 });

    // Get Google access token once
    let accessToken: string | null = null;
    try { accessToken = await getValidAccessToken(userId); } catch {}
const allContacts: any[] = [];

    for (const file of files) {
      const name = file.name.toLowerCase();
      const buffer = await file.arrayBuffer();

      let parsedContacts: any[] = [];

      if (name.endsWith(".vcf")) {
        const text = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
        parsedContacts = parseVCF(text);

} else if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
        const XLSX = require("xlsx");
        const workbook = XLSX.read(buffer, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });
        for (const row of rows) {
          const firstName = String(row["First Name"] || row["Given Name"] || "");
          const lastName = String(row["Last Name"] || row["Family Name"] || "");
          const fullName = (row["Name"] || `${firstName} ${lastName}`).trim();
          const email = String(row["E-mail 1 - Value"] || row["E-mail"] || row["Email"] || "").toLowerCase().trim();
          const phone = String(row["Phone 1 - Value"] || row["Phone"] || "");
          const company = String(row["Organization Name"] || row["Organization 1 - Name"] || row["Company"] || "");
          const jobTitle = String(row["Organization Title"] || row["Organization 1 - Title"] || row["Job Title"] || "");
          const street = String(row["Address 1 - Street"] || "");
          const city = String(row["Address 1 - City"] || "");
          const region = String(row["Address 1 - Region"] || "");
          const postalCode = String(row["Address 1 - Postal Code"] || "");
          const country = String(row["Address 1 - Country"] || "");
          const birthday = String(row["Birthday"] || "");
          if (!fullName && !email) continue;
          parsedContacts.push({
            full_name: fullName || email,
            email: email || null,
            phone: phone || null,
            company: company || null,
            job_title: jobTitle || null,
            birthday: birthday || null,
            home_address: (city || street) ? { streetAddress: street, city, region, postalCode, country } : null,
          });
        }

      } else if (name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".png") || name.endsWith(".gif") || name.endsWith(".webp") || name.endsWith(".heic")) {
        const base64 = Buffer.from(buffer).toString("base64");
        const mimeType = name.endsWith(".png") ? "image/png" : name.endsWith(".gif") ? "image/gif" : name.endsWith(".webp") ? "image/webp" : "image/jpeg";
        parsedContacts = await parseImageWithClaude(base64, mimeType);

      } else if (name.endsWith(".csv")) {
        const text = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
        const lines = text.trim().split(/\r?\n/);
        const headers = lines[0].split(",").map(h => h.replace(/"/g, "").trim());
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(",").map(v => v.replace(/"/g, "").trim());
          const row: any = {};
          headers.forEach((h, idx) => { row[h] = values[idx] || ""; });
          const firstName = row["First Name"] || row["Given Name"] || "";
          const lastName = row["Last Name"] || row["Family Name"] || "";
          const fullName = (row["full_name"] || row["Name"] || `${firstName} ${lastName}`).trim();
          const email = row["email"] || row["E-mail 1 - Value"] || row["Email"] || "";
          const phone = row["phone"] || row["Phone 1 - Value"] || row["Phone"] || "";
          const company = row["company"] || row["Organization Name"] || row["Company"] || "";
          const jobTitle = row["job_title"] || row["Organization Title"] || row["Job Title"] || "";
          const street = row["street"] || row["Address 1 - Street"] || "";
          const city = row["city"] || row["Address 1 - City"] || "";
          const region = row["region"] || row["Address 1 - Region"] || "";
          const postalCode = row["postal_code"] || row["Address 1 - Postal Code"] || "";
          const country = row["country"] || row["Address 1 - Country"] || "";
          const birthday = row["birthday"] || row["Birthday"] || "";
          const notes = row["notes"] || row["Notes"] || "";
          if (!fullName && !email) continue;
          parsedContacts.push({
            full_name: fullName || email,
            email: email?.toLowerCase().trim() || null,
            phone: phone || null,
            company: company || null,
            job_title: jobTitle || null,
            birthday: birthday || null,
            notes: notes || null,
            home_address: (city || street) ? { streetAddress: street, city, region, postalCode, country } : null,
          });
        }

      } else {
        const text = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
        parsedContacts = await parseTextWithClaude(text);
      }

      allContacts.push(...parsedContacts);
    }

    // Fire Inngest for background processing
    await inngest.send({
      name: "tom/hopper.import",
      data: { userId, contacts: allContacts },
    });

    return NextResponse.json({
      ok: true,
      queued: allContacts.length,
      message: `Processing ${allContacts.length} contacts in the background.`,
    });

  } catch (err: any) {
    console.error("Hopper error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}