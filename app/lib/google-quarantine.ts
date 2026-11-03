/**
 * Put a Google contact in a quarantine group. Does not delete it.
 */

const PEOPLE_API = "https://people.googleapis.com/v1";
export const QUARANTINE_GROUP_NAME = "Humble Hello Quarantine";

async function googleJson(url: string, accessToken: string, init?: RequestInit): Promise<any> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.error?.message || res.statusText || "Google request failed";
    throw new Error(message);
  }
  return data;
}

export async function labelGoogleContactQuarantine(
  accessToken: string,
  resourceName: string
): Promise<{ ok: boolean; error?: string }> {
  if (!resourceName) return { ok: false, error: "no google resource" };
  try {
    const groups = await googleJson(`${PEOPLE_API}/contactGroups?pageSize=200`, accessToken);
    let group = (groups.contactGroups || []).find((item: any) => item.name === QUARANTINE_GROUP_NAME && item.resourceName);
    if (!group) {
      const created = await googleJson(`${PEOPLE_API}/contactGroups`, accessToken, {
        method: "POST",
        body: JSON.stringify({ contactGroup: { name: QUARANTINE_GROUP_NAME } }),
      });
      group = created.resourceName ? created : created.contactGroup;
    }
    const groupResource = group.resourceName as string;
    await googleJson(`${PEOPLE_API}/${groupResource}/members:modify`, accessToken, {
      method: "POST",
      body: JSON.stringify({ resourceNamesToAdd: [resourceName] }),
    });
    return { ok: true };
  } catch (error: any) {
    return { ok: false, error: error?.message || String(error) };
  }
}
