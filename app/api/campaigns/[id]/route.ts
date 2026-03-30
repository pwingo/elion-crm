import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { campaigns } from "@/lib/schema";
import { requireUser } from "@/lib/auth";
import { eq } from "drizzle-orm";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const [row] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, id))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(row);
}

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

  const [existing] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, id))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [updated] = await db
    .update(campaigns)
    .set(body)
    .where(eq(campaigns.id, id))
    .returning();

  return NextResponse.json(updated);
}
