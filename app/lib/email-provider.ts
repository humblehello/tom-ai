import { createClient } from '@supabase/supabase-js';
import { sendMicrosoftMail } from './microsoft/mail';
import { getValidAccessToken } from './google';

/**
 * Provider-agnostic email send. Routes to whichever provider the user has
 * marked as primary in tom_users.primary_email_provider.
 */

export interface SendEmailParams {
  userId: string;
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  /** Plain text body. Will be converted to HTML for the html branch. */
  text?: string;
  /** HTML body. Takes precedence if both text and html are supplied. */
  html?: string;
  /** Display name to use in the From field. Defaults to user's name from DB. */
  fromName?: string;
  /** Reply-to address. Defaults to user's mailbox. */
  replyTo?: string;
}

export type EmailProvider = 'google' | 'microsoft';

interface UserEmailConfig {
  provider: EmailProvider;
  hasGoogle: boolean;
  hasMicrosoft: boolean;
  microsoftEmail: string | null;
  googleEmail: string | null;
  userName: string | null;
}

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function getUserEmailConfig(userId: string): Promise<UserEmailConfig> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('tom_users')
    .select(`
      name,
      email,
      primary_email_provider,
      refresh_token,
      google_account_email,
      microsoft_refresh_token,
      microsoft_account_email
    `)
    .eq('id', userId)
    .single();

  if (error || !data) throw new Error(`User ${userId} not found`);

  const hasGoogle = !!data.refresh_token;
  const hasMicrosoft = !!data.microsoft_refresh_token;

  let provider: EmailProvider = (data.primary_email_provider as EmailProvider) ?? 'google';
  if (provider === 'google' && !hasGoogle && hasMicrosoft) provider = 'microsoft';
  if (provider === 'microsoft' && !hasMicrosoft && hasGoogle) provider = 'google';

  return {
    provider,
    hasGoogle,
    hasMicrosoft,
    microsoftEmail: data.microsoft_account_email,
    googleEmail: data.google_account_email ?? data.email ?? null,
    userName: data.name,
  };
}

export async function sendUserEmail(params: SendEmailParams): Promise<void> {
  const config = await getUserEmailConfig(params.userId);

  if (!config.hasGoogle && !config.hasMicrosoft) {
    throw new Error(
      `User ${params.userId} has no email provider connected — cannot send`
    );
  }

  // Build HTML if we only got text
  const htmlBody = params.html ?? plainTextToHtml(params.text ?? '');
  const textBody = params.text ?? stripHtml(params.html ?? '');

  if (config.provider === 'microsoft') {
    await sendMicrosoftMail(params.userId, {
      to: params.to,
      cc: params.cc,
      bcc: params.bcc,
      subject: params.subject,
      html: htmlBody,
      text: textBody,
      replyTo: params.replyTo,
    });
    return;
  }

  // Google branch — send via Gmail API
  await sendGmail({
    userId: params.userId,
    to: params.to,
    cc: params.cc,
    bcc: params.bcc,
    subject: params.subject,
    htmlBody,
    textBody,
    fromName: params.fromName ?? config.userName ?? '',
    fromEmail: config.googleEmail ?? '',
    replyTo: params.replyTo,
  });
}

// ---------------------------------------------------------------------------
// Gmail send (extracted from app/api/email/send/route.ts pattern)
// ---------------------------------------------------------------------------

interface GmailSendParams {
  userId: string;
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  htmlBody: string;
  textBody: string;
  fromName: string;
  fromEmail: string;
  replyTo?: string;
}

async function sendGmail(params: GmailSendParams): Promise<void> {
  const accessToken = await getValidAccessToken(params.userId);

  const toList = Array.isArray(params.to) ? params.to.join(', ') : params.to;
  const ccList = params.cc
    ? (Array.isArray(params.cc) ? params.cc.join(', ') : params.cc)
    : null;
  const bccList = params.bcc
    ? (Array.isArray(params.bcc) ? params.bcc.join(', ') : params.bcc)
    : null;

  const fromHeader = params.fromName
    ? `${params.fromName} <${params.fromEmail}>`
    : params.fromEmail;

  const boundary = 'boundary_' + Date.now();
  const headers: string[] = [
    `To: ${toList}`,
    `From: ${fromHeader}`,
    `Subject: ${params.subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  if (ccList) headers.push(`Cc: ${ccList}`);
  if (bccList) headers.push(`Bcc: ${bccList}`);
  if (params.replyTo) headers.push(`Reply-To: ${params.replyTo}`);

  const emailLines = [
    ...headers,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    params.textBody,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    '',
    `<!DOCTYPE html><html><body style="font-family: sans-serif; font-size: 14px; color: #333;">${params.htmlBody}</body></html>`,
    '',
    `--${boundary}--`,
  ].join('\r\n');

  const encoded = Buffer.from(emailLines).toString('base64url');

  const res = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: encoded }),
    }
  );

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Gmail send failed (${res.status}): ${errBody}`);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function plainTextToHtml(text: string): string {
  return text
    .split('\n')
    .map((line) =>
      line.trim() ? `<p style="margin:0 0 8px 0;">${escapeHtml(line)}</p>` : '<br>'
    )
    .join('\n');
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function setPrimaryEmailProvider(
  userId: string,
  provider: EmailProvider
): Promise<EmailProvider> {
  const config = await getUserEmailConfig(userId);

  if (provider === 'google' && !config.hasGoogle) {
    throw new Error('Cannot set Google as primary — Google is not connected');
  }
  if (provider === 'microsoft' && !config.hasMicrosoft) {
    throw new Error('Cannot set Microsoft as primary — Microsoft is not connected');
  }

  const supabase = getSupabaseAdmin();

  await supabase
    .from('tom_users')
    .update({ primary_email_provider: provider })
    .eq('id', userId);

  return provider;
}