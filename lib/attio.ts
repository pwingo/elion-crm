const ATTIO_API_KEY = process.env.ATTIO_API_KEY;
const ATTIO_BASE = "https://api.attio.com/v2";

/**
 * Search Attio for a person by name and return their primary email.
 * Uses fuzzy search first (handles name changes, nicknames, etc.),
 * then falls back to exact name match.
 */
export async function resolveEmailFromAttio(
  firstName: string,
  lastName: string,
  _organization?: string
): Promise<string | null> {
  if (!ATTIO_API_KEY) return null;

  // Try fuzzy search with name first — handles married names, nicknames, etc.
  const fuzzyResult = await resolveEmailFuzzy(`${firstName} ${lastName}`);
  if (fuzzyResult) return fuzzyResult;

  // Try fuzzy search with name + organization — helps when names are slightly different in Attio
  if (_organization) {
    const orgResult = await resolveEmailFuzzy(`${firstName} ${_organization}`);
    if (orgResult) return orgResult;
  }

  // Try email-pattern search: {first initial}{lastname} {org} — catches email-only records
  if (_organization && firstName && lastName) {
    const emailGuess = `${firstName[0].toLowerCase()}${lastName.toLowerCase()} ${_organization}`;
    const emailResult = await resolveEmailFuzzy(emailGuess);
    if (emailResult) return emailResult;
  }

  // Fall back to exact name match
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

    if (!res.ok) return null;

    const data = await res.json();
    const records = data.data ?? [];

    for (const record of records) {
      const emails = record.values?.email_addresses ?? [];
      if (emails.length > 0) {
        return emails[0].email_address ?? null;
      }
    }

    return null;
  } catch (e) {
    console.error("Attio lookup error:", e);
    return null;
  }
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
