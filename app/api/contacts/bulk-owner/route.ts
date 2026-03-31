import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contacts } from "@/lib/schema";
import { requireUser } from "@/lib/auth";
import { inArray } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { contactIds, owner } = body as {
    contactIds: string[];
    owner: string;
  };

  if (!Array.isArray(contactIds) || contactIds.length === 0) {
    return NextResponse.json({ error: "contactIds must be a non-empty array" }, { status: 400 });
  }
  if (contactIds.length > 500) {
    return NextResponse.json(
      { error: "Maximum 500 contacts per request" },
      { status: 400 },
    );
  }
  if (!owner || typeof owner !== "string") {
    return NextResponse.json({ error: "owner is required" }, { status: 400 });
  }

  const updated = await db
    .update(contacts)
    .set({ owner })
    .where(inArray(contacts.id, contactIds))
    .returning({ id: contacts.id });

  return NextResponse.json({ updated: updated.length });
}
