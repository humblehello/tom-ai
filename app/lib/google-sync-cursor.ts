/**
 * One page of Google People connections per run.
 * The sync token is stored only when that pass has no further page.
 * A 410 clears the token and the next run starts a full sync.
 */

export type SyncMode = "delta" | "full";

export interface SyncRequestPlan {
  mode: SyncMode;
  pageToken: string | null;
  useSyncToken: boolean;
  syncToken: string | null;
}

export function planSyncRequest(input: {
  storedSyncToken?: string | null;
  storedPageToken?: string | null;
  storedMode?: string | null;
  requestedPageToken?: string | null;
  forceFull?: boolean;
}): SyncRequestPlan {
  const storedSyncToken = input.storedSyncToken || null;
  const storedPageToken = input.storedPageToken || null;
  const requestedPageToken = input.requestedPageToken || null;
  const storedMode = input.storedMode === "full" || input.storedMode === "delta" ? input.storedMode : null;

  if (input.forceFull) {
    return {
      mode: "full",
      pageToken: requestedPageToken,
      useSyncToken: false,
      syncToken: null,
    };
  }

  if (requestedPageToken) {
    return {
      mode: storedMode === "delta" ? "delta" : "full",
      pageToken: requestedPageToken,
      useSyncToken: false,
      syncToken: null,
    };
  }

  if (storedPageToken) {
    return {
      mode: storedMode === "delta" ? "delta" : "full",
      pageToken: storedPageToken,
      useSyncToken: false,
      syncToken: null,
    };
  }

  if (storedSyncToken) {
    return {
      mode: "delta",
      pageToken: null,
      useSyncToken: true,
      syncToken: storedSyncToken,
    };
  }

  return { mode: "full", pageToken: null, useSyncToken: false, syncToken: null };
}

export interface CursorWrite {
  /** undefined leaves the stored sync token alone. null clears it. */
  syncToken?: string | null;
  pageToken: string | null;
  mode: SyncMode | null;
  restartFull: boolean;
  finished: boolean;
}

export function planCursorWrite(input: {
  httpStatus: number;
  nextPageToken?: string | null;
  nextSyncToken?: string | null;
  requestMode: SyncMode;
}): CursorWrite {
  if (input.httpStatus === 410) {
    return {
      syncToken: null,
      pageToken: null,
      mode: "full",
      restartFull: true,
      finished: false,
    };
  }

  const nextPageToken = input.nextPageToken || null;
  if (nextPageToken) {
    return {
      pageToken: nextPageToken,
      mode: input.requestMode,
      restartFull: false,
      finished: false,
    };
  }

  return {
    syncToken: input.nextSyncToken || null,
    pageToken: null,
    mode: null,
    restartFull: false,
    finished: true,
  };
}
