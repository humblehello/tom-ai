export type VerificationEmailInput = {
  contactFirstName: string;
  senderFirstName: string;
  senderFullName: string;
  verifyUrl: string;
  appUrl: string;
  contact?: Record<string, unknown> | null;
  opener?: string;
};

type OnFileLine = { label: string; value: string };

const DEFAULT_OPENER =
  "I'm going through the people I want to stay in touch with, and I want to be sure I still have the right details for you. If anything below is off, just reply to this email and tell me. Or tap the button if that's easier.";

const EMPTY_ON_FILE =
  "I don't have an address, phone, or birthday saved for you yet. A reply with whatever you're comfortable sharing is plenty.";

const SECURE_PAGE_NOTE =
  "Opens a secure page on humblehello.com — no login or password.";

const FOOTER_NOTE =
  "I keep my contacts in Humble Hello, an app I built to stay in touch with people. Want to try it? It's free.";

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function formatAddress(addr: unknown): string | null {
  if (!addr || typeof addr !== "object") return null;
  const record = addr as Record<string, unknown>;
  const street = text(record.streetAddress);
  const city = text(record.city);
  const region = text(record.region);
  const postal = text(record.postalCode);
  if (!street && !city && !region && !postal) return null;
  const locality = [city, [region, postal].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [street, locality].filter(Boolean).join(", ");
}

export function verificationOnFileLines(contact?: Record<string, unknown> | null): OnFileLine[] {
  const lines: OnFileLine[] = [];
  const home = formatAddress(contact?.home_address);
  const work = formatAddress(contact?.work_address);
  const phone = text(contact?.phone);
  const email = text(contact?.email);
  const birthday = text(contact?.birthday);
  const title = [text(contact?.job_title), text(contact?.company)].filter(Boolean).join(" at ");

  if (home) lines.push({ label: "Home", value: home });
  if (work) lines.push({ label: "Work", value: work });
  if (phone) lines.push({ label: "Mobile", value: phone });
  if (email) lines.push({ label: "Email", value: email });
  if (birthday) lines.push({ label: "Birthday", value: birthday });
  if (title) lines.push({ label: "Title", value: title });
  return lines;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildVerificationText({
  contactFirstName,
  senderFirstName,
  verifyUrl,
  appUrl,
  contact,
  opener,
}: VerificationEmailInput): string {
  const lines = verificationOnFileLines(contact);
  const onFile = lines.length
    ? `Here's what I have:\n${lines.map((line) => `${line.label}: ${line.value}`).join("\n")}`
    : EMPTY_ON_FILE;

  return `Hi ${contactFirstName},

${opener || DEFAULT_OPENER}

${onFile}

Update my info:
${verifyUrl}

${SECURE_PAGE_NOTE}

Thank you,
${senderFirstName}

--
${FOOTER_NOTE}
Try Humble Hello free: ${appUrl}

Prefer I don't ask? Let me know — just reply, or use this link:
${verifyUrl}?optout=1`;
}

export function buildVerificationEmail(input: VerificationEmailInput): string {
  const {
    contactFirstName,
    senderFirstName,
    verifyUrl,
    appUrl,
    opener,
  } = input;
  const lines = verificationOnFileLines(input.contact);
  const note = escapeHtml(opener || DEFAULT_OPENER);
  const safeVerifyUrl = escapeHtml(verifyUrl);
  const safeAppUrl = escapeHtml(appUrl);
  const onFileHtml = lines.length
    ? `<p style="margin:0 0 8px 0;font-size:15px;line-height:1.6;color:#241a0f;">Here's what I have:</p>
            <p style="margin:0 0 22px 0;font-size:15px;line-height:1.7;color:#241a0f;">
              ${lines.map((line) => `<span style="display:block;">${escapeHtml(line.label)}: ${escapeHtml(line.value)}</span>`).join("")}
            </p>`
    : `<p style="margin:0 0 22px 0;font-size:15px;line-height:1.6;color:#241a0f;">${escapeHtml(EMPTY_ON_FILE)}</p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(contactFirstName)}, a note about your info</title>
</head>
<body style="margin:0;padding:0;background-color:#f7f3ee;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f7f3ee;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
        <tr>
          <td style="padding:8px 8px 28px;font-family:Georgia,'Times New Roman',serif;color:#241a0f;">
            <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">Hi ${escapeHtml(contactFirstName)},</p>
            <p style="margin:0 0 20px 0;font-size:16px;line-height:1.65;">${note}</p>
            ${onFileHtml}
            <table cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px 0;">
              <tr>
                <td align="center" style="background-color:#3d6b42;border-radius:6px;">
                  <a href="${safeVerifyUrl}" style="display:inline-block;padding:12px 22px;font-family:Georgia,'Times New Roman',serif;font-size:15px;color:#ffffff;text-decoration:none;">Update my info</a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 22px 0;font-size:13px;line-height:1.5;color:#6b5c4e;font-family:Georgia,'Times New Roman',serif;">${SECURE_PAGE_NOTE}</p>
            <p style="margin:0;font-size:16px;line-height:1.6;">Thank you,<br/>${escapeHtml(senderFirstName)}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:22px 8px 8px;border-top:1px solid #e4d9cc;font-family:Georgia,'Times New Roman',serif;">
            <a href="${safeAppUrl}" style="text-decoration:none;">
              <img src="https://humblehello.com/logo.png" alt="Humble Hello" width="96" style="display:block;margin:0 0 12px 0;border:0;" />
            </a>
            <p style="margin:0 0 10px 0;font-size:13px;line-height:1.6;color:#6b5c4e;">${FOOTER_NOTE}</p>
            <p style="margin:0 0 16px 0;font-size:13px;line-height:1.5;">
              <a href="${safeAppUrl}" style="color:#9a4429;text-decoration:underline;">Try Humble Hello free</a>
            </p>
            <p style="margin:0;font-size:12px;line-height:1.5;color:#8a7b6c;">
              <a href="${safeVerifyUrl}?optout=1" style="color:#8a7b6c;text-decoration:underline;">Prefer I don't ask? Let me know</a>
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
