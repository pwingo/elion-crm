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

  // 1. Load all active campaigns
  const activeCampaigns = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.isActive, true));

  if (activeCampaigns.length === 0) {
    return NextResponse.json({ found: 0 });
  }

  let totalFound = 0;

  for (const campaign of activeCampaigns) {
    // 2. Find in_progress contacts owned by current user with email
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

    // 3. For each contact, find sent touches with gmailThreadId
    for (const { contact } of rows) {
      const sentTouches = await db
        .select()
        .from(outreachTouches)
        .where(
          and(
            eq(outreachTouches.contactId, contact.id),
            eq(outreachTouches.campaignId, campaign.id),
            eq(outreachTouches.state, "sent"),
            isNotNull(outreachTouches.gmailThreadId),
          ),
        );

      if (sentTouches.length === 0) continue;

      // 4. For each sent touch, check its thread for replies
      for (const sentTouch of sentTouches) {
        if (!sentTouch.gmailThreadId || !sentTouch.createdBy) continue;

        // Use createdBy as mailbox owner (thread IDs are mailbox-local)
        const gmail = await getGmailClient(sentTouch.createdBy);
        if (!gmail) continue;

        let threadMessages: Array<{
          id?: string | null;
          payload?: {
            headers?: Array<{ name?: string | null; value?: string | null }> | null;
            mimeType?: string | null;
            body?: { data?: string | null } | null;
            parts?: Array<{
              mimeType?: string | null;
              body?: { data?: string | null } | null;
              parts?: unknown[];
            }> | null;
          } | null;
          internalDate?: string | null;
        }>;

        try {
          const threadData = await gmail.users.threads.get({
            userId: "me",
            id: sentTouch.gmailThreadId,
            format: "full",
          });
          threadMessages = threadData.data.messages ?? [];
        } catch (err) {
          console.error(
            `[sync-replies] Failed to fetch thread ${sentTouch.gmailThreadId}:`,
            err,
          );
          continue;
        }

        // Filter to messages FROM the contact AFTER our sent touch
        const sentAtMs = sentTouch.sentAt
          ? new Date(sentTouch.sentAt).getTime()
          : 0;
        const contactEmailLower = contact.email!.toLowerCase();

        // Find the most recent inbound message
        let latestReply: {
          messageId: string;
          subject: string;
          body: string;
          date: Date;
        } | null = null;

        for (const msg of threadMessages) {
          const headers = msg.payload?.headers ?? [];
          const from = extractHeader(
            headers as Array<{ name?: string | null; value?: string | null }>,
            "From",
          ).toLowerCase();

          if (!from.includes(contactEmailLower)) continue;

          const msgDate = msg.internalDate
            ? new Date(Number(msg.internalDate))
            : null;
          if (!msgDate || msgDate.getTime() <= sentAtMs) continue;

          const gmailMessageId = extractHeader(
            headers as Array<{ name?: string | null; value?: string | null }>,
            "Message-ID",
          );
          if (!gmailMessageId) continue; // Skip messages without Message-ID (required for dedup)
          const subject = extractHeader(
            headers as Array<{ name?: string | null; value?: string | null }>,
            "Subject",
          );
          const body = decodeBody(msg.payload as Parameters<typeof decodeBody>[0]);

          if (
            !latestReply ||
            msgDate.getTime() > latestReply.date.getTime()
          ) {
            latestReply = {
              messageId: gmailMessageId,
              subject,
              body: body.slice(0, 5000),
              date: msgDate,
            };
          }
        }

        if (!latestReply) continue;

        // 5. Dedup: check if we already recorded this reply
        const [existing] = await db
          .select({ id: outreachTouches.id })
          .from(outreachTouches)
          .where(
            and(
              eq(outreachTouches.contactId, contact.id),
              eq(outreachTouches.campaignId, campaign.id),
              eq(outreachTouches.state, "received"),
              eq(outreachTouches.gmailMessageId, latestReply.messageId),
            ),
          )
          .limit(1);

        if (existing) continue;

        // 6. Record the reply and clean up stale drafts
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
            sentAt: latestReply!.date,
            subject: latestReply!.subject,
            body: latestReply!.body,
            createdBy: "sync",
            gmailThreadId: sentTouch.gmailThreadId,
            gmailMessageId: latestReply!.messageId,
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
        // Only record the most recent reply per contact+campaign per sync
        break;
      }
    }
  }

  return NextResponse.json({ found: totalFound });
}
