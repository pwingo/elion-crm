import { eq, and } from "drizzle-orm";
import { campaigns, contactCampaignStatus } from "@/lib/schema";
import { getNextTouchDate } from "@/lib/cadence";
import { getSentCountSinceLastReply } from "@/lib/sent-count";

type Executor = {
  select: typeof import("@/lib/db").db.select;
  update: typeof import("@/lib/db").db.update;
  execute: (...args: never[]) => Promise<unknown>;
};

/**
 * After a touch is marked sent, schedule the next touch or mark the campaign
 * as no_response if max touches have been reached.
 *
 * Works with both `db` and drizzle transaction objects.
 */
export async function scheduleNextTouch(
  executor: Executor,
  contactId: string,
  campaignId: string,
): Promise<void> {
  const [campaign] = await executor
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);

  if (!campaign) return;

  const sentCount = await getSentCountSinceLastReply(executor, contactId, campaignId);
  const maxTouches = campaign.maxTouches ?? 4;

  if (sentCount >= maxTouches) {
    await executor
      .update(contactCampaignStatus)
      .set({ status: "no_response", nextTouchDate: null })
      .where(
        and(
          eq(contactCampaignStatus.contactId, contactId),
          eq(contactCampaignStatus.campaignId, campaignId),
        ),
      );
  } else {
    const cadenceDays = campaign.cadenceDays ?? "[5, 7, 10, 14]";
    const nextTouchDate = getNextTouchDate(sentCount, cadenceDays);

    await executor
      .update(contactCampaignStatus)
      .set({ nextTouchDate })
      .where(
        and(
          eq(contactCampaignStatus.contactId, contactId),
          eq(contactCampaignStatus.campaignId, campaignId),
        ),
      );
  }
}
