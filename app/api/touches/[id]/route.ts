import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { outreachTouches, contactCampaignStatus, campaigns } from "@/lib/schema";
import { requireUser } from "@/lib/auth";
import { getNextTouchDate } from "@/lib/cadence";
import { eq, and, sql } from "drizzle-orm";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();

  if (body.state !== "sent") {
    return NextResponse.json({ error: "Only state='sent' is supported" }, { status: 400 });
  }

  // 1. Get the touch by ID — 404 if not found
  const [touch] = await db
    .select()
    .from(outreachTouches)
    .where(eq(outreachTouches.id, id))
    .limit(1);

  if (!touch) {
    return NextResponse.json({ error: "Touch not found" }, { status: 404 });
  }

  // 2. Validate state transition: touch must be in "drafted" state
  if (touch.state !== "drafted") {
    return NextResponse.json(
      {
        error: `Cannot mark as sent: touch is currently '${touch.state}', expected 'drafted'`,
      },
      { status: 409 },
    );
  }

  // 3. Mark as sent
  const [updatedTouch] = await db
    .update(outreachTouches)
    .set({ state: "sent", sentAt: new Date() })
    .where(eq(outreachTouches.id, id))
    .returning();

  // 4. Get the campaign for cadence settings
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, touch.campaignId))
    .limit(1);

  if (!campaign) {
    return NextResponse.json(updatedTouch);
  }

  // 5. Count total sent touches for this contact+campaign (including the one just marked)
  const [{ count: sentCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(outreachTouches)
    .where(
      and(
        eq(outreachTouches.contactId, touch.contactId),
        eq(outreachTouches.campaignId, touch.campaignId),
        eq(outreachTouches.state, "sent"),
      ),
    );

  const maxTouches = campaign.maxTouches ?? 4;

  // 6. If sentCount >= maxTouches: set status to "no_response", clear nextTouchDate
  if (sentCount >= maxTouches) {
    await db
      .update(contactCampaignStatus)
      .set({ status: "no_response", nextTouchDate: null })
      .where(
        and(
          eq(contactCampaignStatus.contactId, touch.contactId),
          eq(contactCampaignStatus.campaignId, touch.campaignId),
        ),
      );
  } else {
    // 7. Calculate nextTouchDate using cadence, or use override from body
    const cadenceDays = campaign.cadenceDays ?? "[5, 7, 10, 14]";
    const nextTouchDate =
      body.nextTouchDate ?? getNextTouchDate(sentCount + 1, cadenceDays);

    // 8. Update contact_campaign_status
    await db
      .update(contactCampaignStatus)
      .set({ nextTouchDate })
      .where(
        and(
          eq(contactCampaignStatus.contactId, touch.contactId),
          eq(contactCampaignStatus.campaignId, touch.campaignId),
        ),
      );
  }

  return NextResponse.json(updatedTouch);
}
