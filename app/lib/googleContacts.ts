const PEOPLE_API = "https://people.googleapis.com/v1";

// ── Get a contact's Google resource name by email ──
export async function findGoogleContact(accessToken: string, email: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${PEOPLE_API}/people:searchContacts?query=${encodeURIComponent(email)}&readMask=emailAddresses,names,phoneNumbers,addresses`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const data = await res.json();
    const results = data.results || [];
    if (results.length === 0) return null;
    return results[0].person?.resourceName || null;
  } catch {
    return null;
  }
}

// ── Get full contact record including etag (required for updates) ──
export async function getGoogleContact(accessToken: string, resourceName: string): Promise<any | null> {
  try {
    const res = await fetch(
      `${PEOPLE_API}/${resourceName}?personFields=names,emailAddresses,phoneNumbers,addresses,birthdays,organizations,biographies,userDefined`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    return await res.json();
  } catch {
    return null;
  }
}

// ── Helper: fetch with one retry on 429 rate limit ──
async function fetchWithRetry(url: string, options: RequestInit): Promise<Response> {
  const res = await fetch(url, options);
  if (res.status === 429) {
    console.log("Google People API rate limited (429), retrying in 2s...");
    await new Promise(r => setTimeout(r, 2000));
    return fetch(url, options);
  }
  return res;
}

// ── Update a Google Contact with new fields (supports deletions via null) ──
// Returns either { success: true } or { success: false, error: "..." }
// Legacy boolean checks still work because the function returns a truthy object.
export type UpdateResult = { success: boolean; error?: string };

export async function updateGoogleContact(
  accessToken: string,
  resourceName: string,
  updates: {
    phone?: string | null;
    address?: any | null;
    work_address?: any | null;
    birthday?: string | null;
    notes?: string | null;
    key_context?: string | null;
    company?: string | null;
    job_title?: string | null;
    full_name?: string;
    email?: string | null;
  }
): Promise<UpdateResult> {
  try {
    const current = await getGoogleContact(accessToken, resourceName);
    if (!current || !current.etag) return { success: false, error: "could not fetch current Google contact (missing etag)" };

    const personFields: string[] = [];
    const body: any = { etag: current.etag };

    // ── Name ──
    if (updates.full_name) {
      const parts = updates.full_name.trim().split(/\s+/);
      const givenName = parts[0];
      const familyName = parts.slice(1).join(" ");
      body.names = [{ givenName, familyName }];
      personFields.push("names");
    }

    // ── Phone ──
    if (updates.phone === null) {
      // Explicit deletion — clear all phone numbers
      body.phoneNumbers = [];
      personFields.push("phoneNumbers");
    } else if (updates.phone) {
      const existing = current.phoneNumbers || [];
      const alreadyHas = existing.some((p: any) => p.value === updates.phone);
      if (!alreadyHas) {
        body.phoneNumbers = [...existing, { value: updates.phone, type: "mobile" }];
        personFields.push("phoneNumbers");
      }
    }

    // ── Home address ──
    if (updates.address === null) {
      // Explicit deletion — remove the "home" entry from addresses
      const existing = current.addresses || [];
      body.addresses = existing.filter((a: any) => a.type !== "home");
      personFields.push("addresses");
    } else if (updates.address && typeof updates.address === "object") {
      // Only push if address has enough content to be meaningful.
      // A valid address needs at least streetAddress AND city (or just city for apartment-less places).
      const hasStreet = updates.address.streetAddress && updates.address.streetAddress.trim();
      const hasCity = updates.address.city && updates.address.city.trim();
      const hasRegion = (updates.address.region || updates.address.state) && (updates.address.region || updates.address.state).trim();

      if (hasStreet && hasCity && hasRegion) {
        const existing = current.addresses || [];
        const homeIdx = existing.findIndex((a: any) => a.type === "home");
        const newHome = {
          type: "home",
          streetAddress: updates.address.streetAddress,
          city: updates.address.city,
          region: (updates.address.region || updates.address.state).trim().toUpperCase(),
          postalCode: (updates.address.postalCode || updates.address.zip || "").trim(),
          country: (updates.address.country || "US").trim() || "US",
        };
        if (homeIdx >= 0) {
          existing[homeIdx] = { ...existing[homeIdx], ...newHome };
        } else {
          existing.push(newHome);
        }
        body.addresses = existing;
        personFields.push("addresses");
      } else {
        console.warn("updateGoogleContact: skipping incomplete home address", updates.address);
      }
    }

    // ── Work address ──
    if (updates.work_address === null) {
      const existing = body.addresses || current.addresses || [];
      body.addresses = existing.filter((a: any) => a.type !== "work");
      if (!personFields.includes("addresses")) personFields.push("addresses");
    } else if (updates.work_address && typeof updates.work_address === "object") {
      const hasStreet = updates.work_address.streetAddress && updates.work_address.streetAddress.trim();
      const hasCity = updates.work_address.city && updates.work_address.city.trim();
      const hasRegion = (updates.work_address.region || updates.work_address.state) && (updates.work_address.region || updates.work_address.state).trim();

      if (hasStreet && hasCity && hasRegion) {
        const existing = body.addresses || current.addresses || [];
        const workIdx = existing.findIndex((a: any) => a.type === "work");
        const newWork = {
          type: "work",
          streetAddress: updates.work_address.streetAddress,
          city: updates.work_address.city,
          region: (updates.work_address.region || updates.work_address.state).trim().toUpperCase(),
          postalCode: (updates.work_address.postalCode || updates.work_address.zip || "").trim(),
          country: (updates.work_address.country || "US").trim() || "US",
        };
        if (workIdx >= 0) {
          existing[workIdx] = { ...existing[workIdx], ...newWork };
        } else {
          existing.push(newWork);
        }
        body.addresses = existing;
        if (!personFields.includes("addresses")) personFields.push("addresses");
      } else {
        console.warn("updateGoogleContact: skipping incomplete work address", updates.work_address);
      }
    }

    // ── Birthday ──
    if (updates.birthday === null || updates.birthday === "") {
      body.birthdays = [];
      personFields.push("birthdays");
    } else if (updates.birthday) {
      try {
        const parts = updates.birthday.split("-");
        let year: number | undefined;
        let month: number;
        let day: number;
        if (parts.length === 3) {
          year = parseInt(parts[0]);
          month = parseInt(parts[1]);
          day = parseInt(parts[2]);
        } else if (parts.length === 2) {
          month = parseInt(parts[0]);
          day = parseInt(parts[1]);
        } else {
          throw new Error("Invalid birthday format");
        }
        // Validate month/day are sane
        if (!month || !day || month < 1 || month > 12 || day < 1 || day > 31) {
          throw new Error("Invalid birthday month/day");
        }
        const dateObj: any = { month, day };
        // Only include year if it's a realistic human birth year
        if (year && year > 1900 && year <= new Date().getFullYear()) {
          dateObj.year = year;
        }
        body.birthdays = [{ date: dateObj }];
        personFields.push("birthdays");
      } catch (e) {
        // Skip invalid birthday format — don't push to Google
        console.warn("updateGoogleContact: skipping invalid birthday", updates.birthday);
      }
    }

    // ── Notes (biography in Google) ──
    if (updates.notes === null || updates.notes === "") {
      // Explicit delete (null) OR empty string — clear the biography
      body.biographies = [];
      personFields.push("biographies");
    } else if (updates.notes !== undefined) {
      body.biographies = [{ value: updates.notes, contentType: "TEXT_PLAIN" }];
      personFields.push("biographies");
    }

    // ── Key context (stored as userDefined field) ──
    if (updates.key_context === null || updates.key_context === "") {
      // Explicit delete — remove our custom field
      const existing = current.userDefined || [];
      body.userDefined = existing.filter((f: any) => f.key !== "Humble Hello Context");
      personFields.push("userDefined");
    } else if (updates.key_context !== undefined && updates.key_context.trim() !== "") {
      const existing = current.userDefined || [];
      const ctxIdx = existing.findIndex((f: any) => f.key === "Humble Hello Context");
      const ctxField = { key: "Humble Hello Context", value: updates.key_context };
      if (ctxIdx >= 0) {
        existing[ctxIdx] = ctxField;
      } else {
        existing.push(ctxField);
      }
      body.userDefined = existing;
      personFields.push("userDefined");
    }

    // ── Company / Job Title ──
    if (updates.company === null && updates.job_title === null) {
      // Both explicitly null — clear work org
      const existing = current.organizations || [];
      body.organizations = existing.filter((o: any) => o.type !== "work" && o.type);
      personFields.push("organizations");
    } else if (updates.company || updates.job_title) {
      const existing = current.organizations || [];
      const orgIdx = existing.findIndex((o: any) => o.type === "work" || !o.type);
      const newOrg: any = {
        type: "work",
        name: updates.company !== undefined
          ? (updates.company || "")
          : existing[orgIdx]?.name || "",
        title: updates.job_title !== undefined
          ? (updates.job_title || "")
          : existing[orgIdx]?.title || "",
      };
      if (orgIdx >= 0) {
        existing[orgIdx] = { ...existing[orgIdx], ...newOrg };
      } else {
        existing.push(newOrg);
      }
      body.organizations = existing;
      personFields.push("organizations");
    }

    // ── Email (no deletion support — too risky; email is the primary key) ──
    if (updates.email === null) {
      console.warn(
        `updateGoogleContact: refusing to delete email for ${resourceName} — email is the primary contact key and cannot be removed via this path. Use deleteGoogleContact to remove the entire contact.`
      );
    } else if (updates.email) {
      const existing = current.emailAddresses || [];
      const alreadyHas = existing.some(
        (e: any) => e.value?.toLowerCase() === updates.email?.toLowerCase()
      );
      if (!alreadyHas) {
        body.emailAddresses = [...existing, { value: updates.email, type: "work" }];
        personFields.push("emailAddresses");
      }
    }

    if (personFields.length === 0) return { success: false, error: "no fields to update after filtering" };

    const res = await fetchWithRetry(
      `${PEOPLE_API}/${resourceName}:updateContact?updatePersonFields=${personFields.join(",")}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) {
      let errText = `HTTP ${res.status}`;
      try {
        const err = await res.json();
        errText = err?.error?.message || JSON.stringify(err).slice(0, 500);
      } catch {
        try {
          errText = (await res.text()).slice(0, 500);
        } catch {}
      }
      console.error("updateGoogleContact failed:", errText);
      return { success: false, error: errText };
    }

    return { success: true };
  } catch (e: any) {
    console.error("updateGoogleContact exception:", e);
    return { success: false, error: e?.message || String(e) };
  }
}

// ── Delete a Google Contact ──
export async function deleteGoogleContact(
  accessToken: string,
  resourceName: string
): Promise<boolean> {
  try {
    const res = await fetch(
      `${PEOPLE_API}/${resourceName}:deleteContact`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}

// ── Create a new Google Contact ──
export async function createGoogleContact(
  accessToken: string,
  contact: {
    full_name: string;
    email?: string | null;
    phone?: string | null;
    address?: any;
    company?: string | null;
    job_title?: string | null;
  }
): Promise<string | null> {
  try {
    const nameParts = contact.full_name.trim().split(/\s+/);
    const givenName = nameParts[0];
    const familyName = nameParts.slice(1).join(" ");

    const body: any = {
      names: [{ givenName, familyName }],
    };

    if (contact.email) {
      body.emailAddresses = [{ value: contact.email, type: "work" }];
    }
    if (contact.phone) {
      body.phoneNumbers = [{ value: contact.phone, type: "mobile" }];
    }
    if (contact.address?.streetAddress) {
      body.addresses = [{
        type: "home",
        streetAddress: contact.address.streetAddress,
        city: contact.address.city || "",
        region: contact.address.region || contact.address.state || "",
        postalCode: contact.address.postalCode || contact.address.zip || "",
        country: contact.address.country || "US",
      }];
    }
    if (contact.company || contact.job_title) {
      body.organizations = [{
        type: "work",
        name: contact.company || "",
        title: contact.job_title || "",
      }];
    }

    const requestOptions: RequestInit = {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    };

    const res = await fetchWithRetry(`${PEOPLE_API}/people:createContact`, requestOptions);
    const responseData = await res.json();

    if (!res.ok || !responseData.resourceName) {
      console.error("createGoogleContact failed:", JSON.stringify(responseData));

      if (contact.email) {
        const existing = await findGoogleContact(accessToken, contact.email);
        if (existing) {
          console.log("createGoogleContact: found existing contact, returning:", existing);
          return existing;
        }
      }
      return null;
    }

    // Add to myContacts group
    try {
      await fetch(`https://people.googleapis.com/v1/contactGroups/myContacts/members:modify`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          resourceNamesToAdd: [responseData.resourceName]
        }),
      });
    } catch (e) {
      console.error("Failed to add to myContacts group:", e);
    }
    return responseData.resourceName;
  } catch (e) {
    console.error("createGoogleContact exception:", e);
    return null;
  }
}