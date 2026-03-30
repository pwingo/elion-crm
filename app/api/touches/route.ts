import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  outreachTouches,
  contactCampaignStatus,
} from "@/lib/schema";
import { requireUser } from "@/lib/auth";
import { addBusinessDays } from "@/lib/cadence";
import { eq, and, sql } from "drizzle-orm";

export async function POST(request: NextRequest) {
  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { contactId, campaignId, channel, state, subject, messageBody, skipReason } =
    body as {
      contactId: string;
      campaignId: string;
      channel: "email" | "linkedin";
      state: "drafted" | "skipped";
      subject?: string;
      messageBody?: string;
      skipReason?: string;
    };

  if (!contactId || !campaignId || !channel || !state) {
    return NextResponse.json(
      { error: "contactId, campaignId, channel, and state are required" },
      { status: 400 },
    );
  }

  if (state === "drafted") {
    const touch = await db.transaction(async (tx) => {
      // 1. Count sent touches for this contact+campaign
      const [{ count: sentCount }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(outreachTouches)
        .where(
          and(
            eq(outreachTouches.contactId, contactId),
            eq(outreachTouches.campaignId, campaignId),
            eq(outreachTouches.state, "sent"),
          ),
        );

      // 2. Delete any existing drafted touch for this contact+campaign
      await tx
        .delete(outreachTouches)
        .where(
          and(
            eq(outreachTouches.contactId, contactId),
            eq(outreachTouches.campaignId, campaignId),
            eq(outreachTouches.state, "drafted"),
          ),
        );

      // 3. Insert new drafted touch with touchNumber = sentCount + 1
      const [newTouch] = await tx
        .insert(outreachTouches)
        .values({
          contactId,
          campaignId,
          channel,
          state: "drafted",
          touchNumber: sentCount + 1,
          subject: subject ?? null,
          body: messageBody ?? null,
          draftCreatedAt: new Date(),
          createdBy: user.id,
        })
        .returning();

      // 4. If contact_campaign_status is "not_started", update to "in_progress"
      await tx
        .update(contactCampaignStatus)
        .set({ status: "in_progress" })
        .where(
          and(
            eq(contactCampaignStatus.contactId, contactId),
            eq(contactCampaignStatus.campaignId, campaignId),
            eq(contactCampaignStatus.status, "not_started"),
          ),
        );

      return newTouch;
    });

    return NextResponse.json(touch, { status: 201 });
  }

  if (state === "skipped") {
    // 1. Insert a skipped touch
    const [touch] = await db
      .insert(outreachTouches)
      .values({
        contactId,
        campaignId,
        channel,
        state: "skipped",
        touchNumber: null,
        skipReason: skipReason ?? null,
        createdBy: user.id,
      })
      .returning();

    // 2. Update nextTouchDate to +2 business days from today
    const nextDate = addBusinessDays(new Date(), 2);
    const yyyy = nextDate.getFullYear();
    const mm = String(nextDate.getMonth() + 1).padStart(2, "0");
    const dd = String(nextDate.getDate()).padStart(2, "0");
    const nextTouchDate = `${yyyy}-${mm}-${dd}`;

    await db
      .update(contactCampaignStatus)
      .set({ nextTouchDate })
      .where(
        and(
          eq(contactCampaignStatus.contactId, contactId),
          eq(contactCampaignStatus.campaignId, campaignId),
        ),
      );

    return NextResponse.json(touch, { status: 201 });
  }

  return NextResponse.json({ error: "Invalid state" }, { status: 400 });
}
