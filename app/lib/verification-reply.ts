export type VerificationAddress = {
  streetAddress: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
};

export type VerificationUpdates = {
  phone?: string;
  home_address?: VerificationAddress;
  work_address?: VerificationAddress;
  birthday?: string;
  job_title?: string;
  company?: string;
};

export type InterpretedReply = {
  kind: "opt_out" | "soft_opt_out" | "confirm" | "update" | "none";
  text: string;
  updates?: VerificationUpdates;
  /** True when the reply may contain title, company, or birthday the regex did not take. */
  mentionsUnparsed?: boolean;
};

const HARD_OPT_OUT = [
  "remove me",
  "don't know you",
  "do not know you",
  "i don't know you",
  "delete me",
  "unsubscribe",
  "who are you",
  "wrong person",
  "remove my info",
  "delete my info",
  "stop emailing",
  "leave me alone",
  "not interested",
  "please remove",
];

const SOFT_OPT_OUT = [
  "don't ask",
  "do not ask",
  "stop asking",
  "prefer i don't",
  "stop these emails",
  "don't email me",
  "do not email me",
];

const CONFIRM_PHRASES = [
  "looks right",
  "looks correct",
  "looks good",
  "that's correct",
  "that is correct",
  "thats correct",
  "all good",
  "still correct",
  "still right",
  "no changes",
  "nothing to change",
  "this is correct",
  "this is right",
  "all correct",
  "info is correct",
  "information is correct",
  "all set",
];

function stripQuotedReply(body: string): string {
  const lines = body.split(/\r?\n/);
  const kept: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^On .+ wrote:\s*$/i.test(trimmed)) break;
    if (/^-{2,}\s*Original Message\s*-{2,}/i.test(trimmed)) break;
    if (/^From:\s+\S+/i.test(trimmed) && kept.length > 1) break;
    if (trimmed.startsWith(">")) continue;
    kept.push(line);
  }
  return kept.join("\n").trim();
}

function normalizePhone(raw: string): string | null {
  const compact = raw.trim().replace(/\s+/g, " ");
  const digits = compact.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  return compact;
}

function parseUsAddress(line: string): VerificationAddress | null {
  const cleaned = line.replace(/\s+/g, " ").replace(/[.\s]+$/g, "").trim();
  const match = cleaned.match(/^(.*),\s*([^,]+),\s*([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  if (!match) return null;
  const streetAddress = match[1].trim();
  const city = match[2].trim();
  if (streetAddress.length < 3 || city.length < 2) return null;
  return {
    streetAddress,
    city,
    region: match[3].toUpperCase(),
    postalCode: match[4],
    country: "US",
  };
}

function extractUpdates(text: string): VerificationUpdates {
  const updates: VerificationUpdates = {};

  const phoneMatch = text.match(
    /(?:mobile|cell|phone|number|(?:call|text)\s+me\s+at)\s*(?:is|:)?\s*(\+?1?[\s.(]*\d{3}[\s.)-]*\d{3}[\s.-]*\d{4})/i
  );
  const barePhone = text.match(/^\s*(\+?1?[\s.(]*\d{3}[\s.)-]*\d{3}[\s.-]*\d{4})\s*$/);
  const phone = normalizePhone(phoneMatch?.[1] || barePhone?.[1] || "");
  if (phone) updates.phone = phone;

  const addressPattern = /(?:my\s+)?(?:new\s+)?(home|work|office)?\s*address\s*(?:is|:)\s*([^\n]+)/gi;
  let addressMatch: RegExpExecArray | null;
  while ((addressMatch = addressPattern.exec(text))) {
    const parsed = parseUsAddress(addressMatch[2]);
    if (!parsed) continue;
    const kind = (addressMatch[1] || "").toLowerCase();
    if (kind === "work" || kind === "office") updates.work_address = parsed;
    else updates.home_address = parsed;
  }

  const moved = text.match(/(?:moved to|new address is|i live at)\s+([^\n]+)/i);
  if (moved && !updates.home_address) {
    const parsed = parseUsAddress(moved[1]);
    if (parsed) updates.home_address = parsed;
  }

  const birthday = text.match(/(?:birthday|born)\s*(?:is|:)\s*(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)/i);
  if (birthday) updates.birthday = birthday[1];

  return updates;
}

function hasUpdates(updates: VerificationUpdates): boolean {
  return Boolean(
    updates.phone ||
    updates.home_address ||
    updates.work_address ||
    updates.birthday ||
    updates.job_title ||
    updates.company
  );
}

export function normalizeModelUpdates(raw: unknown): VerificationUpdates {
  if (!raw || typeof raw !== "object") return {};
  const record = raw as Record<string, unknown>;
  const updates: VerificationUpdates = {};

  const phone = typeof record.phone === "string" ? normalizePhone(record.phone) : null;
  if (phone) updates.phone = phone;

  const home = normalizeModelAddress(record.home_address);
  const work = normalizeModelAddress(record.work_address);
  if (home) updates.home_address = home;
  if (work) updates.work_address = work;

  if (typeof record.birthday === "string" && record.birthday.trim()) {
    updates.birthday = record.birthday.trim();
  }

  const title = record.job_title || record.title;
  if (typeof title === "string" && title.trim()) updates.job_title = title.trim();
  if (typeof record.company === "string" && record.company.trim()) {
    updates.company = record.company.trim();
  }

  return updates;
}

function normalizeModelAddress(raw: unknown): VerificationAddress | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const street = textValue(record.streetAddress) || textValue(record.street);
  const city = textValue(record.city);
  const region = textValue(record.region) || textValue(record.state);
  const postal = textValue(record.postalCode) || textValue(record.zip);
  if (!street || !city || !region) return null;
  return {
    streetAddress: street,
    city,
    region,
    postalCode: postal,
    country: textValue(record.country) || "US",
  };
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function interpretVerificationReply(body: string): InterpretedReply {
  const text = stripQuotedReply(body);
  const lower = text.toLowerCase();

  if (HARD_OPT_OUT.some((phrase) => lower.includes(phrase))) {
    return { kind: "opt_out", text };
  }
  if (SOFT_OPT_OUT.some((phrase) => lower.includes(phrase))) {
    return { kind: "soft_opt_out", text };
  }

  const updates = extractUpdates(text);
  const mentionsUnparsed = /\b(title|company|job)\b/i.test(text)
    || (/\bbirthday\b/i.test(text) && !updates.birthday);
  if (hasUpdates(updates)) {
    return { kind: "update", text, updates, mentionsUnparsed };
  }

  if (CONFIRM_PHRASES.some((phrase) => lower.includes(phrase))) {
    return { kind: "confirm", text };
  }

  return { kind: "none", text, mentionsUnparsed: /\b(title|company|birthday|job|address|phone|cell|mobile)\b/i.test(text) };
}
