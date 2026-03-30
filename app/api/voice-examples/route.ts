import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { voiceExamples } from "@/lib/schema";
import { requireUser } from "@/lib/auth";

export async function POST(request: NextRequest) {
  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { channel, subject, body: messageBody, archetype, notes } = body as {
    channel: "email" | "linkedin";
    subject?: string;
    body: string;
    archetype?: string;
    notes?: string;
  };

  if (!channel || !messageBody) {
    return NextResponse.json(
      { error: "channel and body are required" },
      { status: 400 },
    );
  }

  const [example] = await db
    .insert(voiceExamples)
    .values({
      userId: user.id,
      channel,
      subject: subject ?? null,
      body: messageBody,
      archetype: archetype ?? null,
      notes: notes ?? null,
    })
    .returning();

  return NextResponse.json(example, { status: 201 });
}
