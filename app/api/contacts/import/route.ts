import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("tom_session")?.value || null;
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const fileName = file.name.toLowerCase();
    const isImage = /\.(jpg|jpeg|png|webp|gif|heic)$/i.test(fileName);
    const isCSV = fileName.endsWith(".csv");
    const isExcel = fileName.endsWith(".xlsx") || fileName.endsWith(".xls");

    if (!isImage && !isCSV && !isExcel) {
      return NextResponse.json({ error: "Unsupported file type. Drop in a CSV, Excel, or image file." }, { status: 400 });
    }

    let contacts: any[] = [];
    let summary = "";
    let mapping: Record<string, string> = {};

    // ── IMAGE PATH (Vision) ──────────────────────────────────────────────────
    if (isImage) {
      const buffer = await file.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");
      const mediaType = fileName.endsWith(".png") ? "image/png" :
                        fileName.endsWith(".webp") ? "image/webp" :
                        fileName.endsWith(".gif") ? "image/gif" : "image/jpeg";

      const visionRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
  "Content-Type": "application/json",
  "x-api-key": process.env.ANTHROPIC_API_KEY!,
  "anthropic-version": "2023-06-01",
},
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2000,
          messages: [{
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mediaType, data: base64 }
              },
              {
                type: "text",
                text: `Extract all contact information from this image. This could be an email signature, business card, LinkedIn profile, website team page, or any image containing people's contact info.

Extract every person you can find and return ONLY a JSON object like:
{
  "summary": "one sentence describing what you found (e.g. 'Email signature for John Smith, VP at Acme Corp')",
  "contacts": [
    {
      "full_name": "",
      "first_name": "",
      "last_name": "",
      "email": "",
      "phone": "",
      "company": "",
      "job_title": "",
      "website": "",
      "linkedin": "",
      "address": "",
      "notes": "any other relevant info"
    }
  ]
}

Only include fields that are actually present in the image. If no contact info is found, return an empty contacts array.`
              }
            ]
          }]
        }),
      });

      const visionData = await visionRes.json();
      const rawText = visionData.content?.[0]?.text || "{}";
      const clean = rawText.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      contacts = parsed.contacts || [];
      summary = parsed.summary || "Image processed";
      mapping = { "Vision extraction": "auto-detected" };

    // ── FILE PATH (CSV/Excel) ────────────────────────────────────────────────
    } else {
      let rows: Record<string, string>[] = [];

      if (isCSV) {
        const text = await file.text();
        rows = parseCSV(text);
      } else {
        const buffer = await file.arrayBuffer();
        rows = await parseExcel(buffer);
      }

      if (rows.length === 0) return NextResponse.json({ error: "No data found in file" }, { status: 400 });

      const headers = Object.keys(rows[0]);
      const sample = rows.slice(0, 5);

      const mappingRes = await fetch("https://api.anthropic.com/v1/messages", {
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
            content: `You are a data mapping assistant. Map these CSV/Excel columns to contact fields.

Headers: ${JSON.stringify(headers)}
Sample rows: ${JSON.stringify(sample)}

Map each column to one of these fields (null if no match):
first_name, last_name, full_name, email, phone, company, job_title, annual_spend, has_web_store, customer_since, address, notes, website, custom_fields

Respond ONLY with JSON:
{
  "mapping": { "COLUMN_HEADER": "field_name" },
  "summary": "one sentence describing what this file contains"
}`
          }]
        }),
      });

      const mappingData = await mappingRes.json();
      const rawText = mappingData.content?.[0]?.text || "{}";
      const clean = rawText.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      mapping = parsed.mapping || {};
      summary = parsed.summary || "File processed";

      const getValue = (row: Record<string, string>, fieldName: string) => {
        const col = Object.entries(mapping).find(([_, v]) => v === fieldName)?.[0];
        return col ? (row[col] || "").trim() : "";
      };

      contacts = rows.map(row => {
        const firstName = getValue(row, "first_name");
        const lastName = getValue(row, "last_name");
        const customFields: Record<string, string> = {};

        Object.entries(mapping).forEach(([col, field]) => {
          if (["custom_fields", "annual_spend", "has_web_store", "customer_since"].includes(field)) {
            if (row[col]) customFields[col] = row[col];
          }
        });

        return {
          full_name: getValue(row, "full_name") || [firstName, lastName].filter(Boolean).join(" ") || null,
          email: getValue(row, "email")?.toLowerCase() || null,
          phone: getValue(row, "phone") || null,
          company: getValue(row, "company") || null,
          job_title: getValue(row, "job_title") || null,
          notes: getValue(row, "notes") || null,
          address: getValue(row, "address") || null,
          custom_fields: customFields,
        };
      });
    }

    // ── UPSERT CONTACTS ──────────────────────────────────────────────────────
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const contact of contacts) {
      if (!contact.email && !contact.full_name) { skipped++; continue; }

      let existing = null;

      if (contact.email) {
        const { data } = await supabase
          .from("tom_contacts")
          .select("id, import_attributes")
          .eq("user_id", userId)
          .eq("email", contact.email)
          .maybeSingle();
        existing = data;
      }

      if (!existing && contact.full_name) {
        const { data } = await supabase
          .from("tom_contacts")
          .select("id, import_attributes")
          .eq("user_id", userId)
          .ilike("full_name", contact.full_name)
          .maybeSingle();
        existing = data;
      }

      const contactData: any = {
        user_id: userId,
        last_synced_at: new Date().toISOString(),
        import_attributes: {
          ...(existing?.import_attributes || {}),
          ...(contact.custom_fields || {}),
          last_imported_at: new Date().toISOString(),
          import_source: file.name,
        },
      };

      if (contact.full_name) contactData.full_name = contact.full_name;
      if (contact.email) contactData.email = contact.email;
      if (contact.phone) contactData.phone = contact.phone;
      if (contact.company) contactData.company = contact.company;
      if (contact.job_title) contactData.job_title = contact.job_title;
      if (contact.notes) contactData.notes = contact.notes;
      if (contact.address) contactData.home_address = { formatted: contact.address };

      if (existing) {
        await supabase.from("tom_contacts").update(contactData).eq("id", existing.id);
        updated++;
      } else {
        await supabase.from("tom_contacts").insert(contactData);
        created++;
      }
    }

    return NextResponse.json({
      success: true,
      summary,
      mapping,
      file_type: isImage ? "image" : isCSV ? "csv" : "excel",
      total_rows: contacts.length,
      created,
      updated,
      skipped,
    });

  } catch (e: any) {
    console.error("Hopper error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).map(line => {
    const values = parseCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] || ""; });
    return row;
  }).filter(row => Object.values(row).some(v => v));
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') { inQuotes = !inQuotes; }
    else if (char === "," && !inQuotes) { result.push(current.trim()); current = ""; }
    else { current += char; }
  }
  result.push(current.trim());
  return result;
}

async function parseExcel(buffer: ArrayBuffer): Promise<Record<string, string>[]> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: "" }) as Record<string, string>[];
}