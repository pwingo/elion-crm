import { db } from "./db";
import { contacts, contactCampaignStatus, outreachTouches } from "./schema";
import type { ContactStatus } from "./schema";
import { eq, and } from "drizzle-orm";
import { batchResolveEmails } from "./attio";

function mapStatus(raw: string): ContactStatus {
  const s = raw.toLowerCase().trim();
  if (s.startsWith("confirmed") || s === "confirmed") return "confirmed";
  if (s === "responded") return "responded";
  if (s.includes("hold")) return "on_hold";
  if (s.includes("can't attend") || s.includes("cant attend") || s === "declined") return "declined";
  if (s.includes("no response") || s === "dfn") return "no_response";
  if (s === "") return "not_started";
  return "not_started";
}

function buildNotes(row: Record<string, string>): string {
  const base = (row["Notes"] ?? "").trim();
  const attended: string[] = [];
  if ((row["Spring 2025 Attendee"] ?? "").trim().toUpperCase() === "Y") attended.push("Spring 2025");
  if ((row["Winter 2025 Attendee"] ?? "").trim().toUpperCase() === "Y") attended.push("Winter 2025");
  const attendance = attended.length > 0 ? `Attended: ${attended.join(", ")}` : "";
  return [base, attendance].filter(Boolean).join("\n").trim();
}

function parseDate(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;

  // Handle M/D format (no year) — assume current year
  const shortMatch = s.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (shortMatch) {
    const month = parseInt(shortMatch[1], 10) - 1;
    const day = parseInt(shortMatch[2], 10);
    const year = new Date().getFullYear();
    return new Date(year, month, day);
  }

  // Handle M/D/YY or M/D/YYYY
  const fullMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (fullMatch) {
    const month = parseInt(fullMatch[1], 10) - 1;
    const day = parseInt(fullMatch[2], 10);
    let year = parseInt(fullMatch[3], 10);
    if (year < 100) year += 2000;
    return new Date(year, month, day);
  }

  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export async function importCsv(
  rows: Record<string, string>[],
  campaignId: string,
): Promise<{ created: number; updated: number; errors: number; emailsResolved: number }> {
  let created = 0;
  let updated = 0;
  let errors = 0;
  let emailsResolved = 0;

  // Pre-resolve emails from Attio for contacts that don't have one in the CSV
  const contactsNeedingEmail = rows
    .filter((row) => {
      const name = (row["Name"] ?? "").trim();
      const org = (row["Organization"] ?? "").trim();
      const email = (row["Email"] ?? "").trim();
      return name && org && !email;
    })
    .map((row) => ({
      name: (row["Name"] ?? "").trim(),
      organization: (row["Organization"] ?? "").trim(),
    }));

  const resolvedEmails = await batchResolveEmails(contactsNeedingEmail);

  for (const row of rows) {
    const name = (row["Name"] ?? "").trim();
    const organization = (row["Organization"] ?? "").trim();
    if (!name || !organization) continue;

    try {
      const notes = buildNotes(row);
      const title = (row["Title"] ?? "").trim() || null;
      const owner = (row["Owner"] ?? "").trim() || "import";
      const linkedinUrl = (row["LinkedIn"] ?? "").trim() || null;
      const isProspect = (row["Prospect?"] ?? "").trim().toUpperCase() === "Y";
      const isPoc = (row["POC"] ?? "").trim().toUpperCase() === "Y";

      // Email: use CSV value first, fall back to Attio resolution
      const csvEmail = (row["Email"] ?? "").trim() || null;
      const attioEmail = resolvedEmails.get(`${name}|${organization}`) ?? null;
      const email = csvEmail || attioEmail;
      if (attioEmail && !csvEmail) emailsResolved++;

      // Check if contact exists by name + organization
      const existing = await db
        .select()
        .from(contacts)
        .where(and(eq(contacts.name, name), eq(contacts.organization, organization)))
        .limit(1);

      let contactId: string;

      if (existing.length > 0) {
        contactId = existing[0].id;
        await db
          .update(contacts)
          .set({
            title,
            owner,
            linkedinUrl,
            notes,
            isProspect,
            isPoc,
            ...(email && !existing[0].email ? { email } : {}),
          })
          .where(eq(contacts.id, contactId));
        updated++;
      } else {
        const [inserted] = await db
          .insert(contacts)
          .values({ name, organization, title, email, owner, linkedinUrl, notes, isProspect, isPoc })
          .returning({ id: contacts.id });
        contactId = inserted.id;
        created++;
      }

      // Check if campaign status already exists
      const existingStatus = await db
        .select()
        .from(contactCampaignStatus)
        .where(
          and(
            eq(contactCampaignStatus.contactId, contactId),
            eq(contactCampaignStatus.campaignId, campaignId),
          ),
        )
        .limit(1);

      const statusWasNew = existingStatus.length === 0;

      if (statusWasNew) {
        const statusValue = mapStatus(row["Status"] ?? "");
        const nextTouchRaw = (row["Next Touch"] ?? "").trim();
        const nextTouchDate = nextTouchRaw || null;

        await db.insert(contactCampaignStatus).values({
          contactId,
          campaignId,
          status: statusValue,
          nextTouchDate,
        });
      }

      // Create synthetic touch if "Last Touch" has a value and status was new
      const lastTouchRaw = (row["Last Touch"] ?? "").trim();
      if (lastTouchRaw && statusWasNew) {
        const sentAt = parseDate(lastTouchRaw);
        await db.insert(outreachTouches).values({
          contactId,
          campaignId,
          touchNumber: 1,
          channel: "email",
          state: "sent",
          sentAt: sentAt ?? undefined,
          subject: "[Imported — no subject]",
          body: null,
          createdBy: "import",
        });
      }
    } catch (err) {
      console.error(`CSV import error for row "${name}" / "${organization}":`, err);
      errors++;
    }
  }

  return { created, updated, errors, emailsResolved };
}
