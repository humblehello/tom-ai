import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildVerificationText, verificationOnFileLines } from "./email-template";
import { interpretVerificationReply, normalizeModelUpdates } from "./verification-reply";

describe("verification email copy", () => {
  it("lists only filled fields and keeps the reply ask", () => {
    const text = buildVerificationText({
      contactFirstName: "Jane",
      senderFirstName: "Tom",
      senderFullName: "Tom Rector",
      verifyUrl: "https://humblehello.com/verify/abc",
      appUrl: "https://humblehello.com",
      contact: {
        home_address: {
          streetAddress: "123 Main St",
          city: "Indianapolis",
          region: "IN",
          postalCode: "46204",
        },
        phone: "(317) 555-0199",
        job_title: "Designer",
        company: "Northwind",
        work_address: null,
        birthday: "",
      },
      opener: "Just a note.",
    });

    assert.match(text, /Just a note\./);
    assert.match(text, /Home: 123 Main St, Indianapolis, IN 46204/);
    assert.match(text, /Mobile: \(317\) 555-0199/);
    assert.match(text, /Title: Designer at Northwind/);
    assert.equal(text.includes("Work:"), false);
    assert.equal(text.includes("Birthday:"), false);
    assert.equal(text.includes("Missing"), false);
    assert.match(text, /just reply/i);
    assert.match(text, /Update my info:\nhttps:\/\/humblehello.com\/verify\/abc/);
    assert.match(text, /Opens a secure page on humblehello.com/);
    assert.match(text, /Try Humble Hello free: https:\/\/humblehello.com/);
    assert.match(text, /Prefer I don't ask\? Let me know/);
    assert.equal(text.includes("Sent via Humble Hello on behalf of"), false);
  });

  it("omits an empty on-file block", () => {
    const lines = verificationOnFileLines({});
    assert.equal(lines.length, 0);
  });
});

describe("verification reply parser", () => {
  it("captures a labeled phone and ignores the quoted original", () => {
    const reply = interpretVerificationReply(`My cell is (317) 555-0199

On Tue, Nov 3, 2026, Tom wrote:

Mobile: (999) 000-0000`);
    assert.equal(reply.kind, "update");
    assert.equal(reply.updates?.phone, "(317) 555-0199");
  });

  it("captures a home address", () => {
    const reply = interpretVerificationReply(
      "Home address is 123 Main St, Indianapolis, IN 46204"
    );
    assert.equal(reply.kind, "update");
    assert.deepEqual(reply.updates?.home_address, {
      streetAddress: "123 Main St",
      city: "Indianapolis",
      region: "IN",
      postalCode: "46204",
      country: "US",
    });
  });

  it("keeps a suite in the street and files work separately", () => {
    const reply = interpretVerificationReply(
      "Work address: 500 Market St, Suite 2, Chicago, IL 60601"
    );
    assert.equal(reply.updates?.work_address?.streetAddress, "500 Market St, Suite 2");
    assert.equal(reply.updates?.work_address?.city, "Chicago");
    assert.equal(reply.updates?.work_address?.region, "IL");
  });

  it("treats a bare confirmation as confirm, not an update", () => {
    const reply = interpretVerificationReply("Looks right, thanks!");
    assert.equal(reply.kind, "confirm");
  });

  it("stops future asks without deleting on a soft opt-out", () => {
    const reply = interpretVerificationReply("Prefer I don't get these — please don't ask again.");
    assert.equal(reply.kind, "soft_opt_out");
  });

  it("still treats an explicit removal as a hard opt-out", () => {
    const reply = interpretVerificationReply("Please remove me.");
    assert.equal(reply.kind, "opt_out");
  });

  it("normalizes model address keys onto the contact record shape", () => {
    const updates = normalizeModelUpdates({
      phone: "317-555-0100",
      title: "Editor",
      company: "Acme",
      home_address: {
        streetAddress: "9 Oak Ave",
        city: "Austin",
        state: "TX",
        zip: "78701",
      },
    });
    assert.equal(updates.phone, "317-555-0100");
    assert.equal(updates.job_title, "Editor");
    assert.equal(updates.company, "Acme");
    assert.equal(updates.home_address?.region, "TX");
    assert.equal(updates.home_address?.postalCode, "78701");
  });
});
