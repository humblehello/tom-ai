/**
 * Sent mail that matches a template here is an automated reply, not Tom
 * writing back. A cold-pitch auto-reply must not create a contact.
 *
 * Phrases are the live copy of the two automations. A template matches when
 * EVERY phrase is present. Matching is case-insensitive and ignores quote
 * markers, line wraps, HTML tags, and curly apostrophes, so a Gmail or
 * Outlook quoted copy of the same reply still matches.
 */

export interface AutoReplyTemplate {
  id: string;
  description: string;
  allOf: string[][];
}

export const ARF_DONATION_PHRASES = [
  "I get a lot of solicitation emails every day and only have so much time, so here's how I handle them",
  "make a $500 donation to the Animal Rescue Fund in Muncie, Indiana",
  "munciearf.com",
  "munciearf.com/donate-arf",
];

export const BUYER_INVESTOR_QUALIFIER_PHRASES = [
  "I appreciate the opportunity to learn more about your interest in Thumbprint",
  "Before we set up a call, could you share a bit more?",
  "Who is the buyer or investor, and is this a strategic acquirer, a PE firm, or another type of investor?",
  "Once I have a better picture, I'm happy to find a time to talk.",
];

export const OUTBOUND_AUTO_REPLY_TEMPLATES: AutoReplyTemplate[] = [
  {
    id: "arf_donation",
    description: "Automated reply asking for a $500 donation to the Animal Rescue Fund in Muncie",
    allOf: ARF_DONATION_PHRASES.map((phrase) => [phrase]),
  },
  {
    id: "buyer_investor_qualifier",
    description: "Automated reply that qualifies a Thumbprint buyer or investor",
    allOf: BUYER_INVESTOR_QUALIFIER_PHRASES.map((phrase) => [phrase]),
  },
];

/** Flatten quoted replies, HTML, and odd apostrophes so phrase search still hits. */
export function normalizeForTemplateMatch(value: string): string {
  return (value || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;|&rsquo;|&#8217;/gi, "'")
    .replace(/[’‘`]/g, "'")
    .replace(/^\s*(?:>+\s*)+/gm, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function bodyHasPhrase(body: string, phrase: string): boolean {
  const needle = normalizeForTemplateMatch(phrase);
  if (!needle) return false;
  return normalizeForTemplateMatch(body).includes(needle);
}

export function matchingAutoReplyTemplate(
  body: string,
  templates: AutoReplyTemplate[] = OUTBOUND_AUTO_REPLY_TEMPLATES
): AutoReplyTemplate | null {
  const text = body || "";
  for (const template of templates) {
    const matched = template.allOf.every((group) => group.some((phrase) => bodyHasPhrase(text, phrase)));
    if (matched) return template;
  }
  return null;
}

export function isAutoReplyTemplate(
  body: string,
  templates: AutoReplyTemplate[] = OUTBOUND_AUTO_REPLY_TEMPLATES
): boolean {
  return matchingAutoReplyTemplate(body, templates) !== null;
}
