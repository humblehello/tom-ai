import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { insertDecision, type ExistingContactLookup } from "./contact-dedupe";
import { auditContactPhones } from "./phone-audit";
import { phoneDisplayLabel } from "./phone-label";
import {
  htmlToNewContent,
  mergeSignatureParses,
  parseSenderSignature,
  phoneDigits,
  signatureFieldUpdates,
  stripMapAndPhoneLinks,
  stripQuotedAndForwarded,
  type InternalEmployee,
} from "./signature-parser";

const MAP = "https://www.google.com/maps/search/480+264-6344?entry=gmail&source=g";
const MAP_DIRECT = "https://www.google.com/maps/search/480+702-2750?entry=gmail&source=g";

/** Wes's reply, signature at the top, Kirk's signature inside the quote. */
const WES_REPLY = `Wes Dobias
Hoodz
Office: (480 <${MAP}> 264-6344)
Direct: (480 <${MAP_DIRECT}> 702-2750)

On Fri, Oct 16, 2026, 12:35 PM Kirk Meyer wrote:

Kirk Meyer
Thumbprint
M 214.796.4212
`;

const KIRK_REPLY = `Kirk Meyer
Thumbprint
M 214.796.4212

On Fri, Oct 16, 2026, 12:35 PM Wes Dobias <wes.dobias@hoodz.us.com> wrote:

Wes Dobias
Hoodz
Office: (480) 264-6344
Direct: (480) 702-2750
`;

const WES_HTML = `
<div dir="ltr">Thanks<br>Wes Dobias<br>Hoodz<br>
Office: <a href="${MAP}">(480) 264-6344</a><br>
Direct: <a href="tel:+14807022750">(480) 702-2750</a>
</div>
<div class="gmail_quote">
<div class="gmail_attr">On Fri, Oct 16, 2026, 12:35 PM Kirk Meyer &lt;kmeyer@thumbprint.com&gt; wrote:</div>
<blockquote class="gmail_quote">
Kirk Meyer<br>M 214.796.4212
</blockquote>
</div>`;

const KIRK: InternalEmployee = {
  name: "Kirk Meyer",
  emails: ["kmeyer@thumbprint.com"],
  phones: ["214.796.4212"],
};

function digitsOf(result: { acceptedPhones: { digits: string; label: string }[] }) {
  return result.acceptedPhones.map((phone) => `${phone.label}:${phone.digits}`).sort();
}

describe("Wes Dobias reply quoting Kirk Meyer", () => {
  it("keeps Wes's office and direct numbers and drops Kirk's mobile", () => {
    const parsed = parseSenderSignature({
      bodyText: WES_REPLY,
      senderName: "Wes Dobias",
      senderEmail: "wes.dobias@hoodz.us.com",
      headers: [{ name: "From", value: "Wes Dobias <wes.dobias@hoodz.us.com>" }],
      internalEmployees: [KIRK],
    });

    assert.equal(parsed.nameMatches, true);
    assert.equal(parsed.signatureName, "Wes Dobias");
    assert.deepEqual(digitsOf(parsed), ["direct:4807022750", "office:4802646344"]);
    assert.equal(parsed.newContent.includes("214.796.4212"), false);
    assert.equal(parsed.newContent.includes("Kirk Meyer"), false);
  });

  it("does not give Wes's numbers to Kirk when Kirk quotes Wes", () => {
    const parsed = parseSenderSignature({
      bodyText: KIRK_REPLY,
      senderName: "Kirk Meyer",
      senderEmail: "kmeyer@thumbprint.com",
      headers: [{ name: "From", value: "Kirk Meyer <kmeyer@thumbprint.com>" }],
      internalEmployees: [KIRK],
    });

    assert.equal(parsed.nameMatches, true);
    assert.deepEqual(digitsOf(parsed), ["cell:2147964212"]);
    assert.equal(parsed.acceptedPhones[0].rawLabel, "m");
    assert.equal(parsed.newContent.includes("480"), false);
  });

  it("parses the same reply from HTML, ignoring gmail_quote and blockquote", () => {
    const parsed = parseSenderSignature({
      bodyHtml: WES_HTML,
      senderName: "Wes Dobias",
      senderEmail: "wes.dobias@hoodz.us.com",
    });
    assert.deepEqual(digitsOf(parsed), ["direct:4807022750", "office:4802646344"]);
    assert.equal(parsed.newContent.includes("Kirk"), false);
  });

  it("prefers intact HTML numbers when the plain-text part is split by a map link", () => {
    const parsed = parseSenderSignature({
      bodyText: WES_REPLY,
      bodyHtml: WES_HTML,
      senderName: "Wes Dobias",
      senderEmail: "wes.dobias@hoodz.us.com",
    });
    assert.deepEqual(digitsOf(parsed), ["direct:4807022750", "office:4802646344"]);
  });
});

describe("quoted and forwarded signatures", () => {
  const wesBlock = `Wes Dobias
Office: (480) 264-6344
Direct: (480) 702-2750`;

  it("cuts an Outlook From/Sent header", () => {
    const body = `${wesBlock}

________________________________
From: Kirk Meyer <kmeyer@thumbprint.com>
Sent: Friday, October 16, 2026 12:35 PM
To: Wes Dobias
Subject: Re: Proposal

Kirk Meyer
M 214.796.4212
`;
    const parsed = parseSenderSignature({
      bodyText: body,
      senderName: "Wes Dobias",
      senderEmail: "wes.dobias@hoodz.us.com",
    });
    assert.deepEqual(digitsOf(parsed), ["direct:4807022750", "office:4802646344"]);
  });

  it("cuts an Original Message block", () => {
    const body = `${wesBlock}

-----Original Message-----
From: Kirk Meyer
Sent: Friday, October 16, 2026 12:35 PM
To: Wes Dobias
Subject: Re: Proposal

M 214.796.4212
`;
    const stripped = stripQuotedAndForwarded(body);
    assert.equal(stripped.includes("214.796.4212"), false);
    const parsed = parseSenderSignature({
      bodyText: body,
      senderName: "Wes Dobias",
      senderEmail: "wes.dobias@hoodz.us.com",
    });
    assert.deepEqual(digitsOf(parsed), ["direct:4807022750", "office:4802646344"]);
  });

  it("drops '>' quoted lines", () => {
    const body = `${wesBlock}

> Kirk Meyer
> M 214.796.4212
> Thumbprint
`;
    const parsed = parseSenderSignature({
      bodyText: body,
      senderName: "Wes Dobias",
      senderEmail: "wes.dobias@hoodz.us.com",
    });
    assert.deepEqual(digitsOf(parsed), ["direct:4807022750", "office:4802646344"]);
  });

  it("drops a forwarded block", () => {
    const body = `Wes Dobias
Direct: (480) 702-2750

---------- Forwarded message ---------
From: Kirk Meyer <kmeyer@thumbprint.com>
Date: Fri, Oct 16, 2026 at 12:35 PM
Subject: Hi
To: Wes Dobias <wes.dobias@hoodz.us.com>

Kirk Meyer
M 214.796.4212
`;
    const parsed = parseSenderSignature({
      bodyText: body,
      senderName: "Wes Dobias",
      senderEmail: "wes.dobias@hoodz.us.com",
    });
    assert.deepEqual(digitsOf(parsed), ["direct:4807022750"]);
    assert.equal(parsed.newContent.includes("214"), false);
  });

  it("cuts a wrapped On...wrote attribution", () => {
    const body = `Wes Dobias
Office: (480) 264-6344

On Fri, Oct 16, 2026, 12:35 PM Kirk Meyer <
kmeyer@thumbprint.com> wrote:

Kirk Meyer
M 214.796.4212
`;
    const parsed = parseSenderSignature({
      bodyText: body,
      senderName: "Wes Dobias",
      senderEmail: "wes.dobias@hoodz.us.com",
    });
    assert.deepEqual(digitsOf(parsed), ["office:4802646344"]);
    assert.equal(parsed.newContent.includes("214"), false);
  });

  it("drops a Begin forwarded message block", () => {
    const body = `Wes Dobias
Office: (480) 264-6344

Begin forwarded message:

From: Kirk Meyer <kmeyer@thumbprint.com>
M 214.796.4212
`;
    assert.equal(stripQuotedAndForwarded(body).includes("214"), false);
  });

  it("rejects the signature when the name is not the sender, even with no quote marker", () => {
    const parsed = parseSenderSignature({
      bodyText: `Kirk Meyer
Thumbprint
M 214.796.4212
`,
      senderName: "Wes Dobias",
      senderEmail: "wes.dobias@hoodz.us.com",
      headers: [{ name: "From", value: "Wes Dobias <wes.dobias@hoodz.us.com>" }],
    });
    assert.equal(parsed.skipped, true);
    assert.equal(parsed.skipReason, "name_mismatch");
    assert.equal(parsed.acceptedPhones.length, 0);
  });

  it("rejects a block that still contains two people's names", () => {
    const parsed = parseSenderSignature({
      bodyText: `${wesBlock}

Kirk Meyer
M 214.796.4212
`,
      senderName: "Wes Dobias",
      senderEmail: "wes.dobias@hoodz.us.com",
    });
    assert.equal(parsed.skipReason, "ambiguous_signature");
    assert.equal(parsed.acceptedPhones.length, 0);
  });
});

describe("labels, map links, and guards", () => {
  it("rejoins a number split by a Gmail map link", () => {
    const cleaned = stripMapAndPhoneLinks(`Office: (480 <${MAP}> 264-6344)`);
    assert.match(cleaned, /\(480\) 264-6344/);
    assert.equal(cleaned.includes("google.com"), false);
  });

  it("maps Mobile, M, Cell, Direct, and Office without collapsing to the M number", () => {
    const parsed = parseSenderSignature({
      bodyText: `Wes Dobias
Mobile: (480) 111-2222
Cell: (480) 111-3333
M: (480) 111-4444
Direct: (480) 702-2750
Office: (480) 264-6344
`,
      senderName: "Wes Dobias",
      senderEmail: "wes.dobias@hoodz.us.com",
    });
    // First cell-labeled number wins for that label when merging within one signature;
    // Mobile, Cell, and M are all cell, so the first is kept and the rest are duplicates of the label.
    const labels = parsed.phones.map((phone) => phone.label);
    assert.ok(labels.includes("cell"));
    assert.ok(labels.includes("direct"));
    assert.ok(labels.includes("office"));
    assert.equal(parsed.phones.find((phone) => phone.rawLabel === "mobile")?.digits, "4801112222");
    assert.equal(parsed.phones.find((phone) => phone.label === "direct")?.digits, "4807022750");
    assert.equal(parsed.phones.find((phone) => phone.label === "office")?.digits, "4802646344");
  });

  it("keeps Office and Mobile from the same signature instead of saving only M", () => {
    const parsed = parseSenderSignature({
      bodyText: `Wes Dobias
Office: (480) 264-6344
M 480.111.2222
`,
      senderName: "Wes Dobias",
      senderEmail: "wes.dobias@hoodz.us.com",
    });
    assert.deepEqual(digitsOf(parsed), ["cell:4801112222", "office:4802646344"]);
  });

  it("does not put an internal employee's number on an outside contact", () => {
    const parsed = parseSenderSignature({
      bodyText: `Wes Dobias
Office: (480) 264-6344
M 214.796.4212
`,
      senderName: "Wes Dobias",
      senderEmail: "wes.dobias@hoodz.us.com",
      internalEmployees: [KIRK],
    });
    assert.deepEqual(digitsOf(parsed), ["office:4802646344"]);
    assert.equal(parsed.conflicts[0].kind, "internal_employee");
    assert.equal(parsed.conflicts[0].detail.includes("Kirk Meyer"), true);
  });

  it("allows Kirk's number on his personal address when the name matches", () => {
    const parsed = parseSenderSignature({
      bodyText: `Kirk Meyer
M 214.796.4212
`,
      senderName: "Kirk Meyer",
      senderEmail: "kirkmeyer2@gmail.com",
      internalEmployees: [KIRK],
    });
    assert.deepEqual(digitsOf(parsed), ["cell:2147964212"]);
    assert.equal(parsed.conflicts.length, 0);
  });

  it("does not silently overwrite a phone that is already stored", () => {
    const parsed = parseSenderSignature({
      bodyText: `Wes Dobias
Direct: (480) 702-2750
Office: (480) 264-6344
`,
      senderName: "Wes Dobias",
      senderEmail: "wes.dobias@hoodz.us.com",
    });
    const update = signatureFieldUpdates(parsed, { phone: "(317) 555-0199" });
    assert.equal(update.updates.phone, undefined);
    assert.equal(update.updates.phones, undefined);
    assert.equal(update.conflicts.every((conflict) => conflict.kind === "existing_number"), true);
    assert.equal(update.conflicts.length, 2);
  });

  it("flags a number that already belongs to a different contact", () => {
    const parsed = parseSenderSignature({
      bodyText: `Wes Dobias
Office: (480) 264-6344
`,
      senderName: "Wes Dobias",
      senderEmail: "wes.dobias@hoodz.us.com",
      phonesOnOtherContacts: [{ name: "Gabe Peters", email: "gabe@example.com", digits: "4802646344" }],
    });
    assert.equal(parsed.acceptedPhones.length, 0);
    assert.equal(parsed.conflicts[0].kind, "on_other_contact");
    assert.equal(parsed.conflicts[0].detail.includes("Gabe Peters"), true);
  });

  it("writes labeled phones onto an empty contact and only uses mobile for the texting field", () => {
    const parsed = parseSenderSignature({
      bodyText: `Wes Dobias
Office: (480) 264-6344
Direct: (480) 702-2750
M 480.555.0100
`,
      senderName: "Wes Dobias",
      senderEmail: "wes.dobias@hoodz.us.com",
    });
    const update = signatureFieldUpdates(parsed, {});
    assert.equal(update.updates.phone, "(480) 555-0100");
    assert.deepEqual(
      update.updates.phones?.map((phone) => `${phone.label}:${phoneDigits(phone.number)}`),
      ["office:4802646344", "direct:4807022750", "mobile:4805550100"]
    );
    assert.deepEqual(
      update.googlePhones.map((phone) => phone.googleType),
      ["main", "work", "mobile"]
    );
  });

  it("shows direct and office labels instead of calling them home", () => {
    assert.equal(phoneDisplayLabel({ type: "work", label: "direct" }), "direct");
    assert.equal(phoneDisplayLabel({ type: "work", label: "office" }), "office");
    assert.equal(phoneDisplayLabel({ type: "cell", label: "mobile" }), "cell");
    assert.equal(phoneDisplayLabel({ type: "cell" }), "cell");
  });
});

describe("auto-replies and sent mail", () => {
  it("ignores an automatic reply", () => {
    const parsed = parseSenderSignature({
      bodyText: `Wes Dobias
Office: (480) 264-6344
`,
      senderName: "Wes Dobias",
      senderEmail: "wes.dobias@hoodz.us.com",
      headers: [
        { name: "From", value: "Wes Dobias <wes.dobias@hoodz.us.com>" },
        { name: "Subject", value: "Automatic reply: Out of office" },
        { name: "Auto-Submitted", value: "auto-replied" },
      ],
    });
    assert.equal(parsed.skipReason, "auto_reply");
    assert.equal(parsed.acceptedPhones.length, 0);
  });

  it("does not give a sent-mail signature to the recipient", () => {
    const parsed = parseSenderSignature({
      bodyText: `Tom Rector
M 317.555.0100
`,
      senderName: "Wes Dobias",
      senderEmail: "wes.dobias@hoodz.us.com",
      folder: "sent",
      headers: [{ name: "From", value: "Tom Rector <tom@thumbprint.com>" }],
    });
    assert.equal(parsed.skipReason, "sent_mail");
    assert.equal(parsed.acceptedPhones.length, 0);
  });

  it("ignores a message whose From address is not the contact being enriched", () => {
    const parsed = parseSenderSignature({
      bodyText: KIRK_REPLY,
      senderName: "Wes Dobias",
      senderEmail: "wes.dobias@hoodz.us.com",
      headers: [{ name: "From", value: "Kirk Meyer <kmeyer@thumbprint.com>" }],
    });
    assert.equal(parsed.skipReason, "not_from_sender");
  });
});

describe("several messages and HTML helpers", () => {
  it("unions phones across messages and conflicts when one label disagrees", () => {
    const office = parseSenderSignature({
      bodyText: `Wes Dobias\nOffice: (480) 264-6344\n`,
      senderName: "Wes Dobias",
      senderEmail: "wes.dobias@hoodz.us.com",
    });
    const direct = parseSenderSignature({
      bodyText: `Wes Dobias\nDirect: (480) 702-2750\n`,
      senderName: "Wes Dobias",
      senderEmail: "wes.dobias@hoodz.us.com",
    });
    const merged = mergeSignatureParses([office, direct]);
    assert.deepEqual(digitsOf(merged), ["direct:4807022750", "office:4802646344"]);

    const otherDirect = parseSenderSignature({
      bodyText: `Wes Dobias\nDirect: (480) 000-1111\n`,
      senderName: "Wes Dobias",
      senderEmail: "wes.dobias@hoodz.us.com",
    });
    const disagreed = mergeSignatureParses([direct, otherDirect]);
    assert.equal(disagreed.acceptedPhones.length, 0);
    assert.equal(disagreed.conflicts[0].kind, "conflicting_values");
  });

  it("removes a gmail quote from HTML before reading numbers", () => {
    const text = htmlToNewContent(WES_HTML);
    assert.equal(text.includes("214.796.4212"), false);
    assert.match(text, /Wes Dobias/);
  });

  it("removes an Outlook reply after appendonsend", () => {
    const html = `<div>Wes Dobias<br>Office: (480) 264-6344</div><div id="appendonsend"></div><hr><div id="divRplyFwdMsg"><b>From:</b> Kirk Meyer<br><b>Sent:</b> Friday, October 16, 2026 12:35 PM<br>M 214.796.4212</div>`;
    const text = htmlToNewContent(html);
    assert.equal(text.includes("214.796.4212"), false);
    assert.match(text, /Wes Dobias/);
  });
});

describe("duplicate contacts", () => {
  it("does not insert when an email lookup is ambiguous or failed", () => {
    const none: ExistingContactLookup = { status: "none" };
    const one: ExistingContactLookup = { status: "one", contact: { id: "a" } };
    const many: ExistingContactLookup = { status: "many", contacts: [{ id: "a" }, { id: "b" }] };
    const error: ExistingContactLookup = { status: "error" };
    assert.equal(insertDecision(none), "insert");
    assert.equal(insertDecision(one), "skip");
    assert.equal(insertDecision(many), "skip");
    assert.equal(insertDecision(error), "skip");
  });

  it("reports a shared internal number and a same-name duplicate", () => {
    const report = auditContactPhones([
      {
        id: "kirk",
        full_name: "Kirk Meyer",
        email: "kmeyer@thumbprint.com",
        phone: "214.796.4212",
      },
      {
        id: "wes",
        full_name: "Wes Dobias",
        email: "wes.dobias@hoodz.us.com",
        phone: "(214) 796-4212",
      },
      {
        id: "kirk-gmail",
        full_name: "Kirk Meyer",
        email: "kirkmeyer2@gmail.com",
        phone: "214-796-4212",
      },
      {
        id: "gabe-1",
        full_name: "Gabe Peters",
        email: "gabe@hoodz.us.com",
        phones: [{ number: "(480) 555-1212", type: "cell" }],
      },
      {
        id: "gabe-2",
        full_name: "Gabe Peters",
        email: "gabe.peters@gmail.com",
        phone: "480.555.1212",
      },
    ]);

    const wes = report.internalNumberOnOutsideContact.find((hit) => hit.contactId === "wes");
    assert.ok(wes);
    assert.equal(wes?.samePerson, false);
    assert.equal(wes?.internalName, "Kirk Meyer");

    const personal = report.internalNumberOnOutsideContact.find((hit) => hit.contactId === "kirk-gmail");
    assert.equal(personal?.samePerson, true);

    const gabe = report.sharedNumbers.find((hit) => hit.phone === "(480) 555-1212");
    assert.equal(gabe?.likelyDuplicate, true);
    assert.equal(gabe?.contacts.length, 2);

    const kirkNumber = report.sharedNumbers.find((hit) => hit.phone === "(214) 796-4212");
    assert.equal(kirkNumber?.differentPeople, true);
  });
});
