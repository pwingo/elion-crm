import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contactCampaignStatus, outreachTouches, statusEnum } from "@/lib/schema";
import { requireUser } from "@/lib/auth";
import { eq, and } from "drizzle-orm";

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

  // Validate status if provided
  if (body.status !== undefined && !statusEnum.includes(body.status)) {
    return NextResponse.json(
      {
        error: `Invalid status '${body.status}'. Must be one of: ${statusEnum.join(", ")}`,
      },
      { status: 400 },
    );
  }

  const [existing] = await db
    .select()
    .from(contactCampaignStatus)
    .where(eq(contactCampaignStatus.id, id))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Validate nextTouchDate format if provided (must be YYYY-MM-DD or null)
  if (body.nextTouchDate !== undefined && body.nextTouchDate !== null) {
    if (
      typeof body.nextTouchDate !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(body.nextTouchDate)
    ) {
      return NextResponse.json(
        { error: "nextTouchDate must be in YYYY-MM-DD format or null" },
        { status: 400 },
      );
    }
  }

  // Validate doNotContact type if provided
  if (body.doNotContact !== undefined && typeof body.doNotContact !== "boolean") {
    return NextResponse.json(
      { error: "doNotContact must be a boolean" },
      { status: 400 },
    );
  }

  // Validate priority if provided (must be 1, 2, 3, or null)
  if (body.priority !== undefined && body.priority !== null) {
    if (typeof body.priority !== "number" || ![1, 2, 3].includes(body.priority)) {
      return NextResponse.json(
        { error: "priority must be 1, 2, 3, or null" },
        { status: 400 },
      );
    }
  }

  // Only allow updating: status, nextTouchDate, doNotContact, priority
  const allowedFields: Record<string, unknown> = {};
  if (body.status !== undefined) allowedFields.status = body.status;
  if (body.nextTouchDate !== undefined) allowedFields.nextTouchDate = body.nextTouchDate;
  if (body.doNotContact !== undefined) allowedFields.doNotContact = body.doNotContact;
  if (body.priority !== undefined) allowedFields.priority = body.priority;

  const [updated] = await db
    .update(contactCampaignStatus)
    .set(allowedFields)
    .where(eq(contactCampaignStatus.id, id))
    .returning();

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const [existing] = await db
    .select()
    .from(contactCampaignStatus)
    .where(eq(contactCampaignStatus.id, id))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Delete associated touches first
  await db
    .delete(outreachTouches)
    .where(
      and(
        eq(outreachTouches.contactId, existing.contactId),
        eq(outreachTouches.campaignId, existing.campaignId),
      ),
    );

  // Delete the campaign assignment
  await db
    .delete(contactCampaignStatus)
    .where(eq(contactCampaignStatus.id, id));

  return NextResponse.json({ ok: true });
}
