import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contactCampaignStatus } from "@/lib/schema";
import { requireUser } from "@/lib/auth";
import { and, eq, inArray } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { contactIds, campaignId } = body as {
    contactIds: string[];
    campaignId: string;
  };

  if (!Array.isArray(contactIds) || contactIds.length === 0) {
    return NextResponse.json({ error: "contactIds must be a non-empty array" }, { status: 400 });
  }
  if (!campaignId) {
    return NextResponse.json({ error: "campaignId is required" }, { status: 400 });
  }

  // Find which contacts already have a row for this campaign
  const existing = await db
    .select({ contactId: contactCampaignStatus.contactId })
    .from(contactCampaignStatus)
    .where(
      and(
        inArray(contactCampaignStatus.contactId, contactIds),
        eq(contactCampaignStatus.campaignId, campaignId),
      ),
    );

  const alreadyAssigned = new Set(existing.map((r) => r.contactId));
  const toInsert = contactIds.filter((id) => !alreadyAssigned.has(id));

  if (toInsert.length > 0) {
    await db.insert(contactCampaignStatus).values(
      toInsert.map((contactId) => ({
        contactId,
        campaignId,
        status: "not_started" as const,
      })),
    );
  }

  return NextResponse.json({
    assigned: toInsert.length,
    skipped: alreadyAssigned.size,
  });
}
