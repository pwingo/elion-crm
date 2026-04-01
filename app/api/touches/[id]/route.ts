import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { outreachTouches } from "@/lib/schema";
import { requireUser } from "@/lib/auth";
import { scheduleNextTouch } from "@/lib/schedule-next-touch";
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

  // 1. Get the touch by ID — 404 if not found
  const [touch] = await db
    .select()
    .from(outreachTouches)
    .where(eq(outreachTouches.id, id))
    .limit(1);

  if (!touch) {
    return NextResponse.json({ error: "Touch not found" }, { status: 404 });
  }

  if (body.state !== "sent") {
    return NextResponse.json({ error: "Only state='sent' is supported" }, { status: 400 });
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

  // 3. Mark as sent (also update subject/body if provided, in case user edited after saving draft)
  const updates: Record<string, unknown> = { state: "sent", sentAt: new Date() };
  if (body.subject !== undefined) updates.subject = body.subject;
  if (body.messageBody !== undefined) updates.body = body.messageBody;

  const [updatedTouch] = await db
    .update(outreachTouches)
    .set(updates)
    .where(eq(outreachTouches.id, id))
    .returning();

  // 4. Schedule next touch or mark no_response
  await scheduleNextTouch(db, touch.contactId, touch.campaignId);

  return NextResponse.json(updatedTouch);
}
