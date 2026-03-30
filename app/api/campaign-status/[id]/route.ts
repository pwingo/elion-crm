import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contactCampaignStatus, statusEnum } from "@/lib/schema";
import { requireUser } from "@/lib/auth";
import { eq } from "drizzle-orm";

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

  // Only allow updating: status, nextTouchDate, doNotContact
  const allowedFields: Record<string, unknown> = {};
  if (body.status !== undefined) allowedFields.status = body.status;
  if (body.nextTouchDate !== undefined) allowedFields.nextTouchDate = body.nextTouchDate;
  if (body.doNotContact !== undefined) allowedFields.doNotContact = body.doNotContact;

  const [updated] = await db
    .update(contactCampaignStatus)
    .set(allowedFields)
    .where(eq(contactCampaignStatus.id, id))
    .returning();

  return NextResponse.json(updated);
}
