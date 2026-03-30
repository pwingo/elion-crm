import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  campaigns,
  contacts,
  contactCampaignStatus,
  outreachTouches,
} from "@/lib/schema";
import { requireUser } from "@/lib/auth";
import { and, eq, isNotNull, or, sql } from "drizzle-orm";

export async function GET() {
  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ownerName = user.ownerName;
  if (!ownerName) {
    return NextResponse.json({ campaigns: [] });
  }

  const today = new Date().toISOString().split("T")[0];
  const sevenDaysOut = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  // Get all active campaigns
  const activeCampaigns = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.isActive, true));

  if (activeCampaigns.length === 0) {
    return NextResponse.json({ campaigns: [] });
  }

  // For each active campaign, get the relevant contacts+statuses
  const result: {
    campaign: (typeof activeCampaigns)[number];
    needsMarkSent: QueueItem[];
    dueToday: QueueItem[];
    upcoming: QueueItem[];
  }[] = [];

  for (const campaign of activeCampaigns) {
    // Get contacts in this campaign owned by the current user that are reachable and not DNC
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

    if (rows.length === 0) continue;

    // For each contact, get draft touch and sent touch count
    const contactIds = rows.map((r) => r.contact.id);

    // Get drafted touches for this campaign
    const draftedTouches = await db
      .select()
      .from(outreachTouches)
      .where(
        and(
          eq(outreachTouches.campaignId, campaign.id),
          eq(outreachTouches.state, "drafted"),
          or(...contactIds.map((id) => eq(outreachTouches.contactId, id))),
        ),
      );

    // Get sent touch counts per contact for this campaign
    const sentCounts = await db
      .select({
        contactId: outreachTouches.contactId,
        count: sql<number>`count(*)::int`,
        lastChannel: sql<string>`(SELECT channel FROM outreach_touches ot2 WHERE ot2.contact_id = outreach_touches.contact_id AND ot2.campaign_id = outreach_touches.campaign_id AND ot2.state = 'sent' ORDER BY ot2.sent_at DESC NULLS LAST LIMIT 1)`,
      })
      .from(outreachTouches)
      .where(
        and(
          eq(outreachTouches.campaignId, campaign.id),
          eq(outreachTouches.state, "sent"),
          or(...contactIds.map((id) => eq(outreachTouches.contactId, id))),
        ),
      )
      .groupBy(outreachTouches.contactId);

    // Build lookup maps
    const draftByContact = new Map(
      draftedTouches.map((t) => [t.contactId, t]),
    );
    const sentCountByContact = new Map(
      sentCounts.map((s) => [s.contactId, { count: s.count, lastChannel: s.lastChannel }]),
    );

    const needsMarkSent: QueueItem[] = [];
    const dueToday: QueueItem[] = [];
    const upcoming: QueueItem[] = [];

    for (const { contact, status } of rows) {
      const draft = draftByContact.get(contact.id);
      const sentInfo = sentCountByContact.get(contact.id);
      const touchCount = sentInfo?.count ?? 0;
      const lastChannel = sentInfo?.lastChannel ?? null;

      const item: QueueItem = {
        contact,
        status,
        touchCount,
        lastChannel,
        draftTouchId: draft?.id ?? null,
      };

      if (draft) {
        needsMarkSent.push(item);
      } else if (
        status.nextTouchDate != null &&
        status.nextTouchDate <= today &&
        (status.status === "not_started" || status.status === "in_progress")
      ) {
        dueToday.push(item);
      } else if (
        status.nextTouchDate != null &&
        status.nextTouchDate > today &&
        status.nextTouchDate <= sevenDaysOut &&
        (status.status === "not_started" || status.status === "in_progress")
      ) {
        upcoming.push(item);
      }
    }

    // Only include campaigns with at least one item in any section
    if (
      needsMarkSent.length > 0 ||
      dueToday.length > 0 ||
      upcoming.length > 0
    ) {
      result.push({ campaign, needsMarkSent, dueToday, upcoming });
    }
  }

  return NextResponse.json({ campaigns: result });
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface QueueItem {
  contact: {
    id: string;
    name: string;
    organization: string;
    title: string | null;
    email: string | null;
    linkedinUrl: string | null;
    owner: string;
  };
  status: {
    id: string;
    contactId: string;
    campaignId: string;
    status: string | null;
    nextTouchDate: string | null;
    doNotContact: boolean | null;
  };
  touchCount: number;
  lastChannel: string | null;
  draftTouchId: string | null;
}
