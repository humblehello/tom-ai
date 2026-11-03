/**
 * Sent mail that matches a template here is an automated reply, not Tom
 * writing back. A cold-pitch auto-reply must not create a contact.
 *
 * Edit this list to match the live automations. A template matches when
 * EVERY group has at least one phrase in the message body.
 *
 * The ARF reply asks for a donation to ARF / animal rescue (often "$500").
 * The qualifier reply asks whether the sender is a buyer or investor.
 * Short phrases use a word boundary so "arf" does not match "scarf".
 */

export interface AutoReplyTemplate {
  id: string;
  description: string;
  allOf: string[][];
}

export const OUTBOUND_AUTO_REPLY_TEMPLATES: AutoReplyTemplate[] = [
  {
    id: "arf_donation",
    description: "Automated reply asking for an ARF / animal rescue donation",
    allOf: [
      ["arf", "animal rescue"],
      ["donation", "$500"],
    ],
  },
  {
    id: "buyer_investor_qualifier",
    description: "Automated reply that qualifies a buyer or investor",
    allOf: [
      ["buyer", "investor"],
      ["qualif", "acquisition criteria", "are you looking to buy", "are you looking to invest"],
    ],
  },
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function bodyHasPhrase(body: string, phrase: string): boolean {
  const needle = phrase.trim();
  if (!needle || !body) return false;
  if (needle.length <= 4) {
    return new RegExp(`\\b${escapeRegExp(needle)}\\b`, "i").test(body);
  }
  return body.toLowerCase().includes(needle.toLowerCase());
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
