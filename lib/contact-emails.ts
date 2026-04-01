import { db } from "@/lib/db";
import { contacts, contactEmails } from "@/lib/schema";
import { eq } from "drizzle-orm";

export async function getAllContactEmails(
  contactId: string,
): Promise<string[]> {
  const [contact] = await db
    .select({ email: contacts.email })
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .limit(1);

  const additional = await db
    .select({ email: contactEmails.email })
    .from(contactEmails)
    .where(eq(contactEmails.contactId, contactId));

  const emails: string[] = [];
  if (contact?.email) emails.push(contact.email);
  for (const row of additional) {
    emails.push(row.email);
  }
  return emails;
}
