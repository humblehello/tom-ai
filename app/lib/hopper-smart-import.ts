// app/lib/hopper-smart-import.ts
// Claude-powered field mapping + ProcessingPlan for Hopper Smart Import

export type ImportMode = "update_existing" | "new_only" | "partial_fields" | "tag_on_import";

export type ProcessingPlan = {
  mode: ImportMode;
  instruction: string;
  tag?: string;
  fields_to_update?: string[];
  preview: PreviewRow[];
  total_rows: number;
  mapped_columns: Record<string, string>; // source col → HH field
  skipped_columns: string[];
  warnings: string[];
};

export type PreviewRow = {
  full_name: string;
  email?: string;
  phone?: string;
  company?: string;
  job_title?: string;
  birthday?: string;
  notes?: string;
  action: "create" | "update" | "skip";
  match_reason?: string;
};

export type RawContact = Record<string, string>;

// ── Parse CSV text into raw rows ─────────────────────────────────────────────
export function parseCSVToRows(text: string): { headers: string[]; rows: RawContact[] } {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };

  const headers = lines[0].split(",").map(h => h.replace(/^"|"$/g, "").trim());
  const rows: RawContact[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map(v => v.replace(/^"|"$/g, "").trim());
    if (values.every(v => !v)) continue;
    const row: RawContact = {};
    headers.forEach((h, idx) => { row[h] = values[idx] || ""; });
    rows.push(row);
  }

  return { headers, rows };
}

// ── Parse Excel buffer into raw rows ─────────────────────────────────────────
export async function parseExcelToRows(buffer: ArrayBuffer): Promise<{ headers: string[]; rows: RawContact[] }> {
  const XLSX = require("xlsx");
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const jsonRows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  if (!jsonRows.length) return { headers: [], rows: [] };
  const headers = Object.keys(jsonRows[0]);
  const rows = jsonRows.map(r => {
    const row: RawContact = {};
    headers.forEach(h => { row[h] = String(r[h] || ""); });
    return row;
  });
  return { headers, rows };
}

// ── Ask Claude to build a ProcessingPlan ─────────────────────────────────────
export async function buildProcessingPlan(
  headers: string[],
  sampleRows: RawContact[],
  instruction: string
): Promise<ProcessingPlan> {
  const prompt = `You are helping a user import contacts into Humble Hello, a relationship management app.

The user has uploaded a spreadsheet/CSV with these columns:
${headers.join(", ")}

Here are up to 3 sample rows:
${JSON.stringify(sampleRows.slice(0, 3).map(row => {
  const trimmed: Record<string, string> = {};
  Object.entries(row).slice(0, 20).forEach(([k, v]) => { if (v) trimmed[k] = v; });
  return trimmed;
}), null, 2)}

The user's instruction: "${instruction}"

Your job is to:
1. Figure out the user's intent (update existing contacts, import new only, update partial fields, or tag on import)
2. Map each source column to a Humble Hello field
3. Generate a preview of what will happen to the first 8 rows

Humble Hello fields: full_name, email, phone, company, job_title, birthday, notes, home_address, tags

Respond ONLY with valid JSON matching this exact shape:
{
  "mode": "update_existing" | "new_only" | "partial_fields" | "tag_on_import",
  "tag": "optional tag name if tagging",
  "fields_to_update": ["field1", "field2"] (only for partial_fields mode),
  "mapped_columns": { "Source Column": "hh_field_or_null" },
  "skipped_columns": ["col1", "col2"],
  "warnings": ["any data quality issues noticed"],
  "preview": [
    {
      "full_name": "...",
      "email": "...",
      "phone": "...",
      "company": "...",
      "job_title": "...",
      "action": "create" | "update" | "skip",
      "match_reason": "why update/skip (optional)"
    }
  ]
}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const data = await res.json();
  const raw = data.content?.[0]?.text || "{}";

  try {
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    return {
      mode: parsed.mode || "new_only",
      instruction,
      tag: parsed.tag,
      fields_to_update: parsed.fields_to_update,
      preview: parsed.preview || [],
      total_rows: sampleRows.length,
      mapped_columns: parsed.mapped_columns || {},
      skipped_columns: parsed.skipped_columns || [],
      warnings: parsed.warnings || [],
    };
  } catch {
    return {
      mode: "new_only",
      instruction,
      preview: [],
      total_rows: 0,
      mapped_columns: {},
      skipped_columns: [],
      warnings: ["Could not parse the response — please try again."],
    };
  }
}

// ── Apply the ProcessingPlan to all rows → structured contacts ────────────────
export function applyPlanToRows(
  rows: RawContact[],
  plan: ProcessingPlan
): any[] {
  return rows.map(row => {
    const contact: any = {};
    for (const [srcCol, hhField] of Object.entries(plan.mapped_columns)) {
      if (!hhField || hhField === "null") continue;
      const val = row[srcCol]?.trim();
      if (!val) continue;
      if (hhField === "full_name") contact.full_name = val;
      else if (hhField === "email") contact.email = val.toLowerCase();
      else if (hhField === "phone") contact.phone = val;
      else if (hhField === "company") contact.company = val;
      else if (hhField === "job_title") contact.job_title = val;
      else if (hhField === "birthday") contact.birthday = val;
      else if (hhField === "notes") contact.notes = val;
      else if (hhField === "tags") contact.tags = [val];
    }
    // Apply tag if tag_on_import mode
    if (plan.mode === "tag_on_import" && plan.tag) {
      contact.tags = [...(contact.tags || []), plan.tag];
    }
    return contact;
  }).filter(c => c.full_name || c.email);
}