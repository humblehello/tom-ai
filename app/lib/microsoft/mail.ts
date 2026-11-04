import { graphFetch, graphPaginate } from './graph';

// ---------------------------------------------------------------------------
// Types — minimal subset of Graph Message we actually use
// ---------------------------------------------------------------------------

export interface GraphRecipient {
  emailAddress: { name?: string; address: string };
}

export interface GraphMessage {
  id: string;
  subject?: string;
  bodyPreview?: string;
  body?: { contentType: 'text' | 'html'; content: string };
  from?: GraphRecipient;
  sender?: GraphRecipient;
  toRecipients?: GraphRecipient[];
  ccRecipients?: GraphRecipient[];
  receivedDateTime?: string;
  sentDateTime?: string;
  conversationId?: string;
  internetMessageId?: string;
  isRead?: boolean;
  hasAttachments?: boolean;
}

export interface SendMailParams {
  to: string | string[];
  toName?: string;          // ← add this
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  html: string;
  text?: string;
  saveToSentItems?: boolean;
  replyTo?: string;
  fromName?: string;
  fromEmail?: string;
}

// ---------------------------------------------------------------------------
// Send
// ---------------------------------------------------------------------------

export async function sendMicrosoftMail(
  userId: string,
  params: SendMailParams
): Promise<void> {
  if (params.text && params.fromEmail && params.saveToSentItems !== false) {
    const mime = buildMultipartAlternative(params);
    const encoded = Buffer.from(mime, 'utf8').toString('base64');
    await graphFetch(userId, '/me/sendMail', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: encoded,
    });
    return;
  }

  const message = {
    subject: params.subject,
    body: { contentType: 'HTML', content: params.html },
    toRecipients: toRecipientList(params.to),
    ...(params.cc ? { ccRecipients: toRecipientList(params.cc) } : {}),
    ...(params.bcc ? { bccRecipients: toRecipientList(params.bcc) } : {}),
    ...(params.replyTo
      ? { replyTo: toRecipientList(params.replyTo) }
      : {}),
  };

  await graphFetch(userId, '/me/sendMail', {
    method: 'POST',
    body: JSON.stringify({
      message,
      saveToSentItems: params.saveToSentItems ?? true,
    }),
  });
}

function buildMultipartAlternative(params: SendMailParams): string {
  const boundary = `hh_${Date.now().toString(36)}`;
  const headers = [
    `From: ${formatMailbox(params.fromName, params.fromEmail || '')}`,
    `To: ${headerAddressList(params.to)}`,
    `Subject: ${encodeMimeHeader(params.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  if (params.cc) headers.push(`Cc: ${headerAddressList(params.cc)}`);
  if (params.bcc) headers.push(`Bcc: ${headerAddressList(params.bcc)}`);
  if (params.replyTo) headers.push(`Reply-To: ${headerAddressList(params.replyTo)}`);

  return [
    headers.join('\r\n'),
    '',
    `--${boundary}`,
    mimeBodyPart('text/plain; charset="UTF-8"', params.text || ''),
    `--${boundary}`,
    mimeBodyPart('text/html; charset="UTF-8"', params.html),
    `--${boundary}--`,
    '',
  ].join('\r\n');
}

function headerAddressList(addrs: string | string[]): string {
  const arr = Array.isArray(addrs) ? addrs : [addrs];
  return arr.map((raw) => {
    const match = raw.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
    if (!match) return raw.trim();
    return formatMailbox(match[1], match[2]);
  }).join(', ');
}

function formatMailbox(name: string | undefined, email: string): string {
  const trimmed = name?.trim();
  if (!trimmed) return email.trim();
  return `${encodeDisplayName(trimmed)} <${email.trim()}>`;
}

function encodeDisplayName(name: string): string {
  if (/[^\t\x20-\x7E]/.test(name)) return encodeMimeHeader(name);
  if (/["\\,;<>]/.test(name)) {
    return `"${name.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return name;
}

function encodeMimeHeader(value: string): string {
  if (/^[\t\x20-\x7E]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function mimeBodyPart(contentType: string, content: string): string {
  const encoded = Buffer.from(content, 'utf8')
    .toString('base64')
    .replace(/.{76}/g, '$&\r\n');
  return [
    `Content-Type: ${contentType}`,
    'Content-Transfer-Encoding: base64',
    '',
    encoded,
    '',
  ].join('\r\n');
}

function toRecipientList(addrs: string | string[]): GraphRecipient[] {
  const arr = Array.isArray(addrs) ? addrs : [addrs];
  return arr.map((raw) => {
    // Accept "Name <email@x.com>" envelope syntax or bare "email@x.com"
    const match = raw.match(/^\s*(.+?)\s*<([^>]+)>\s*$/);
    if (match) {
      return { emailAddress: { name: match[1].trim(), address: match[2].trim() } };
    }
    return { emailAddress: { address: raw.trim() } };
  });
}

// ---------------------------------------------------------------------------
// Scan (delta query for incremental sync)
//
// Graph delta returns @odata.deltaLink on the LAST page. We persist that link
// and use it on the next scan to fetch only changes since last call.
// First-ever scan should pass `deltaLink = null` — Graph returns the initial
// state plus a fresh deltaLink we save for next time.
// ---------------------------------------------------------------------------

export interface MailScanResult {
  messages: GraphMessage[];
  newDeltaLink: string | undefined;
}

const SELECT_FIELDS = [
  'id',
  'subject',
  'bodyPreview',
  'from',
  'sender',
  'toRecipients',
  'ccRecipients',
  'receivedDateTime',
  'sentDateTime',
  'conversationId',
  'internetMessageId',
  'isRead',
  'hasAttachments',
].join(',');

/**
 * Scan inbox for new messages.
 *
 * @param userId  HH user id
 * @param deltaLink  Saved @odata.deltaLink from previous scan (or null on first run)
 * @param limit  Soft cap on number of messages returned this run (default 500)
 */
export async function scanMicrosoftMail(
  userId: string,
  deltaLink: string | null,
  limit = 500
): Promise<MailScanResult> {
  const startUrl = deltaLink
    ? deltaLink
    : `/me/mailFolders/inbox/messages/delta?$select=${SELECT_FIELDS}&$top=100`;

  const messages: GraphMessage[] = [];
  let newDeltaLink: string | undefined;

  const iterator = graphPaginate<GraphMessage>(userId, startUrl, {
    absoluteUrl: startUrl.startsWith('https://'),
  });

  while (true) {
    const next = await iterator.next();
    if (next.done) {
      newDeltaLink = next.value;
      break;
    }
    messages.push(next.value);
    if (messages.length >= limit) {
      // Stop early; we'll pick up where we left off on the next scan via nextLink
      // (nextLink behaves like a continuation token; deltaLink only appears on last page)
      break;
    }
  }

  return { messages, newDeltaLink };
}

/** Fetch full message body (Graph delta returns metadata only). */
export async function fetchMicrosoftMessageBody(
  userId: string,
  messageId: string
): Promise<GraphMessage> {
  return graphFetch<GraphMessage>(
    userId,
    `/me/messages/${encodeURIComponent(messageId)}?$select=id,subject,body,from,toRecipients,receivedDateTime,conversationId`
  );
}