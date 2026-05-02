import { graphFetch, graphPaginate } from './graph';

export interface GraphAttendee {
  emailAddress: { name?: string; address?: string };
  type?: 'required' | 'optional' | 'resource';
  status?: { response?: string; time?: string };
}

export interface GraphEvent {
  id: string;
  subject?: string;
  bodyPreview?: string;
  start?: { dateTime: string; timeZone: string };
  end?: { dateTime: string; timeZone: string };
  organizer?: { emailAddress: { name?: string; address?: string } };
  attendees?: GraphAttendee[];
  isAllDay?: boolean;
  isCancelled?: boolean;
  location?: { displayName?: string };
  '@removed'?: { reason: 'changed' | 'deleted' };
}

export interface CalendarScanResult {
  events: GraphEvent[];
  deleted: string[];
  newDeltaLink: string | undefined;
}

/**
 * Scan calendar events using delta query.
 *
 * Calendar delta requires a window — Graph doesn't allow open-ended deltas.
 * We use the standing window: 30 days back to 90 days forward. On subsequent
 * runs the saved deltaLink already has the window baked in.
 */
export async function scanMicrosoftCalendar(
  userId: string,
  deltaLink: string | null
): Promise<CalendarScanResult> {
  let startUrl: string;
  if (deltaLink) {
    startUrl = deltaLink;
  } else {
    const start = new Date();
    start.setDate(start.getDate() - 30);
    const end = new Date();
    end.setDate(end.getDate() + 90);
    const params = new URLSearchParams({
      startDateTime: start.toISOString(),
      endDateTime: end.toISOString(),
    });
    startUrl = `/me/calendarView/delta?${params.toString()}`;
  }

  const events: GraphEvent[] = [];
  const deleted: string[] = [];
  let newDeltaLink: string | undefined;

  const iterator = graphPaginate<GraphEvent>(userId, startUrl, {
    absoluteUrl: startUrl.startsWith('https://'),
    headers: {
      // Required header for calendar delta
      Prefer: 'odata.maxpagesize=100',
    },
  });

  while (true) {
    const next = await iterator.next();
    if (next.done) {
      newDeltaLink = next.value;
      break;
    }
    const event = next.value;
    if (event['@removed']?.reason === 'deleted') {
      deleted.push(event.id);
    } else {
      events.push(event);
    }
  }

  return { events, deleted, newDeltaLink };
}

/**
 * Pull attendee email addresses out of an event for contact discovery.
 * Excludes the organizer if they're the user.
 */
export function extractAttendeeEmails(event: GraphEvent): string[] {
  return (event.attendees ?? [])
    .map((a) => a.emailAddress.address)
    .filter((a): a is string => !!a);
}