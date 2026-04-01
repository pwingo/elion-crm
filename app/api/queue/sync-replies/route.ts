import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  campaigns,
  contacts,
  contactCampaignStatus,
  outreachTouches,
} from "@/lib/schema";
import { requireUser } from "@/lib/auth";
import { getGmailClient } from "@/lib/auth";
import { extractHeader, decodeBody } from "@/lib/gmail";
import { and, eq, isNotNull, sql } from "drizzle-orm";

// ─── Types ───────────────────────────────────────────────────────────────────

type GmailPayloadHeaders = Array<{
  name?: string | null;
  value?: string | null;
}>;

type GmailMessageLike = {
  threadId?: string | null;
  payload?: {
    headers?: GmailPayloadHeaders | null;
    mimeType?: string | null;
    body?: { data?: string | null } | null;
    parts?: Array<{
      mimeType?: string | null;
      body?: { data?: string | null } | null;
      parts?: unknown[];
    }> | null;
  } | null;
  internalDate?: string | null;
};

interface DetectedReply {
  messageId: string;
  subject: string;
  body: string;
  date: Date;
  gmailThreadId: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Scan a list of Gmail messages for the most recent one FROM contactEmail
 * that arrived AFTER afterMs. Returns null if no qualifying reply found.
 */
function findLatestReplyInMessages(
  messages: GmailMessageLike[],
  contactEmailLower: string,
  afterMs: number,
): { messageId: string; subject: string; body: string; date: Date; threadId: string | null } | null {
  let latest: ReturnType<typeof findLatestReplyInMessages> = null;

  for (const msg of messages) {
    const headers = (msg.payload?.headers ?? []) as GmailPayloadHeaders;
    const from = extractHeader(headers, "From").toLowerCase();
    if (!from.includes(contactEmailLower)) continue;

    const msgDate = msg.internalDate
      ? new Date(Number(msg.internalDate))
      : null;
    if (!msgDate || msgDate.getTime() <= afterMs) continue;

    const messageId = extractHeader(headers, "Message-ID");
    if (!messageId) continue;

    if (!latest || msgDate.getTime() > latest.date.getTime()) {
      latest = {
        messageId,
        subject: extractHeader(headers, "Subject"),
        body: decodeBody(
          msg.payload as Parameters<typeof decodeBody>[0],
        ).slice(0, 5000),
        date: msgDate,
        threadId: msg.threadId ?? null,
      };
    }
  }

  return latest;
}

// ─── Main endpoint ───────────────────────────────────────────────────────────

export async function POST() {
  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ownerName = user.ownerName;
  if (!ownerName) {
    return NextResponse.json({ error: "No owner name set" }, { status: 400 });
  }

  const today = new Date().toISOString().split("T")[0];

  const activeCampaigns = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.isActive, true));

  if (activeCampaigns.length === 0) {
    return NextResponse.json({ found: 0 });
  }

  let totalFound = 0;

  for (const campaign of activeCampaigns) {
    const rows = await db
      .select({
        contact: contacts,
        status: contactCampaignStatus,
      })
      .from(contactCampaignStatus)
      .innerJoin(contacts, eq(contactCampaignStatus.contactId, contacts.id))
      .where(
        and(
          eq(contactCampaignStatus.campaignId, campaign.id),
          eq(contactCampaignStatus.status, "in_progress"),
          sql`lower(${contacts.owner}) = lower(${ownerName})`,
          eq(contactCampaignStatus.doNotContact, false),
          isNotNull(contacts.email),
        ),
      );

    if (rows.length === 0) continue;

    for (const { contact } of rows) {
      // Get ALL sent touches for this contact+campaign, sorted newest first
      const allSentTouches = (
        await db
          .select()
          .from(outreachTouches)
          .where(
            and(
              eq(outreachTouches.contactId, contact.id),
              eq(outreachTouches.campaignId, campaign.id),
              eq(outreachTouches.state, "sent"),
            ),
          )
      ).sort(
        (a, b) =>
          new Date(b.sentAt ?? 0).getTime() -
          new Date(a.sentAt ?? 0).getTime(),
      );

      if (allSentTouches.length === 0) continue;

      const contactEmailLower = contact.email!.toLowerCase();
      let reply: DetectedReply | null = null;

      // ── Strategy 1: Thread-scoped detection ────────────────────────────
      // For touches that went through the Gmail draft path and have a threadId,
      // fetch the specific thread and look for inbound messages. This is the
      // most accurate attribution — replies are matched to the exact thread.

      const touchesWithThread = allSentTouches.filter(
        (t) => t.gmailThreadId,
      );

      for (const sentTouch of touchesWithThread) {
        const gmail = await getGmailClient(sentTouch.createdBy);
        if (!gmail) continue;

        try {
          const threadData = await gmail.users.threads.get({
            userId: "me",
            id: sentTouch.gmailThreadId!,
            format: "full",
          });

          const sentAtMs = sentTouch.sentAt
            ? new Date(sentTouch.sentAt).getTime()
            : 0;
          const found = findLatestReplyInMessages(
            threadData.data.messages ?? [],
            contactEmailLower,
            sentAtMs,
          );

          if (found) {
            reply = {
              messageId: found.messageId,
              subject: found.subject,
              body: found.body,
              date: found.date,
              gmailThreadId: sentTouch.gmailThreadId,
            };
            break;
          }
        } catch (err) {
          console.error(
            `[sync-replies] Failed to fetch thread ${sentTouch.gmailThreadId}:`,
            err,
          );
          continue;
        }
      }

      // ── Strategy 2: Mailbox search fallback ────────────────────────────
      // For copy/paste sends (no Gmail draft created, no threadId stored),
      // search the sender's mailbox for any inbound from this contact after
      // our most recent send. Less precise than thread-scoped detection but
      // ensures reply detection works regardless of how the email was sent.

      if (!reply) {
        const mostRecentSent = allSentTouches[0];
        const gmail = await getGmailClient(mostRecentSent.createdBy);

        if (gmail) {
          const sentAtMs = mostRecentSent.sentAt
            ? new Date(mostRecentSent.sentAt).getTime()
            : 0;
          const afterEpoch = Math.floor(sentAtMs / 1000);

          try {
            const searchRes = await gmail.users.messages.list({
              userId: "me",
              q: `from:${contact.email} after:${afterEpoch}`,
              maxResults: 10,
            });

            const msgRefs = (searchRes.data.messages ?? []).filter(
              (m) => m.id,
            );

            if (msgRefs.length > 0) {
              // Fetch full message content
              const fullMessages: GmailMessageLike[] = [];
              for (const ref of msgRefs) {
                try {
                  const msgData = await gmail.users.messages.get({
                    userId: "me",
                    id: ref.id!,
                    format: "full",
                  });
                  fullMessages.push(msgData.data);
                } catch {
                  continue;
                }
              }

              const found = findLatestReplyInMessages(
                fullMessages,
                contactEmailLower,
                sentAtMs,
              );

              if (found) {
                reply = {
                  messageId: found.messageId,
                  subject: found.subject,
                  body: found.body,
                  date: found.date,
                  gmailThreadId: found.threadId,
                };
              }
            }
          } catch (err) {
            console.error(
              `[sync-replies] Mailbox search failed for ${contact.email}:`,
              err,
            );
          }
        }
      }

      if (!reply) continue;

      // ── Dedup check ────────────────────────────────────────────────────

      const [existing] = await db
        .select({ id: outreachTouches.id })
        .from(outreachTouches)
        .where(
          and(
            eq(outreachTouches.contactId, contact.id),
            eq(outreachTouches.campaignId, campaign.id),
            eq(outreachTouches.state, "received"),
            eq(outreachTouches.gmailMessageId, reply.messageId),
          ),
        )
        .limit(1);

      if (existing) continue;

      // ── Record reply + cleanup ─────────────────────────────────────────

      await db.transaction(async (tx) => {
        // Delete any existing drafted touch (stale draft cleanup)
        await tx
          .delete(outreachTouches)
          .where(
            and(
              eq(outreachTouches.contactId, contact.id),
              eq(outreachTouches.campaignId, campaign.id),
              eq(outreachTouches.state, "drafted"),
            ),
          );

        // Insert received touch
        await tx.insert(outreachTouches).values({
          contactId: contact.id,
          campaignId: campaign.id,
          touchNumber: null,
          channel: "email",
          state: "received",
          sentAt: reply!.date,
          subject: reply!.subject,
          body: reply!.body,
          createdBy: "sync",
          gmailThreadId: reply!.gmailThreadId,
          gmailMessageId: reply!.messageId,
        });

        // Set nextTouchDate to today
        await tx
          .update(contactCampaignStatus)
          .set({ nextTouchDate: today })
          .where(
            and(
              eq(contactCampaignStatus.contactId, contact.id),
              eq(contactCampaignStatus.campaignId, campaign.id),
            ),
          );
      });

      totalFound++;
    }
  }

  return NextResponse.json({ found: totalFound });
}
