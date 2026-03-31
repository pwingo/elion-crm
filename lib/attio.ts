const ATTIO_API_KEY = process.env.ATTIO_API_KEY;
const ATTIO_BASE = "https://api.attio.com/v2";

/**
 * Search Attio for a person by name and return their primary email.
 * Resolution chain (most precise → broadest):
 *   1. Exact name match (highest confidence)
 *   2. Email-pattern search: {first initial}{lastname} {org} (precise, catches email-only records)
 *   3. Fuzzy name search (handles married names, nicknames)
 *   4. First name + org search (broadest, last resort)
 */
export async function resolveEmailFromAttio(
  firstName: string,
  lastName: string,
  organization?: string
): Promise<string | null> {
  if (!ATTIO_API_KEY) return null;

  // 1. Exact name match — highest confidence, no ambiguity
  try {
    const res = await fetch(`${ATTIO_BASE}/objects/people/records/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ATTIO_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filter: {
          $and: [
            { name: { first_name: { $eq: firstName } } },
            { name: { last_name: { $eq: lastName } } },
          ],
        },
        limit: 5,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      for (const record of data.data ?? []) {
        const emails = record.values?.email_addresses ?? [];
        if (emails.length > 0) {
          return emails[0].email_address ?? null;
        }
      }
    }
  } catch (e) {
    console.error("Attio exact match error:", e);
  }

  // 2. Email-pattern search: {first initial}{lastname} {org} — catches email-only records like pmcclain@adventist...
  if (organization && firstName && lastName) {
    const emailGuess = `${firstName[0].toLowerCase()}${lastName.toLowerCase()} ${organization}`;
    const emailResult = await resolveEmailFuzzy(emailGuess);
    if (emailResult) return emailResult;
  }

  // 3. Fuzzy name search — handles married names, nicknames, etc.
  const fuzzyResult = await resolveEmailFuzzy(`${firstName} ${lastName}`);
  if (fuzzyResult) return fuzzyResult;

  // 4. First name + org — broadest, last resort
  if (organization) {
    const orgResult = await resolveEmailFuzzy(`${firstName} ${organization}`);
    if (orgResult) return orgResult;
  }

  return null;
}

async function resolveEmailFuzzy(query: string): Promise<string | null> {
  if (!ATTIO_API_KEY) return null;

  try {
    const res = await fetch(`${ATTIO_BASE}/objects/records/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ATTIO_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        objects: ["people"],
        limit: 3,
        request_as: { type: "workspace" },
      }),
    });

    if (!res.ok) {
      console.error(`Attio fuzzy search failed: ${res.status}`);
      return null;
    }

    const data = await res.json();
    const results = data.data ?? [];

    for (const result of results) {
      const emails = result.email_addresses ?? [];
      if (emails.length > 0) {
        return emails[0] ?? null;
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Batch resolve emails for multiple contacts.
 * Returns a Map of "name|organization" → email.
 */
export async function batchResolveEmails(
  contacts: Array<{ name: string; organization: string }>
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  if (!ATTIO_API_KEY) return results;

  // Process in batches of 5 to avoid rate limiting
  const BATCH_SIZE = 5;
  for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
    const batch = contacts.slice(i, i + BATCH_SIZE);
    const promises = batch.map(async (contact) => {
      const parts = contact.name.trim().split(/\s+/);
      const firstName = parts[0] ?? "";
      const lastName = parts.slice(1).join(" ") || "";

      const email = await resolveEmailFromAttio(firstName, lastName, contact.organization);
      if (email) {
        results.set(`${contact.name}|${contact.organization}`, email);
      }
    });

    await Promise.all(promises);

    // Small delay between batches to respect rate limits
    if (i + BATCH_SIZE < contacts.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  return results;
}
