/**
 * Contact maintenance runs three times a day in US Eastern time.
 * Verification sends stay on the hourly cron; they are not in this set.
 *
 * 8:00, 12:00, and 17:00 America/New_York. Intl handles EST and EDT.
 */

export const CONTACT_JOB_HOURS_ET = [8, 12, 17] as const;

export const CONTACT_JOB_EVENTS = [
  "tom/contacts.score",
  "tom/signatures.parse",
  "tom/contacts.sync",
  "tom/gmail.backfill",
  "tom/google.backfill",
] as const;

export function easternHour(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = parts.find((part) => part.type === "hour")?.value;
  const parsed = Number(hour);
  if (!Number.isFinite(parsed)) return -1;
  return parsed;
}

export function isContactJobWindow(now: Date = new Date()): boolean {
  return (CONTACT_JOB_HOURS_ET as readonly number[]).includes(easternHour(now));
}
