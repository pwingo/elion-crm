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
  //
  // Two paths produce a threadId on a received touch:
  //   1. Thread-scoped detection: a sent touch already has the threadId
  //   2. Fallback detection: the sent touch had NO threadId (copy/paste send),
  //      but sync-replies captured it from Gmail. In this case no sent touch
  //      has this threadId — only the received touch does.
  //
  // Strategy: look for a sent touch first; if not found, find any touch with
  // this threadId to get the contact+campaign, then find the most recent sent
  // touch for that pair to identify the mailbox owner.
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

    if (sentTouch) {
      gmailUserId = sentTouch.createdBy;
    } else {
      // Fallback path: find the received touch with this threadId, then look
      // up who sent the most recent email to this contact in this campaign.
      const [touchWithThread] = await db
        .select({
          contactId: outreachTouches.contactId,
          campaignId: outreachTouches.campaignId,
        })
        .from(outreachTouches)
        .where(eq(outreachTouches.gmailThreadId, threadOptions.threadId))
        .limit(1);

      if (touchWithThread) {
        const sentTouches = await db
          .select({
            createdBy: outreachTouches.createdBy,
            sentAt: outreachTouches.sentAt,
          })
          .from(outreachTouches)
          .where(
            and(
              eq(outreachTouches.contactId, touchWithThread.contactId),
              eq(outreachTouches.campaignId, touchWithThread.campaignId),
              eq(outreachTouches.state, "sent"),
            ),
          );

        const newest = sentTouches.sort(
          (a, b) =>
            new Date(b.sentAt ?? 0).getTime() -
            new Date(a.sentAt ?? 0).getTime(),
        )[0];
        if (newest) gmailUserId = newest.createdBy;
      }
    }
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
