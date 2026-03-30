import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { campaigns } from "@/lib/schema";
import { requireUser } from "@/lib/auth";
import { desc } from "drizzle-orm";

export async function GET() {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select()
    .from(campaigns)
    .orderBy(desc(campaigns.createdAt));

  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  const {
    name,
    type,
    campaignGroup,
    date,
    location,
    description,
    sellingPoints,
    isActive,
    cadenceDays,
    maxTouches,
  } = body;

  const [row] = await db
    .insert(campaigns)
    .values({
      name,
      type,
      campaignGroup: campaignGroup ?? null,
      date: date ?? null,
      location: location ?? null,
      description,
      sellingPoints,
      isActive: isActive ?? true,
      cadenceDays: cadenceDays ?? "[5, 7, 10, 14]",
      maxTouches: maxTouches ?? 4,
    })
    .returning();

  return NextResponse.json(row, { status: 201 });
}
