import { createClient } from '@supabase/supabase-js';
import { sendMicrosoftMail } from './microsoft/mail';
// Adjust this import to match your existing Gmail helper:
// import { sendGmail } from './google/gmail';

/**
 * Provider-agnostic email send. Routes to whichever provider the user has
 * marked as primary in tom_users.primary_email_provider.
 *
 * Use this everywhere the app sends mail on behalf of a user:
 *   - welcome email on onboarding_complete
 *   - card draft notifications
 *   - campaign step sends
 *   - verification emails
 *   - life-event triggered messages
 *
 * Keeps the call sites clean — they don't need to know which provider sent.
 */

export interface SendEmailParams {
  userId: string;
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export type EmailProvider = 'google' | 'microsoft';

interface UserEmailConfig {
  provider: EmailProvider;
  hasGoogle: boolean;
  hasMicrosoft: boolean;
  microsoftEmail: string | null;
  googleEmail: string | null;
}

export async function getUserEmailConfig(userId: string): Promise<UserEmailConfig> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data, error } = await supabase
    .from('tom_users')
    .select(`
      primary_email_provider,
      google_refresh_token,
      google_account_email,
      microsoft_refresh_token,
      microsoft_account_email
    `)
    .eq('id', userId)
    .single();

  if (error || !data) throw new Error(`User ${userId} not found`);

  const hasGoogle = !!data.google_refresh_token;
  const hasMicrosoft = !!data.microsoft_refresh_token;

  // Determine effective provider — fall back to whichever is connected
  // if their stated preference points at one they no longer have.
  let provider: EmailProvider = (data.primary_email_provider as EmailProvider) ?? 'google';
  if (provider === 'google' && !hasGoogle && hasMicrosoft) provider = 'microsoft';
  if (provider === 'microsoft' && !hasMicrosoft && hasGoogle) provider = 'google';

  return {
    provider,
    hasGoogle,
    hasMicrosoft,
    microsoftEmail: data.microsoft_account_email,
    googleEmail: data.google_account_email,
  };
}

export async function sendUserEmail(params: SendEmailParams): Promise<void> {
  const config = await getUserEmailConfig(params.userId);

  if (!config.hasGoogle && !config.hasMicrosoft) {
    throw new Error(
      `User ${params.userId} has no email provider connected — cannot send`
    );
  }

  if (config.provider === 'microsoft') {
    await sendMicrosoftMail(params.userId, {
      to: params.to,
      cc: params.cc,
      bcc: params.bcc,
      subject: params.subject,
      html: params.html,
      text: params.text,
      replyTo: params.replyTo,
    });
    return;
  }

  // Google path — wire to your existing Gmail send helper.
  // Throwing rather than silently swallowing keeps drift visible during refactor.
  throw new Error(
    'TODO: wire sendUserEmail Google path to existing sendGmail() helper'
  );
  // Example once wired:
  // await sendGmail({
  //   userId: params.userId,
  //   to: params.to,
  //   cc: params.cc,
  //   bcc: params.bcc,
  //   subject: params.subject,
  //   html: params.html,
  //   text: params.text,
  //   replyTo: params.replyTo,
  // });
}

/**
 * Switch a user's primary provider. Only allowed if the target provider is
 * actually connected. Returns the new effective provider.
 */
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

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  await supabase
    .from('tom_users')
    .update({ primary_email_provider: provider })
    .eq('id', userId);

  return provider;
}