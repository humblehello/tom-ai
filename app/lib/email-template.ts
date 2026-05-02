export function buildVerificationEmail({
  contactFirstName,
  senderFirstName,
  senderFullName,
  verifyUrl,
  appUrl,
  contact,
  opener,
}: {
  contactFirstName: string;
  senderFirstName: string;
  senderFullName: string;
  verifyUrl: string;
  appUrl: string;
  contact?: any;
  opener?: string;
}): string {

  const homeAddr = contact?.home_address;
  const workAddr = contact?.work_address;
  const homeDisplay = homeAddr?.streetAddress ? `${homeAddr.streetAddress}, ${homeAddr.city}, ${homeAddr.region} ${homeAddr.postalCode}` : null;
  const workDisplay = workAddr?.streetAddress ? `${workAddr.streetAddress}, ${workAddr.city}, ${workAddr.region} ${workAddr.postalCode}` : null;
  const phoneDisplay = contact?.phone || null;
  const birthdayDisplay = contact?.birthday || null;
  const titleDisplay = contact?.job_title ? `${contact.job_title}${contact.company ? ` at ${contact.company}` : ""}` : null;

  const infoRow = (label: string, value: string | null) => `
    <tr>
      <td style="padding:10px 14px;background-color:${value ? "#f9f6f3" : "#fff5f5"};border-radius:8px;margin-bottom:6px;display:block;">
        <div style="font-size:10px;font-weight:700;color:#888888;text-transform:uppercase;letter-spacing:0.08em;font-family:'Libre Baskerville',Georgia,serif;margin-bottom:3px;">${label}</div>
        <div style="font-size:14px;color:${value ? "#1a1a1a" : "#cc4444"};font-family:'EB Garamond',Georgia,serif;font-weight:${value ? "400" : "600"};">${value || "Missing — please add"}</div>
      </td>
    </tr>
    <tr><td style="height:6px;"></td></tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Contact info check</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f0eb;font-family:Arial,Helvetica,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f0eb;">
  <tr>
    <td align="center" style="padding:48px 24px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">

        <!-- Logo -->
        <tr>
          <td style="padding-bottom:28px;" align="center">
            <a href="${appUrl}" style="text-decoration:none;">
              <img src="https://humblehello.com/logo.png" alt="humble hello." width="180" style="display:block;margin:0 auto;" />
            </a>
          </td>
        </tr>

        <!-- Main card -->
        <tr>
          <td style="background-color:#ffffff;border:1px solid #e8e0d8;border-radius:14px;padding:32px;">

            <!-- Greeting -->
            <p style="font-size:16px;font-weight:700;color:#1a1a1a;font-family:'Libre Baskerville',Georgia,serif;margin:0 0 16px 0;line-height:1.7;">
              Hi ${contactFirstName},
            </p>

            <!-- Opener -->
            <p style="font-size:15px;color:#555555;font-family:Arial,Helvetica,sans-serif;margin:0 0 24px 0;line-height:1.7;">
              ${opener || "I want to make sure I have the most up to date contact info for you. Would you mind taking 30 seconds to confirm your details?"}
            </p>

            <!-- Divider -->
            <div style="height:1px;background-color:#e8e0d8;margin-bottom:20px;"></div>

            <!-- Section label -->
            <p style="font-size:11px;font-weight:700;color:#888888;text-transform:uppercase;letter-spacing:0.08em;font-family:'Libre Baskerville',Georgia,serif;margin:0 0 12px 0;">
              Here is what I have for you
            </p>

            <!-- Info rows -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
              ${infoRow("Home Address", homeDisplay)}
              ${infoRow("Work Address", workDisplay)}
              ${infoRow("Mobile Number", phoneDisplay)}
              ${infoRow("Birthday", birthdayDisplay)}
              ${infoRow("Title & Company", titleDisplay)}
            </table>

            <!-- CTA -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:10px;">
              <tr>
                <td align="center">
                  <a href="${verifyUrl}"
                    style="display:inline-block;background-color:#6b9970;color:#ffffff;font-size:15px;font-weight:700;font-family:'Libre Baskerville',Georgia,serif;text-decoration:none;padding:13px 40px;border-radius:8px;">
                    Update My Info
                  </a>
                </td>
              </tr>
            </table>

            <!-- Looks correct CTA -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
              <tr>
                <td align="center">
                  <a href="${verifyUrl}?confirm=true"
                    style="display:inline-block;color:#888888;font-size:13px;font-family:Arial,Helvetica,sans-serif;text-decoration:underline;padding:8px;">
                    Everything looks correct
                  </a>
                </td>
              </tr>
            </table>

            <!-- Divider -->
            <div style="height:1px;background-color:#e8e0d8;margin-bottom:20px;"></div>

            <!-- Sign off -->
            <p style="font-size:15px;color:#555555;font-family:Arial,Helvetica,sans-serif;margin:0 0 6px 0;line-height:1.7;">
              Thank you! I'm trying to keep my records updated so we can stay in touch.
            </p>
            <p style="font-size:15px;font-weight:700;color:#1a1a1a;font-family:'Libre Baskerville',Georgia,serif;margin:0;">
              - ${senderFirstName}
            </p>

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:24px 4px 0;">
            <div style="height:1px;background-color:#e8e0d8;margin-bottom:16px;"></div>
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center">
                  <p style="font-size:11px;color:#aaaaaa;font-family:Arial,Helvetica,sans-serif;margin:0 0 16px 0;line-height:1.8;">
                    Sent via Humble Hello on behalf of ${senderFullName}
                    &nbsp;&middot;&nbsp;
                    <a href="${verifyUrl}?optout=1" style="color:#aaaaaa;text-decoration:underline;">Remove me from this list</a>
                  </p>
                  <div style="height:1px;background-color:#e8e0d8;margin-bottom:16px;"></div>
                  <a href="${appUrl}" style="text-decoration:none;display:block;">
                    <img src="https://humblehello.com/logo.png" alt="humble hello." width="160" style="display:block;margin:0 auto 8px;" />
                    <span style="font-size:15px;font-weight:700;color:#bf5c38;font-family:'Libre Baskerville',Georgia,serif;display:block;text-align:center;">Join for free</span>
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Button not working — very bottom -->
        <tr>
          <td style="padding:16px 4px 0;">
            <p style="font-size:11px;color:#cccccc;font-family:Arial,Helvetica,sans-serif;margin:0;line-height:1.7;">
              Button not working? Use this link:<br/>
              <a href="${verifyUrl}" style="color:#aaaaaa;text-decoration:none;word-break:break-all;">${verifyUrl}</a>
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