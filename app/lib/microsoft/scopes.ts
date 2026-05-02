// Delegated Microsoft Graph scopes for Humble Hello.
// These must match what's configured in the Azure App Registration.
//
// `offline_access` — required to receive a refresh token
// `User.Read`      — basic profile (used to populate microsoft_account_email, etc.)
// `Mail.Read`      — scan inbox for life events, contact enrichment, replies
// `Mail.Send`      — send welcome emails, cards, campaigns from user's mailbox
// `Contacts.ReadWrite` — bidirectional contact sync (mirrors Google Contacts)
// `Calendars.Read` — read events for life-event detection (anniversaries, meetings)

export const MICROSOFT_SCOPES = [
  'offline_access',
  'User.Read',
  'Mail.Read',
  'Mail.Send',
  'Contacts.ReadWrite',
  'Calendars.Read',
] as const;

export type MicrosoftScope = (typeof MICROSOFT_SCOPES)[number];