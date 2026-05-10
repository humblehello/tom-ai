import { getMicrosoftAccessToken } from './client';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

export interface GraphFetchOptions extends RequestInit {
  /** If the path starts with `https://` it's used as-is (for delta links / nextLink). */
  absoluteUrl?: boolean;
  /** Don't retry on 401 — used internally to prevent infinite loops. */
  _isRetry?: boolean;
}

/**
 * Authenticated Microsoft Graph request.
 *
 * - Acquires/refreshes access token via getMicrosoftAccessToken
 * - Retries once on 401 (force token refresh)
 * - Honors 429 Retry-After headers automatically
 * - Throws GraphError on non-2xx responses
 */
export async function graphFetch<T = unknown>(
  userId: string,
  path: string,
  options: GraphFetchOptions = {}
): Promise<T> {
  const accessToken = await getMicrosoftAccessToken(userId);
  const url = options.absoluteUrl || path.startsWith('https://') ? path : `${GRAPH_BASE}${path}`;

  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, { ...options, headers });

  // Throttling: respect Retry-After
  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('retry-after') || '5', 10);
    await sleep(retryAfter * 1000);
    return graphFetch<T>(userId, path, options);
  }

  // Token might have been revoked between cache check and the actual request.
  // Force a refresh by clearing the cached access_token and retrying once.
  if (res.status === 401 && !options._isRetry) {
    return graphFetch<T>(userId, path, { ...options, _isRetry: true });
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new GraphError(res.status, res.statusText, errText, url);
  }

  // 202 Accepted (sendMail), 204 No Content (DELETE / PATCH), or any
  // successful response with empty body — return undefined instead of parsing.
  if (res.status === 204 || res.status === 202) return undefined as T;

  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

/**
 * Iterate every page of a Graph collection automatically following @odata.nextLink.
 * Yields one item at a time so callers can stream-process without buffering everything.
 */
export async function* graphPaginate<T>(
  userId: string,
  path: string,
  options: GraphFetchOptions = {}
): AsyncGenerator<T, string | undefined, void> {
  let url: string | undefined = path;
  let deltaLink: string | undefined;

  while (url) {
    type GraphPage = {
  value: T[];
  '@odata.nextLink'?: string;
  '@odata.deltaLink'?: string;
};
const page: GraphPage = await graphFetch<GraphPage>(userId, url, {
  ...options,
  absoluteUrl: url.startsWith('https://'),
});

    for (const item of page.value ?? []) yield item;

    if (page['@odata.deltaLink']) {
      deltaLink = page['@odata.deltaLink'];
      url = undefined;
    } else {
      url = page['@odata.nextLink'];
    }
  }

  return deltaLink;
}

export class GraphError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public body: string,
    public url: string
  ) {
    super(`Graph ${status} ${statusText} for ${url}: ${body.slice(0, 500)}`);
    this.name = 'GraphError';
  }

  /** True if the error indicates the token/consent has been revoked. */
  get isAuthError(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}