// Delegated Microsoft Graph scopes for Humble Hello.
// These must match what's configured in the Azure App Registration.
//
// AUTH_SCOPES — used in the initial /authorize request
//   offline_access — required to receive a refresh token
//   openid + profile — required for OIDC user identity
//   resource scopes — what the user is consenting to
//
// REFRESH_SCOPES — used when refreshing an access token
//   Resource scopes only. Microsoft's token endpoint expects you to omit
//   offline_access / openid / profile here; including them can trigger
//   AADSTS errors or warnings.

const RESOURCE_SCOPES = [
  'User.Read',
  'Mail.Read',
  'Mail.Send',
  'Contacts.ReadWrite',
  'Calendars.Read',
] as const;

export const MICROSOFT_AUTH_SCOPES = [
  'offline_access',
  'openid',
  'profile',
  ...RESOURCE_SCOPES,
] as const;

export const MICROSOFT_REFRESH_SCOPES = RESOURCE_SCOPES;

// Backwards-compat alias — kept so existing imports of MICROSOFT_SCOPES
// don't break. Points at the auth scopes (the more inclusive set).
export const MICROSOFT_SCOPES = MICROSOFT_AUTH_SCOPES;

export type MicrosoftScope = (typeof MICROSOFT_AUTH_SCOPES)[number];