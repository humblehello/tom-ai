import assert from "node:assert/strict";
import {
  emailAssignmentDecision,
  fillBlankFields,
  namesLookLikeSamePerson,
  reconcileGoogleIdentity,
  stampHumanEdits,
  valuesEqual,
} from "../app/lib/contactFieldPolicy.ts";

const humanEmail = {
  source: "human" as const,
  at: "2026-09-01T00:00:00.000Z",
  value: "new@example.com",
  synced_value: "old@example.com",
  synced_at: "2026-08-01T00:00:00.000Z",
};

const existing = {
  full_name: "Ada Lovelace",
  email: "new@example.com",
  phone: "(317) 555-0100",
  company: "Analytical Engines",
  job_title: "Mathematician",
  home_address: null,
  birthday: null,
  notes: "Met at the salon",
  key_context: "Talks about the difference engine",
  field_provenance: { email: humanEmail, phone: { ...humanEmail, value: "(317) 555-0100", synced_value: null, synced_at: null } },
};

const pulled = reconcileGoogleIdentity({
  existing,
  incoming: {
    full_name: "Ada Lovelace",
    email: "old@example.com",
    phone: "3175550100",
    company: "Analytical Engines",
    job_title: "Inventor",
  },
  googleUpdatedAt: "2026-09-28T00:00:00.000Z",
  now: "2026-09-28T00:00:01.000Z",
});

assert.equal(pulled.patch.email, undefined, "human email survives a newer Google timestamp that still has the old address");
assert.equal(pulled.pushBack.email, "new@example.com");
assert.equal(pulled.patch.phone, undefined, "same phone with different formatting is not a change");
assert.equal(pulled.pushBack.phone, undefined);
assert.equal(pulled.patch.job_title, "Inventor", "a field nobody edited in Humble Hello still follows Google");
assert.equal(pulled.patch.notes, undefined, "notes are not part of the Google identity pull");
assert.equal(pulled.patch.key_context, undefined);

const landed = reconcileGoogleIdentity({
  existing: {
    ...existing,
    email: "new@example.com",
    field_provenance: {
      email: {
        source: "human",
        at: "2026-09-01T00:00:00.000Z",
        value: "new@example.com",
        synced_value: "new@example.com",
        synced_at: "2026-09-02T00:00:00.000Z",
      },
    },
  },
  incoming: { email: "third@example.com" },
  googleUpdatedAt: "2026-09-03T00:00:00.000Z",
});
assert.equal(landed.patch.email, "third@example.com", "after the write landed, a later Google edit wins");
assert.equal(landed.conflicts[0], "email");
assert.equal(landed.patch.field_provenance.email.source, "google");

const notLanded = reconcileGoogleIdentity({
  existing: {
    email: "new@example.com",
    field_provenance: {
      email: {
        source: "human",
        at: "2026-09-04T00:00:00.000Z",
        value: "new@example.com",
        synced_value: "old@example.com",
        synced_at: "2026-09-01T00:00:00.000Z",
      },
    },
  },
  incoming: { email: "third@example.com" },
  googleUpdatedAt: "2026-09-05T00:00:00.000Z",
});
assert.equal(notLanded.patch.email, undefined, "until the HH edit lands, a third Google value does not erase it");
assert.equal(notLanded.pushBack.email, "new@example.com");

assert.equal(valuesEqual("(317) 555-0100", "317-555-0100"), true);
assert.equal(valuesEqual("03-15", "1990-03-15"), true);
assert.equal(valuesEqual("1990-03-15", "1991-03-15"), false);

const filled = fillBlankFields(
  { phone: "111", company: "", field_provenance: { company: { source: "human", at: "t", value: null } } },
  { phone: "222", company: "Acme", job_title: "CEO", linkedin_url: "https://linkedin.com/in/ada" },
  ["phone", "company", "job_title", "linkedin_url"],
  "scrape"
);
assert.equal(filled.phone, undefined);
assert.equal(filled.company, undefined, "a cleared human field stays cleared");
assert.equal(filled.job_title, "CEO");
assert.equal(filled.field_provenance.job_title.source, "scrape");

const stamped = stampHumanEdits(
  { email: { source: "google", at: "t0", value: "old@example.com", synced_value: "old@example.com", synced_at: "t0" } },
  { email: "new@example.com" },
  ["email"],
  "t1"
);
assert.equal(stamped.email.source, "human");
assert.equal(stamped.email.synced_value, "old@example.com", "stamping a human edit remembers what Google last agreed to");

assert.equal(namesLookLikeSamePerson("Ada Lovelace", "ada lovelace"), true);
assert.equal(namesLookLikeSamePerson("Ada Lovelace", "Bob Smith"), false);

assert.equal(
  emailAssignmentDecision({
    incomingEmail: "shared@example.com",
    incomingName: "Bob Smith",
    incomingResource: "people/2",
    owners: [{ id: "1", full_name: "Ada Lovelace", google_resource_name: "people/1" }],
    selfId: "2",
  }),
  "reject"
);
assert.equal(
  emailAssignmentDecision({
    incomingEmail: "ada@example.com",
    incomingName: "Ada Lovelace",
    incomingResource: "people/1",
    owners: [{ id: "1", full_name: "Ada Lovelace", google_resource_name: null }],
    selfId: null,
  }),
  "same_person"
);

console.log("contactFieldPolicy tests passed");
