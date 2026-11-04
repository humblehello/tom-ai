import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { easternHour, isContactJobWindow } from "./contact-job-schedule";
import { ARF_DONATION_PHRASES, BUYER_INVESTOR_QUALIFIER_PHRASES, isAutoReplyTemplate, matchingAutoReplyTemplate } from "./auto-reply-templates";
import { isEspDomain, isRoleAddress, screenInboundSender } from "./inbound-screen";
import { planCursorWrite, planSyncRequest } from "./google-sync-cursor";
import { buildCleanupReport, isSafeAutoMerge, parseApprovedActions } from "./cleanup-report";

describe("contact job window", () => {
  it("is 8am, noon, and 5pm Eastern, including daylight time", () => {
    assert.equal(easternHour(new Date("2026-11-03T13:00:00Z")), 8);
    assert.equal(isContactJobWindow(new Date("2026-11-03T13:00:00Z")), true);
    assert.equal(isContactJobWindow(new Date("2026-11-03T17:00:00Z")), true);
    assert.equal(isContactJobWindow(new Date("2026-11-03T22:00:00Z")), true);
    assert.equal(isContactJobWindow(new Date("2026-11-03T14:00:00Z")), false);
    assert.equal(isContactJobWindow(new Date("2026-07-03T12:00:00Z")), true);
    assert.equal(isContactJobWindow(new Date("2026-07-03T16:00:00Z")), true);
    assert.equal(isContactJobWindow(new Date("2026-07-03T21:00:00Z")), true);
    assert.equal(isContactJobWindow(new Date("2026-07-03T13:00:00Z")), false);
  });
});

const ARF_REPLY = ARF_DONATION_PHRASES.join("\n\n");
const QUALIFIER_REPLY = BUYER_INVESTOR_QUALIFIER_PHRASES.join("\n\n");

describe("auto reply templates", () => {
  it("matches the ARF donation reply, including a quoted and wrapped copy", () => {
    assert.equal(matchingAutoReplyTemplate(ARF_REPLY)?.id, "arf_donation");
    const quoted = ARF_REPLY
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n")
      .replace("Muncie, Indiana", "Muncie,\n> Indiana")
      .replace("here's", "here’s");
    assert.equal(matchingAutoReplyTemplate(quoted)?.id, "arf_donation");
    assert.equal(isAutoReplyTemplate("Your scarf donation drive looks great. See munciearf.com someday."), false);
    assert.equal(isAutoReplyTemplate("Can we grab coffee next week?"), false);
  });

  it("matches the buyer qualifier and ignores a normal note that mentions a buyer", () => {
    assert.equal(matchingAutoReplyTemplate(QUALIFIER_REPLY)?.id, "buyer_investor_qualifier");
    const html = `<p>${BUYER_INVESTOR_QUALIFIER_PHRASES.join("</p><p>")}</p>`.replace("I'm", "I’m");
    assert.equal(matchingAutoReplyTemplate(html)?.id, "buyer_investor_qualifier");
    assert.equal(isAutoReplyTemplate("Thanks, I am the buyer. Let's talk Tuesday."), false);
  });
});

describe("inbound screen", () => {
  it("skips role, ESP, and list-unsubscribe senders", () => {
    assert.equal(isRoleAddress("sales@acme.com"), true);
    assert.equal(isRoleAddress("no-reply@acme.com"), true);
    assert.equal(isRoleAddress("jane.smith@acme.com"), false);
    assert.equal(isEspDomain("news@mail.mailchimp.com"), true);
    assert.equal(screenInboundSender({
      email: "info@acme.com",
      sentMessages: [{ body: "Real note from Tom" }],
    }).action, "skip");
    assert.equal(screenInboundSender({
      email: "jane@acme.com",
      headers: [{ name: "List-Unsubscribe", value: "<mailto:unsub@acme.com>" }],
      sentMessages: [{ body: "Real note from Tom" }],
    }).reason, "list_unsubscribe");
    assert.equal(screenInboundSender({
      email: "jane@acme.com",
      headers: [{ name: "Precedence", value: "bulk" }],
    }).reason, "precedence_bulk");
  });

  it("does not treat an ARF reply as Tom writing back", () => {
    const decision = screenInboundSender({
      email: "pitch@prospect.com",
      sentMessages: [{
        body: ARF_REPLY,
        date: "2026-11-01T15:00:00Z",
      }],
      inboundDate: "2026-11-01T14:00:00Z",
    });
    assert.equal(decision.action, "pending");
    assert.equal(decision.reason, "template_reply_only");
  });

  it("creates a contact for a real reply and for a thread Tom started", () => {
    const reply = screenInboundSender({
      email: "jane@acme.com",
      sentMessages: [{ body: "Jane, good to see you last week. Sending the notes.", date: "2026-11-02T15:00:00Z" }],
      inboundDate: "2026-11-01T15:00:00Z",
    });
    assert.deepEqual(reply, { action: "create", reason: "two_way" });

    const started = screenInboundSender({
      email: "jane@acme.com",
      sentMessages: [{ body: "Jane, wanted to introduce myself.", date: "2026-10-01T15:00:00Z" }],
      inboundDate: "2026-11-01T15:00:00Z",
    });
    assert.deepEqual(started, { action: "create", reason: "tom_initiated" });
  });

  it("stages a cold inbound sender instead of saving them", () => {
    const decision = screenInboundSender({
      email: "jane@prospect.com",
      sentMessages: [],
    });
    assert.deepEqual(decision, { action: "pending", reason: "cold_inbound" });
  });
});

describe("google sync cursor", () => {
  it("resumes a stored page and does not use the sync token mid-pass", () => {
    const plan = planSyncRequest({
      storedSyncToken: "sync-old",
      storedPageToken: "page-2",
      storedMode: "full",
    });
    assert.equal(plan.pageToken, "page-2");
    assert.equal(plan.useSyncToken, false);
    assert.equal(plan.mode, "full");
  });

  it("uses the sync token only for a fresh delta", () => {
    const plan = planSyncRequest({ storedSyncToken: "sync-old" });
    assert.equal(plan.useSyncToken, true);
    assert.equal(plan.pageToken, null);
  });

  it("saves the sync token only when the pass is finished", () => {
    const mid = planCursorWrite({
      httpStatus: 200,
      nextPageToken: "page-3",
      nextSyncToken: "should-not-save-yet",
      requestMode: "full",
    });
    assert.equal(mid.finished, false);
    assert.equal(mid.pageToken, "page-3");
    assert.equal(mid.syncToken, undefined);

    const done = planCursorWrite({
      httpStatus: 200,
      nextPageToken: null,
      nextSyncToken: "sync-new",
      requestMode: "full",
    });
    assert.equal(done.finished, true);
    assert.equal(done.syncToken, "sync-new");
    assert.equal(done.pageToken, null);
    assert.equal(done.mode, null);
  });

  it("restarts a full sync after a 410", () => {
    const expired = planCursorWrite({ httpStatus: 410, requestMode: "delta" });
    assert.equal(expired.restartFull, true);
    assert.equal(expired.syncToken, null);
    assert.equal(expired.pageToken, null);
    assert.equal(expired.mode, "full");
  });
});

describe("cleanup report", () => {
  it("keeps exact email and name pairs and dismisses the rest", () => {
    const report = buildCleanupReport(
      [
        { id: "q1", contact_a_id: "a", contact_b_id: "b", reason: "same_email" },
        { id: "q2", contact_a_id: "c", contact_b_id: "d", reason: "same_name" },
        { id: "q3", contact_a_id: "e", contact_b_id: "f", reason: "same_email" },
      ],
      [
        { id: "a", full_name: "Jane Smith", email: "jane@acme.com", email_count: 4, dunbar_tier: 4 },
        { id: "b", full_name: "jane smith", email: "JANE@acme.com", email_count: 1, dunbar_tier: 5 },
        { id: "c", full_name: "Gabe Peters", email: "gabe@one.com", dunbar_tier: 4 },
        { id: "d", full_name: "Gabe Peters", email: "gabe@two.com", dunbar_tier: 4 },
        { id: "e", full_name: "Mom", email: "mom@home.com", dunbar_tier: 1 },
        { id: "f", full_name: "Mom", email: "mom@home.com", dunbar_tier: 5 },
        { id: "g", full_name: "sales", email: "sales@vendor.com", email_count: 0 },
        { id: "h", full_name: "pitcher", email: "pitcher@gmail.com", email_count: 0 },
      ]
    );
    assert.equal(report.safeMerges.length, 1);
    assert.equal(report.safeMerges[0].queue_id, "q1");
    assert.equal(report.safeMerges[0].keep_id, "a");
    assert.equal(report.dismissQueue.length, 2);
    assert.equal(report.dismissQueue.find((row) => row.queue_id === "q3")?.why, "protected_tier");
    assert.ok(report.likelyJunk.some((row) => row.email === "sales@vendor.com" && row.reasons.includes("role_address")));
    assert.ok(report.likelyJunk.some((row) => row.email === "pitcher@gmail.com" && row.reasons.includes("mailbox_name_only")));
    assert.equal(isSafeAutoMerge(
      { id: "e", full_name: "Mom", email: "mom@home.com", dunbar_tier: 1 },
      { id: "f", full_name: "Mom", email: "mom@home.com", dunbar_tier: 5 }
    ), false);
  });

  it("rejects an execute list that is not explicit", () => {
    assert.throws(() => parseApprovedActions("delete everything"));
    const actions = parseApprovedActions("# note\nmerge q1\nquarantine c1\n");
    assert.equal(actions.length, 2);
  });
});
