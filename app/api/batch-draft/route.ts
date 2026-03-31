import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  campaigns,
  contacts,
  contactCampaignStatus,
  outreachTouches,
  voiceExamples,
} from "@/lib/schema";
import { requireUser } from "@/lib/auth";
import { generateDraft } from "@/lib/claude";
import { getCorrespondenceHistory } from "@/lib/gmail";
import { and, eq, isNotNull, or, sql } from "drizzle-orm";

interface DueContact {
  contactId: string;
  contactName: string;
  contactEmail: string | null;
  contactLinkedinUrl: string | null;
  contactOrganization: string;
  contactTitle: string | null;
  contactNotes: string;
  campaignId: string;
}

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

  // Get all active campaigns
  const activeCampaigns = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.isActive, true));

  if (activeCampaigns.length === 0) {
    return NextResponse.json({ error: "No active campaigns" }, { status: 400 });
  }

  // Collect all due contacts across campaigns
  const dueContacts: DueContact[] = [];

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
          eq(contacts.owner, ownerName),
          eq(contactCampaignStatus.doNotContact, false),
          or(isNotNull(contacts.email), isNotNull(contacts.linkedinUrl)),
        ),
      );

    for (const { contact, status } of rows) {
      if (
        status.nextTouchDate != null &&
        status.nextTouchDate <= today &&
        (status.status === "not_started" || status.status === "in_progress")
      ) {
        dueContacts.push({
          contactId: contact.id,
          contactName: contact.name,
          contactEmail: contact.email,
          contactLinkedinUrl: contact.linkedinUrl,
          contactOrganization: contact.organization,
          contactTitle: contact.title,
          contactNotes: contact.notes ?? "",
          campaignId: campaign.id,
        });
      }
    }
  }

  // Filter out contacts that already have a drafted touch
  const withDrafts =
    dueContacts.length > 0
      ? await db
          .select({
            contactId: outreachTouches.contactId,
            campaignId: outreachTouches.campaignId,
          })
          .from(outreachTouches)
          .where(
            and(
              eq(outreachTouches.state, "drafted"),
              or(
                ...dueContacts.map((dc) =>
                  and(
                    eq(outreachTouches.contactId, dc.contactId),
                    eq(outreachTouches.campaignId, dc.campaignId),
                  ),
                ),
              ),
            ),
          )
      : [];

  const draftedSet = new Set(
    withDrafts.map((d) => `${d.contactId}:${d.campaignId}`),
  );
  const toDraft = dueContacts.filter(
    (dc) => !draftedSet.has(`${dc.contactId}:${dc.campaignId}`),
  );

  if (toDraft.length === 0) {
    return NextResponse.json(
      { error: "No contacts need drafting" },
      { status: 400 },
    );
  }

  // Load voice examples once (shared across all drafts)
  const emailExamples = await db
    .select()
    .from(voiceExamples)
    .where(
      and(
        eq(voiceExamples.userId, user.id),
        eq(voiceExamples.channel, "email"),
      ),
    );
  const linkedinExamples = await db
    .select()
    .from(voiceExamples)
    .where(
      and(
        eq(voiceExamples.userId, user.id),
        eq(voiceExamples.channel, "linkedin"),
      ),
    );

  // Load all campaign details into a map
  const campaignMap = new Map(activeCampaigns.map((c) => [c.id, c]));

  // SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
        );
      };

      const BATCH_SIZE = 3;
      let succeeded = 0;
      let failed = 0;

      for (let i = 0; i < toDraft.length; i += BATCH_SIZE) {
        const batch = toDraft.slice(i, i + BATCH_SIZE);

        const results = await Promise.allSettled(
          batch.map(async (dc) => {
            const channel: "email" | "linkedin" = dc.contactEmail
              ? "email"
              : "linkedin";
            const campaign = campaignMap.get(dc.campaignId)!;

            // Load touches for this contact+campaign
            const touches = await db
              .select()
              .from(outreachTouches)
              .where(
                and(
                  eq(outreachTouches.contactId, dc.contactId),
                  eq(outreachTouches.campaignId, dc.campaignId),
                ),
              );

            // Load Gmail threads if email channel
            let gmailThreads: Awaited<
              ReturnType<typeof getCorrespondenceHistory>
            > = [];
            if (dc.contactEmail) {
              gmailThreads = await getCorrespondenceHistory(
                dc.contactEmail,
                dc.contactName,
              );
            }

            const examples =
              channel === "email" ? emailExamples : linkedinExamples;

            // Generate draft via Claude
            const result = await generateDraft({
              contact: {
                name: dc.contactName,
                organization: dc.contactOrganization,
                title: dc.contactTitle,
                notes: dc.contactNotes,
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
              channel,
            });

            // Save as drafted touch (same logic as POST /api/touches)
            await db.transaction(async (tx) => {
              const [{ count: sentCount }] = await tx
                .select({ count: sql<number>`count(*)::int` })
                .from(outreachTouches)
                .where(
                  and(
                    eq(outreachTouches.contactId, dc.contactId),
                    eq(outreachTouches.campaignId, dc.campaignId),
                    eq(outreachTouches.state, "sent"),
                  ),
                );

              await tx
                .delete(outreachTouches)
                .where(
                  and(
                    eq(outreachTouches.contactId, dc.contactId),
                    eq(outreachTouches.campaignId, dc.campaignId),
                    eq(outreachTouches.state, "drafted"),
                  ),
                );

              await tx.insert(outreachTouches).values({
                contactId: dc.contactId,
                campaignId: dc.campaignId,
                channel,
                state: "drafted",
                touchNumber: sentCount + 1,
                subject: result.subject ?? null,
                body: result.body,
                draftCreatedAt: new Date(),
                createdBy: user.id,
              });

              await tx
                .update(contactCampaignStatus)
                .set({ status: "in_progress" })
                .where(
                  and(
                    eq(contactCampaignStatus.contactId, dc.contactId),
                    eq(contactCampaignStatus.campaignId, dc.campaignId),
                    eq(contactCampaignStatus.status, "not_started"),
                  ),
                );
            });

            return {
              contactId: dc.contactId,
              contactName: dc.contactName,
              campaignId: dc.campaignId,
            };
          }),
        );

        for (const [idx, result] of results.entries()) {
          const dc = batch[idx];
          const current = i + idx + 1;
          if (result.status === "fulfilled") {
            succeeded++;
            send({
              type: "progress",
              contactId: dc.contactId,
              contactName: dc.contactName,
              campaignId: dc.campaignId,
              status: "success",
              current,
              total: toDraft.length,
            });
          } else {
            failed++;
            send({
              type: "progress",
              contactId: dc.contactId,
              contactName: dc.contactName,
              campaignId: dc.campaignId,
              status: "error",
              error:
                result.reason instanceof Error
                  ? result.reason.message
                  : "Unknown error",
              current,
              total: toDraft.length,
            });
          }
        }
      }

      send({ type: "done", succeeded, failed, total: toDraft.length });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
