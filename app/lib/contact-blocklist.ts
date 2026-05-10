/**
 * Email local-part keywords that should never become contacts.
 * Substring match, case-insensitive.
 *
 * If a keyword appears anywhere in the local-part (before the @),
 * the email is considered an automated/role/transactional sender
 * and a contact will not be created for it.
 *
 * Last updated: 2026-05-10
 */
export const BLOCKED_LOCAL_PARTS = [
  // No-reply variants
  "noreply", "no-reply", "no_reply", "donotreply", "do-not-reply",
  "csdonotreply", "reply", "replies",

  // Notifications & automation
  "notifications", "notification", "notetaker", "alerts", "alert",
  "updates", "update", "automat", "robot", "bot",

  // Generic role accounts
  "info", "hello", "hi", "mail", "mailer", "web", "webmaster",
  "team", "admin", "administrator", "support", "help",
  "contact", "contacts", "service", "system", "message",

  // Sales / commerce / billing
  "sales", "invoice", "invoices", "billing", "pay-per", "payper",
  "ar", "quickbooks", "quickbook", "accounts", "account",
  "orders", "order", "shipping", "delivery",

  // Lead / marketing
  "lead", "leads", "marketing", "newsletter", "news",
  "feedback", "survey", "unsubscribe",

  // Customer service
  "customer_service", "customer-service", "customerservice",
  "customer.care", "customercare", "customercaretransactional",
  "customersentiment", "account-services", "accountservices",
  "account_services",

  // Events & scheduling
  "appointments", "events", "reservations", "rewards", "benefits",

  // Mail-system addresses (catches bounces, abuse, etc.)
  "postmaster", "hostmaster", "bounce", "abuse", "spam", "junk",

  // Misc role
  "workwithus", "sport", "sports",
];

/**
 * Returns true if the email looks like an automated/role/transactional sender
 * and should NOT be created as a contact.
 */
export function isBlockedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const lower = email.toLowerCase().trim();
  if (!lower.includes("@")) return false;

  const local = lower.split("@")[0];

  for (const keyword of BLOCKED_LOCAL_PARTS) {
    if (local.includes(keyword)) return true;
  }

  return false;
}