import { sql } from "drizzle-orm";

/**
 * Count sent touches since the most recent received (reply) touch
 * for a contact+campaign pair. If no reply exists, counts all sent
 * touches (original behavior).
 *
 * Accepts both `db` and drizzle transaction objects.
 */
export async function getSentCountSinceLastReply(
  executor: { execute: (...args: never[]) => Promise<unknown> },
  contactId: string,
  campaignId: string,
): Promise<number> {
  const result = await (executor as { execute: (q: ReturnType<typeof sql>) => Promise<unknown> }).execute(sql`
    SELECT count(*)::int AS count FROM outreach_touches
    WHERE contact_id = ${contactId}
      AND campaign_id = ${campaignId}
      AND state = 'sent'
      AND (sent_at > (
        SELECT MAX(sent_at) FROM outreach_touches
        WHERE contact_id = ${contactId}
          AND campaign_id = ${campaignId}
          AND state = 'received'
      ) OR NOT EXISTS (
        SELECT 1 FROM outreach_touches
        WHERE contact_id = ${contactId}
          AND campaign_id = ${campaignId}
          AND state = 'received'
      ))
  `);
  const rows = (result as { rows: Array<{ count: number }> }).rows;
  return rows[0]?.count ?? 0;
}
