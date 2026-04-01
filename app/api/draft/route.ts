import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  contacts,
  campaigns,
  outreachTouches,
  voiceExamples,
} from "@/lib/schema";
import { requireUser } from "@/lib/auth";
import { getCorrespondenceHistory } from "@/lib/gmail";
import { getAllContactEmails } from "@/lib/contact-emails";
import { generateDraft } from "@/lib/claude";
import { eq, and } from "drizzle-orm";

export async function POST(request: NextRequest) {
  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { contactId, campaignId, channel, steering } = body as {
    contactId: string;
    campaignId: string;
    channel: "email" | "linkedin";
    steering?: string;
  };

  if (!contactId || !campaignId || !channel) {
    return NextResponse.json(
      { error: "contactId, campaignId, and channel are required" },
      { status: 400 },
    );
  }

  // Load contact
  const [contact] = await db
    .select()
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .limit(1);

  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  // Load campaign
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  // Load touches for this contact+campaign
  const touches = await db
    .select()
    .from(outreachTouches)
    .where(
      and(
        eq(outreachTouches.contactId, contactId),
        eq(outreachTouches.campaignId, campaignId),
      ),
    );

  // Detect reply mode: most recent touch is a received reply
  const sortedTouches = [...touches].sort(
    (a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime(),
  );
  const mostRecentTouch = sortedTouches[0];
  const isReplyMode = mostRecentTouch?.state === "received";

  // In reply mode, force email channel
  const effectiveChannel = isReplyMode ? "email" : channel;

  // Load voice examples for this user + channel
  const examples = await db
    .select()
    .from(voiceExamples)
    .where(
      and(
        eq(voiceExamples.userId, user.id),
        eq(voiceExamples.channel, effectiveChannel),
      ),
    );

  // Load Gmail threads across all contact emails
  let gmailThreads = [] as Awaited<ReturnType<typeof getCorrespondenceHistory>>;
  const allEmails = await getAllContactEmails(contactId);
  if (allEmails.length > 0) {
    gmailThreads = await getCorrespondenceHistory(allEmails);
  }

  const result = await generateDraft({
    contact: {
      name: contact.name,
      organization: contact.organization,
      title: contact.title ?? null,
      notes: contact.notes ?? "",
    },
    campaign: {
      name: campaign.name,
      type: campaign.type,
      date: campaign.date ?? null,
      location: campaign.location ?? null,
      description: campaign.description,
      sellingPoints: campaign.sellingPoints,
    },
    gmailThreads,
    touches: touches.map((t) => ({
      touchNumber: t.touchNumber,
      channel: t.channel,
      state: t.state,
      sentAt: t.sentAt,
      subject: t.subject,
      body: t.body,
    })),
    voiceExamples: examples.map((e) => ({
      subject: e.subject,
      body: e.body,
      archetype: e.archetype,
      notes: e.notes,
    })),
    channel: effectiveChannel,
    steering,
    replyTouch: isReplyMode
      ? { subject: mostRecentTouch.subject, body: mostRecentTouch.body }
      : undefined,
  });

  return NextResponse.json(result);
}
