/**
 * Email signature parsing for contact enrichment.
 *
 * The previous parser took the tail of the entire plain-text body (quoted
 * replies included) and saved the first phone-shaped match onto the Gmail
 * From contact. On a reply, that tail is the other person's signature.
 * Gmail also inserts map/tel links in the middle of the sender's own numbers
 * in the plain-text part, so those numbers failed to match while a compact
 * quoted "M 214.796.4212" still did. This module only reads the sender's new
 * content, and only keeps a signature whose name matches that sender.
 */

import { googlePhoneType, type SignaturePhoneLabel } from "./phone-label";

export const INTERNAL_EMAIL_DOMAIN = "thumbprint.com";

export interface MailHeader {
  name: string;
  value: string;
}

export interface ParsedPhone {
  number: string;
  digits: string;
  label: SignaturePhoneLabel;
  rawLabel: string;
}

export interface PhoneConflict {
  kind: "existing_number" | "internal_employee" | "on_other_contact" | "conflicting_values";
  number: string;
  label: SignaturePhoneLabel;
  detail: string;
}

export interface InternalEmployee {
  name: string;
  emails?: string[] | null;
  phones?: string[] | null;
}

export interface OtherPhoneOwner {
  contactId?: string | null;
  name: string;
  email?: string | null;
  digits: string;
}

export interface SignatureParseInput {
  bodyText?: string | null;
  bodyHtml?: string | null;
  senderName?: string | null;
  /** Extra names that still count as this sender (From header vs saved contact). */
  senderAliases?: string[] | null;
  senderEmail?: string | null;
  headers?: MailHeader[] | null;
  folder?: "inbox" | "sent" | string | null;
  subject?: string | null;
  internalEmployees?: InternalEmployee[] | null;
  phonesOnOtherContacts?: OtherPhoneOwner[] | null;
}

export interface SignatureParseResult {
  skipped: boolean;
  skipReason?:
    | "auto_reply"
    | "sent_mail"
    | "not_from_sender"
    | "name_mismatch"
    | "ambiguous_signature"
    | "no_signature_name"
    | "empty";
  signatureName: string | null;
  nameMatches: boolean;
  newContent: string;
  phones: ParsedPhone[];
  acceptedPhones: ParsedPhone[];
  conflicts: PhoneConflict[];
  linkedin_url: string | null;
  twitter_url: string | null;
  job_title: string | null;
  company: string | null;
}

export interface StoredPhone {
  number: string;
  type?: string | null;
  label?: string | null;
  primary?: boolean;
}

export interface SignatureFieldUpdate {
  updates: {
    phone?: string;
    phones?: { number: string; type: "cell" | "work" | "home"; label: string; primary: boolean }[];
    all_phones?: string[];
    linkedin_url?: string;
    twitter_url?: string;
    job_title?: string;
    company?: string;
  };
  conflicts: PhoneConflict[];
  /** Phones that are safe to append in Google Contacts, with the right type. */
  googlePhones: { number: string; googleType: "mobile" | "work" | "main" | "other" }[];
}

const EMPTY_RESULT: SignatureParseResult = {
  skipped: true,
  skipReason: "empty",
  signatureName: null,
  nameMatches: false,
  newContent: "",
  phones: [],
  acceptedPhones: [],
  conflicts: [],
  linkedin_url: null,
  twitter_url: null,
  job_title: null,
  company: null,
};

export function phoneDigits(value: string | null | undefined): string {
  if (!value) return "";
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

export function formatPhone(digits: string): string {
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  return digits;
}

export function isInternalEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase().endsWith(`@${INTERNAL_EMAIL_DOMAIN}`);
}

export function headerValue(headers: MailHeader[] | null | undefined, name: string): string {
  if (!headers) return "";
  const found = headers.find((header) => header.name.toLowerCase() === name.toLowerCase());
  return found?.value || "";
}

export function parseAddress(raw: string | null | undefined): { name: string; email: string } {
  const value = raw || "";
  const emailMatch = value.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i);
  const email = emailMatch ? emailMatch[0].toLowerCase() : "";
  const nameMatch = value.match(/^\s*"?([^"<]+?)"?\s*</);
  const name = nameMatch ? nameMatch[1].trim() : "";
  return { name, email };
}

export function isAutoReply(input: {
  headers?: MailHeader[] | null;
  subject?: string | null;
  body?: string | null;
}): boolean {
  const autoSubmitted = headerValue(input.headers, "auto-submitted").trim();
  if (autoSubmitted && !/^no$/i.test(autoSubmitted)) return true;
  if (headerValue(input.headers, "x-autoreply") || headerValue(input.headers, "x-autorespond")) return true;
  const precedence = headerValue(input.headers, "precedence").trim().toLowerCase();
  if (precedence === "auto_reply" || precedence === "autoreply") return true;

  const subject = input.subject || headerValue(input.headers, "subject");
  if (/^\s*((automatic reply|auto-?reply|out of office|ooo\b|autosvar|abwesenheitsnotiz)\b)/i.test(subject)) {
    return true;
  }

  const head = (input.body || "").slice(0, 400);
  if (/this is an automatic (reply|response)|i am currently out of the office|i'm currently out of the office|i will be out of the office/i.test(head)) {
    return true;
  }
  return false;
}

/** Drop Gmail/Outlook quoted and forwarded regions from plain text. */
export function stripQuotedAndForwarded(text: string): string {
  if (!text) return "";
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const cut = normalized.slice(0, findQuoteStart(normalized));
  return cut
    .split("\n")
    .filter((line) => !/^\s*>/.test(line))
    .join("\n")
    .trim();
}

function findQuoteStart(text: string): number {
  const lines = text.split("\n");
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const window = lines.slice(i, i + 5).join("\n");

    // "On Fri, Oct 16, 2026, 12:35 PM Kirk Meyer wrote:" — wrote: ends the
    // attribution, which may wrap onto the next line. Don't require the
    // following quoted lines to be absent from the window.
    if (/^on\b/i.test(trimmed)) {
      let combined = "";
      for (let j = i; j < Math.min(lines.length, i + 4); j++) {
        combined += `${j === i ? "" : " "}${lines[j].trim()}`;
        if (/\bwrote:\s*$/i.test(combined)) return offset;
      }
    }
    if (/^-{2,}\s*original message\s*-{2,}/i.test(trimmed)) return offset;
    if (/^original message\b/i.test(trimmed)) return offset;
    if (/^begin forwarded message\b/i.test(trimmed)) return offset;
    if (/^-{3,}\s*forwarded message\s*-{3,}/i.test(trimmed)) return offset;
    if (/^forwarded message\b/i.test(trimmed) && /^from:\s/im.test(lines.slice(i + 1, i + 5).join("\n"))) return offset;
    if (/^_{5,}$/.test(trimmed) && /^from:\s/im.test(lines.slice(i + 1, i + 6).join("\n"))) return offset;

    // Outlook reply header. Require a Sent: line so a signature "From:" doesn't match.
    if (/^from:\s+\S/i.test(trimmed) && /^sent:\s/im.test(window)) return offset;

    offset += lines[i].length + 1;
  }
  return text.length;
}

/** Remove quoted/forwarded HTML, then return readable text. */
export function htmlToNewContent(html: string): string {
  if (!html) return "";
  let source = html.replace(/\r\n/g, "\n");
  const cutMarkers = [
    /class\s*=\s*["'][^"']*gmail_quote/i,
    /class\s*=\s*["'][^"']*gmail_attr/i,
    /<blockquote\b/i,
    /id\s*=\s*["']appendonsend["']/i,
    /id\s*=\s*["']divRplyFwdMsg["']/i,
    /id\s*=\s*["']mail-editor-reference-message-container["']/i,
  ];
  let cutAt = source.length;
  for (const marker of cutMarkers) {
    const match = marker.exec(source);
    if (match && match.index < cutAt) cutAt = match.index;
  }
  // Step back to the start of the tag we matched inside.
  const tagStart = source.lastIndexOf("<", cutAt);
  if (tagStart >= 0 && cutAt < source.length) source = source.slice(0, tagStart);

  source = source.replace(/<script[\s\S]*?<\/script>/gi, " ");
  source = source.replace(/<style[\s\S]*?<\/style>/gi, " ");
  source = source.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, "$1");
  source = source.replace(/<br\s*\/?>/gi, "\n");
  source = source.replace(/<\/(p|div|tr|li|h\d|table)>/gi, "\n");
  source = source.replace(/<[^>]+>/g, " ");
  source = decodeEntities(source);
  return stripQuotedAndForwarded(source);
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

/**
 * Gmail's plain-text part inserts map and tel links in the middle of a
 * phone number: `Office: (480 <https://www.google.com/maps/search/...> 264-6344)`.
 * Strip those links, then pull the pieces back together.
 */
export function stripMapAndPhoneLinks(text: string): string {
  if (!text) return "";
  let cleaned = text;
  cleaned = cleaned.replace(/<https?:\/\/[^>\s]+>/gi, " ");
  cleaned = cleaned.replace(/<tel:[^>\s]+>/gi, " ");
  cleaned = cleaned.replace(/<mailto:[^>\s]+>/gi, " ");
  cleaned = cleaned.replace(/https?:\/\/(?:www\.)?google\.com\/maps\/search\/[^\s<>)]*/gi, " ");
  cleaned = cleaned.replace(/https?:\/\/maps\.google\.com\/[^\s<>)]*/gi, " ");
  cleaned = cleaned.replace(/https?:\/\/(?:www\.)?google\.com\/search\?[^\s<>)]*tbm=map[^\s<>)]*/gi, " ");
  cleaned = cleaned.replace(/\btel:\+?[\d().\s-]*/gi, " ");
  cleaned = cleaned.replace(/[ \t]{2,}/g, " ");
  cleaned = cleaned.replace(/\((\d{3})\)?[\s.\-]+(\d{3})[\s.\-]+(\d{4})\)?/g, "($1) $2-$3");
  return cleaned;
}

const NAME_STOP_WORDS = new Set([
  "thanks", "thank", "you", "best", "regards", "regard", "sincerely", "cheers",
  "sent", "from", "inc", "llc", "ltd", "corp", "corporation", "company", "group",
  "international", "services", "solutions", "office", "direct", "mobile", "phone",
  "cell", "team", "manager", "director", "president", "engineer", "consultant",
  "officer", "founder", "partner", "vice", "chief", "head", "lead", "sales",
  "marketing", "hello", "dear", "hey", "hi", "the", "and", "of", "for", "operations",
  "support", "info", "mail",
]);

function nameTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, " ")
    .split(/[\s'-]+/)
    .filter((token) => token.length > 1);
}

export function namesMatch(signatureName: string, senderName: string): boolean {
  const signature = nameTokens(signatureName);
  const sender = nameTokens(senderName);
  if (signature.length < 2 || sender.length < 2) return false;
  const signatureFirst = signature[0];
  const signatureLast = signature[signature.length - 1];
  const senderFirst = sender[0];
  const senderLast = sender[sender.length - 1];
  if (signatureLast !== senderLast) return false;
  if (signatureFirst === senderFirst) return true;
  if (
    signatureFirst.length >= 3 &&
    senderFirst.length >= 3 &&
    (signatureFirst.startsWith(senderFirst) || senderFirst.startsWith(signatureFirst))
  ) {
    return true;
  }
  return false;
}

function personNameLines(text: string): { line: string; index: number }[] {
  const found: { line: string; index: number }[] = [];
  const lines = text.split("\n");
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim().replace(/[,|]+$/g, "").trim();
    if (!line || line.length > 40 || line.includes("@")) continue;
    if (!/^[A-Z][a-z]+(?:[-'][A-Z][a-z]+)?(?:\s+[A-Z][a-z]+(?:[-'][A-Z][a-z]+)?){1,2}$/.test(line)) continue;
    const tokens = line.split(/\s+/).map((token) => token.toLowerCase().replace(/[^a-z]/g, ""));
    if (tokens.some((token) => NAME_STOP_WORDS.has(token))) continue;
    found.push({ line, index });
  }
  return found;
}

function labelFromPrefix(prefix: string): { label: SignaturePhoneLabel; rawLabel: string } | null {
  const tail = prefix.slice(-30);
  const matches = [...tail.matchAll(/\b(mobile|cell|direct|dir|office|main|phone|tel|work|ph)\b|\b(m)\b\s*[:.]?\s*$/gi)];
  if (matches.length === 0) return null;
  const last = matches[matches.length - 1];
  const raw = (last[1] || last[2] || "").toLowerCase();
  if (!raw) return null;
  if (raw === "mobile" || raw === "cell" || raw === "m") return { label: "cell", rawLabel: raw };
  if (raw === "direct" || raw === "dir") return { label: "direct", rawLabel: raw };
  if (raw === "office" || raw === "main" || raw === "phone" || raw === "tel" || raw === "work" || raw === "ph") {
    return { label: "office", rawLabel: raw };
  }
  return null;
}

function extractLabeledPhones(text: string): ParsedPhone[] {
  const phones: ParsedPhone[] = [];
  const seen = new Set<string>();
  const pattern = /(?:\+?1[\s.\-]?)?(?:\(\d{3}\)[\s.\-]?|\d{3}[\s.\-])\d{3}[\s.\-]\d{4}/g;
  for (const match of text.matchAll(pattern)) {
    const raw = match[0];
    const start = match.index ?? 0;
    const before = start > 0 ? text[start - 1] : "";
    const after = text[start + raw.length] || "";
    if (/\d/.test(before) || /\d/.test(after)) continue;
    const digits = phoneDigits(raw);
    if (digits.length !== 10 || seen.has(digits)) continue;
    const lineStart = text.lastIndexOf("\n", start - 1) + 1;
    let prefix = text.slice(lineStart, start);
    if (!labelFromPrefix(prefix)) {
      const prevEnd = lineStart - 1;
      if (prevEnd > 0) {
        const prevStart = text.lastIndexOf("\n", prevEnd - 1) + 1;
        const previous = text.slice(prevStart, prevEnd).trim();
        if (previous && previous.length <= 24) prefix = `${previous} ${prefix}`;
      }
    }
    const labeled = labelFromPrefix(prefix);
    if (!labeled) continue;
    seen.add(digits);
    phones.push({ number: formatPhone(digits), digits, label: labeled.label, rawLabel: labeled.rawLabel });
  }
  return phones;
}

function signatureWindow(text: string, nameIndex: number): string {
  const lines = text.split("\n");
  const start = Math.max(0, nameIndex - 4);
  const end = Math.min(lines.length, nameIndex + 12);
  return lines.slice(start, end).join("\n");
}

function extractProfile(windowText: string): Pick<SignatureParseResult, "linkedin_url" | "twitter_url" | "job_title" | "company"> {
  const linkedinMatch = windowText.match(/linkedin\.com\/in\/[\w-]+/i);
  const twitterMatch = windowText.match(/(?:twitter\.com|x\.com)\/[\w]+/i);
  const lines = windowText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 2 && line.length < 60 && !line.includes("@") && !line.match(/\d{3}/));
  const titlePatterns = /(CEO|CTO|CFO|COO|VP|Director|Manager|President|Founder|Partner|Principal|Engineer|Developer|Designer|Consultant|Analyst|Executive|Officer|Head of|Lead)/i;
  const titleLine = lines.find((line) => titlePatterns.test(line)) || null;
  let company: string | null = null;
  if (titleLine) {
    const titleIdx = lines.findIndex((line) => line === titleLine);
    const candidate = titleIdx >= 0 ? lines[titleIdx + 1] : "";
    if (candidate && !candidate.match(/\d{3}/) && !/linkedin|twitter|http/i.test(candidate)) {
      company = candidate.slice(0, 80);
    }
  }
  return {
    linkedin_url: linkedinMatch ? `https://${linkedinMatch[0]}` : null,
    twitter_url: twitterMatch ? `https://${twitterMatch[0]}` : null,
    job_title: titleLine ? titleLine.slice(0, 80) : null,
    company,
  };
}

function senderNamesOf(input: SignatureParseInput, fromName: string): string[] {
  const names = [input.senderName || "", fromName, ...(input.senderAliases || [])]
    .map((name) => name.trim())
    .filter(Boolean);
  return [...new Set(names)];
}

function chooseNewContent(input: SignatureParseInput, names: string[]): string {
  const fromHtml = input.bodyHtml ? stripMapAndPhoneLinks(htmlToNewContent(input.bodyHtml)) : "";
  const fromText = input.bodyText ? stripMapAndPhoneLinks(stripQuotedAndForwarded(input.bodyText)) : "";
  const usable = (content: string) => {
    const found = personNameLines(content);
    if (found.length === 0) return false;
    const matches = found.filter((entry) => names.some((name) => namesMatch(entry.line, name)));
    const conflicts = found.filter((entry) => !names.some((name) => namesMatch(entry.line, name)));
    return matches.length > 0 && conflicts.length === 0;
  };
  if (usable(fromHtml)) return fromHtml;
  if (usable(fromText)) return fromText;
  return (fromHtml || fromText).trim();
}

function internalOwner(phone: ParsedPhone, employees: InternalEmployee[] | null | undefined, senderEmail: string, names: string[]): string | null {
  for (const employee of employees || []) {
    const owned = (employee.phones || []).some((value) => phoneDigits(value) === phone.digits);
    if (!owned) continue;
    const senderIsEmployee =
      (employee.emails || []).some((email) => email.toLowerCase() === senderEmail) ||
      names.some((name) => namesMatch(employee.name, name));
    if (!senderIsEmployee) return employee.name;
  }
  return null;
}

export function parseSenderSignature(input: SignatureParseInput): SignatureParseResult {
  const from = parseAddress(headerValue(input.headers, "from"));
  const senderEmail = (input.senderEmail || from.email || "").trim().toLowerCase();
  const subject = input.subject || headerValue(input.headers, "subject");

  if ((input.folder || "").toLowerCase() === "sent") {
    return { ...EMPTY_RESULT, skipReason: "sent_mail" };
  }
  if (from.email && senderEmail && from.email !== senderEmail) {
    return { ...EMPTY_RESULT, skipReason: "not_from_sender" };
  }
  // Headers and subject only. The body phrase is checked after quotes are removed
  // so an out-of-office notice in the quoted thread does not drop the reply.
  if (isAutoReply({ headers: input.headers, subject, body: "" })) {
    return { ...EMPTY_RESULT, skipReason: "auto_reply" };
  }

  const names = senderNamesOf(input, from.name);
  const newContent = chooseNewContent(input, names).trim();
  if (!newContent) return { ...EMPTY_RESULT, skipReason: "empty" };
  if (isAutoReply({ body: newContent.slice(0, 400) })) {
    return { ...EMPTY_RESULT, skipReason: "auto_reply", newContent };
  }

  const foundNames = personNameLines(newContent);
  const matching = foundNames.filter((entry) => names.some((name) => namesMatch(entry.line, name)));
  const conflicting = foundNames.filter((entry) => !names.some((name) => namesMatch(entry.line, name)));

  if (matching.length === 0) {
    return {
      ...EMPTY_RESULT,
      skipped: true,
      skipReason: foundNames.length ? "name_mismatch" : "no_signature_name",
      newContent,
      signatureName: foundNames[0]?.line || null,
    };
  }
  // A second person's name is still in the new content, so the quote cut missed.
  if (conflicting.length > 0) {
    return {
      ...EMPTY_RESULT,
      skipped: true,
      skipReason: "ambiguous_signature",
      newContent,
      signatureName: conflicting[0].line,
    };
  }

  let best = matching[0];
  let bestPhones = extractLabeledPhones(signatureWindow(newContent, best.index));
  for (const candidate of matching.slice(1)) {
    const phones = extractLabeledPhones(signatureWindow(newContent, candidate.index));
    if (phones.length > bestPhones.length) {
      best = candidate;
      bestPhones = phones;
    }
  }

  const windowText = signatureWindow(newContent, best.index);
  const profile = extractProfile(windowText);
  const conflicts: PhoneConflict[] = [];
  const accepted: ParsedPhone[] = [];

  for (const phone of bestPhones) {
    const employee = internalOwner(phone, input.internalEmployees, senderEmail, names);
    if (employee) {
      conflicts.push({
        kind: "internal_employee",
        number: phone.number,
        label: phone.label,
        detail: `Number belongs to internal employee ${employee}`,
      });
      continue;
    }
    const other = (input.phonesOnOtherContacts || []).find((owner) => owner.digits === phone.digits);
    if (other) {
      conflicts.push({
        kind: "on_other_contact",
        number: phone.number,
        label: phone.label,
        detail: `Number is already on ${other.name}${other.email ? ` (${other.email})` : ""}`,
      });
      continue;
    }
    accepted.push(phone);
  }

  return {
    skipped: false,
    signatureName: best.line,
    nameMatches: true,
    newContent,
    phones: bestPhones,
    acceptedPhones: accepted,
    conflicts,
    ...profile,
  };
}

export function mergeSignatureParses(results: SignatureParseResult[]): SignatureParseResult {
  const usable = results.filter((result) => !result.skipped && result.nameMatches);
  if (usable.length === 0) return results.find((result) => result.skipped) || EMPTY_RESULT;

  const byLabel = new Map<SignaturePhoneLabel, ParsedPhone[]>();
  for (const result of usable) {
    for (const phone of result.acceptedPhones) {
      const list = byLabel.get(phone.label) || [];
      if (!list.some((existing) => existing.digits === phone.digits)) list.push(phone);
      byLabel.set(phone.label, list);
    }
  }

  const accepted: ParsedPhone[] = [];
  const conflicts: PhoneConflict[] = usable.flatMap((result) => result.conflicts);
  for (const [label, phones] of byLabel) {
    if (phones.length === 1) {
      accepted.push(phones[0]);
      continue;
    }
    conflicts.push({
      kind: "conflicting_values",
      number: phones.map((phone) => phone.number).join(" / "),
      label,
      detail: `Messages disagree on the ${label} number`,
    });
  }

  const profile = usable.find((result) => result.job_title || result.linkedin_url) || usable[0];
  return {
    skipped: false,
    signatureName: profile.signatureName,
    nameMatches: true,
    newContent: profile.newContent,
    phones: usable.flatMap((result) => result.phones),
    acceptedPhones: accepted,
    conflicts,
    linkedin_url: profile.linkedin_url,
    twitter_url: profile.twitter_url,
    job_title: profile.job_title,
    company: profile.company,
  };
}

function existingNumbers(phone: string | null | undefined, phones: StoredPhone[] | null | undefined): Set<string> {
  const digits = new Set<string>();
  const primary = phoneDigits(phone);
  if (primary.length === 10) digits.add(primary);
  for (const entry of phones || []) {
    const value = phoneDigits(entry?.number);
    if (value.length === 10) digits.add(value);
  }
  return digits;
}

/**
 * Turn a parse into contact fields. Never replaces a number that is already stored.
 * A different newly parsed number is returned as a conflict for review.
 */
export function signatureFieldUpdates(
  parsed: SignatureParseResult,
  existing: {
    phone?: string | null;
    phones?: StoredPhone[] | null;
    linkedin_url?: string | null;
    twitter_url?: string | null;
    job_title?: string | null;
    company?: string | null;
  }
): SignatureFieldUpdate {
  const conflicts = [...parsed.conflicts];
  const updates: SignatureFieldUpdate["updates"] = {};
  const have = existingNumbers(existing.phone, existing.phones);
  const writable = parsed.acceptedPhones.filter((phone) => {
    if (have.has(phone.digits)) return false;
    if (have.size > 0) {
      conflicts.push({
        kind: "existing_number",
        number: phone.number,
        label: phone.label,
        detail: "Contact already has a different phone number; left it unchanged",
      });
      return false;
    }
    return true;
  });

  if (writable.length > 0 && have.size === 0) {
    const cell = writable.find((phone) => phone.label === "cell");
    updates.phones = writable.map((phone, index) => ({
      number: phone.number,
      type: phone.label === "cell" ? "cell" : "work",
      label: phone.label === "cell" ? "mobile" : phone.label,
      primary: cell ? phone.digits === cell.digits : index === 0,
    }));
    updates.all_phones = writable.map((phone) => phone.number);
    // The single `phone` column is what texting uses. Only a real mobile goes there.
    if (cell) updates.phone = cell.number;
  }

  if (parsed.linkedin_url && !existing.linkedin_url) updates.linkedin_url = parsed.linkedin_url;
  if (parsed.twitter_url && !existing.twitter_url) updates.twitter_url = parsed.twitter_url;
  if (parsed.job_title && !existing.job_title) updates.job_title = parsed.job_title;
  if (parsed.company && !existing.company) updates.company = parsed.company;

  return {
    updates,
    conflicts,
    googlePhones: writable.map((phone) => ({ number: phone.number, googleType: googlePhoneType(phone.label) })),
  };
}

export function decodeBase64Url(data: string): string {
  try {
    const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
    if (typeof Buffer !== "undefined") return Buffer.from(normalized, "base64").toString("utf-8");
    return "";
  } catch {
    return "";
  }
}

/** Walk a Gmail payload and keep both the plain-text and HTML parts. */
export function extractBodiesFromPayload(payload: any): { text: string; html: string } {
  let text = "";
  let html = "";
  const walk = (part: any) => {
    if (!part) return;
    if (part.mimeType === "text/plain" && part.body?.data) text += `${decodeBase64Url(part.body.data)}\n`;
    else if (part.mimeType === "text/html" && part.body?.data) html += `${decodeBase64Url(part.body.data)}\n`;
    if (Array.isArray(part.parts)) part.parts.forEach(walk);
  };
  walk(payload);
  return { text: text.trim(), html: html.trim() };
}

export function collectPhoneOwners(
  contacts: {
    id: string;
    full_name?: string | null;
    email?: string | null;
    phone?: string | null;
    phones?: { number?: string | null }[] | null;
    all_phones?: string[] | null;
  }[]
): OtherPhoneOwner[] {
  const owners: OtherPhoneOwner[] = [];
  for (const contact of contacts) {
    const values = [
      contact.phone,
      ...(contact.all_phones || []),
      ...((contact.phones || []).map((phone) => phone?.number)),
    ];
    const seen = new Set<string>();
    for (const value of values) {
      const digits = phoneDigits(value);
      if (digits.length !== 10 || seen.has(digits)) continue;
      seen.add(digits);
      owners.push({
        contactId: contact.id,
        name: contact.full_name || "",
        email: contact.email,
        digits,
      });
    }
  }
  return owners;
}

export function internalEmployeesFromContacts(
  contacts: {
    full_name?: string | null;
    email?: string | null;
    all_emails?: string[] | null;
    phone?: string | null;
    phones?: { number?: string | null }[] | null;
    all_phones?: string[] | null;
  }[]
): InternalEmployee[] {
  const employees: InternalEmployee[] = [];
  for (const contact of contacts) {
    const emails = [contact.email, ...(contact.all_emails || [])].filter((email): email is string => !!email);
    if (!emails.some((email) => isInternalEmail(email))) continue;
    const phones = [
      contact.phone,
      ...(contact.all_phones || []),
      ...((contact.phones || []).map((phone) => phone?.number)),
    ].filter((phone): phone is string => !!phone);
    employees.push({ name: contact.full_name || "", emails, phones });
  }
  return employees;
}
