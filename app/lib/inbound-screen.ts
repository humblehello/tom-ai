/**
 * Decide whether an inbound email address may become a contact.
 *
 * Auto-create only for a genuine two-way relationship: Tom sent that
 * address a message that is not one of the configured auto-reply templates.
 * Role accounts, mailing lists, and ESP senders are dropped.
 * Everyone else is staged for review and is not written to Google.
 */

import { isBlockedEmail } from "./contact-blocklist";
import { isAutoReplyTemplate, OUTBOUND_AUTO_REPLY_TEMPLATES, type AutoReplyTemplate } from "./auto-reply-templates";

export const ROLE_LOCAL_PARTS = [
  "sales",
  "info",
  "marketing",
  "hello",
  "support",
  "help",
  "contact",
  "admin",
  "newsletter",
  "news",
  "noreply",
  "no-reply",
  "no_reply",
  "donotreply",
  "do-not-reply",
  "do_not_reply",
  "notifications",
  "notification",
];

export const ESP_DOMAINS = [
  "mailchimp.com",
  "sendgrid.net",
  "sendgrid.com",
  "constantcontact.com",
  "hubspot.com",
  "hubspotemail.net",
  "klaviyo.com",
  "marketo.com",
  "pardot.com",
  "amazonses.com",
  "mailgun.com",
  "mailgun.org",
  "substack.com",
  "shared1.ccsend.com",
  "cmail19.com",
  "cmail20.com",
  "rsgsv.net",
  "mcsv.net",
  "mcdlv.net",
];

const BULK_PRECEDENCE = new Set(["bulk", "list", "junk"]);

export interface MailHeader {
  name: string;
  value: string;
}

export interface SentMessage {
  body: string;
  /** ISO or any Date-parseable timestamp. Used only to tell who wrote first. */
  date?: string | null;
}

export type InboundAction = "create" | "pending" | "skip";

export interface InboundDecision {
  action: InboundAction;
  reason: string;
}

function header(headers: MailHeader[] | null | undefined, name: string): string {
  if (!headers) return "";
  const found = headers.find((item) => item.name.toLowerCase() === name.toLowerCase());
  return found?.value?.trim() || "";
}

export function normalizeLocalPart(email: string | null | undefined): string {
  const local = (email || "").toLowerCase().trim().split("@")[0] || "";
  return local.replace(/[._-]/g, "");
}

export function isRoleAddress(email: string | null | undefined): boolean {
  const normalized = normalizeLocalPart(email);
  if (!normalized) return false;
  return ROLE_LOCAL_PARTS.some((role) => role.replace(/[._-]/g, "") === normalized);
}

export function isEspDomain(email: string | null | undefined): boolean {
  const domain = (email || "").toLowerCase().trim().split("@")[1] || "";
  if (!domain) return false;
  return ESP_DOMAINS.some((esp) => domain === esp || domain.endsWith(`.${esp}`));
}

export function junkInboundReason(email: string, headers?: MailHeader[] | null): string | null {
  if (!email || !email.includes("@")) return "invalid_email";
  if (isRoleAddress(email)) return "role_address";
  if (isEspDomain(email)) return "esp_domain";
  if (isBlockedEmail(email)) return "blocked_local_part";
  if (header(headers, "list-unsubscribe") || header(headers, "list-unsubscribe-post")) {
    return "list_unsubscribe";
  }
  const precedence = header(headers, "precedence").toLowerCase();
  if (BULK_PRECEDENCE.has(precedence)) return "precedence_bulk";
  return null;
}

export function hasGenuineOutbound(
  sentMessages: SentMessage[],
  templates: AutoReplyTemplate[] = OUTBOUND_AUTO_REPLY_TEMPLATES
): { genuine: boolean; templateOnly: boolean } {
  let sawTemplate = false;
  let sawGenuine = false;
  for (const message of sentMessages) {
    const body = (message.body || "").trim();
    if (!body) continue;
    if (isAutoReplyTemplate(body, templates)) sawTemplate = true;
    else sawGenuine = true;
  }
  return { genuine: sawGenuine, templateOnly: sawTemplate && !sawGenuine };
}

/**
 * Tom-initiated means a non-template sent message exists and it is dated
 * before the inbound message. A later real reply is still two-way.
 */
export function screenInboundSender(input: {
  email: string;
  headers?: MailHeader[] | null;
  sentMessages?: SentMessage[] | null;
  inboundDate?: string | null;
  templates?: AutoReplyTemplate[];
}): InboundDecision {
  const junk = junkInboundReason(input.email, input.headers);
  if (junk) return { action: "skip", reason: junk };

  const sent = input.sentMessages || [];
  const templates = input.templates || OUTBOUND_AUTO_REPLY_TEMPLATES;
  const { genuine, templateOnly } = hasGenuineOutbound(sent, templates);

  if (!genuine) {
    if (templateOnly) return { action: "pending", reason: "template_reply_only" };
    if (sent.length > 0 && sent.every((message) => !(message.body || "").trim())) {
      return { action: "pending", reason: "sent_mail_unverified" };
    }
    return { action: "pending", reason: "cold_inbound" };
  }

  const inboundTime = input.inboundDate ? Date.parse(input.inboundDate) : NaN;
  const genuineDates = sent
    .filter((message) => (message.body || "").trim() && !isAutoReplyTemplate(message.body, templates))
    .map((message) => (message.date ? Date.parse(message.date) : NaN))
    .filter((time) => !Number.isNaN(time));

  if (!Number.isNaN(inboundTime) && genuineDates.length > 0 && Math.min(...genuineDates) < inboundTime) {
    return { action: "create", reason: "tom_initiated" };
  }
  return { action: "create", reason: "two_way" };
}
