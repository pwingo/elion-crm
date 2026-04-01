import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createGmailDraft } from "@/lib/gmail";
import { db } from "@/lib/db";
import { outreachTouches } from "@/lib/schema";
import { and, eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { to, subject, body: messageBody, threadId, inReplyTo } = body as {
    to: string;
    subject: string;
    body: string;
    threadId?: string;
    inReplyTo?: string;
  };

  if (!to || !subject || !messageBody) {
    return NextResponse.json(
      { error: "to, subject, and body are required" },
      { status: 400 },
    );
  }

  const threadOptions =
    threadId && inReplyTo ? { threadId, inReplyTo } : undefined;

  // Thread IDs are mailbox-local. When replying in a thread, the draft must
  // be created in the mailbox that owns the threadId — which may belong to a
  // different recruiter than the currently signed-in user.
  let gmailUserId = user.id;
  if (threadOptions) {
    const [sentTouch] = await db
      .select({ createdBy: outreachTouches.createdBy })
      .from(outreachTouches)
      .where(
        and(
          eq(outreachTouches.gmailThreadId, threadOptions.threadId),
          eq(outreachTouches.state, "sent"),
        ),
      )
      .limit(1);
    if (sentTouch) gmailUserId = sentTouch.createdBy;
  }

  const result = await createGmailDraft(
    gmailUserId,
    to,
    subject,
    messageBody,
    threadOptions,
  );

  if (!result) {
    return NextResponse.json(
      { error: "Failed to create Gmail draft" },
      { status: 500 },
    );
  }

  return NextResponse.json(result);
}
