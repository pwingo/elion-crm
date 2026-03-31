import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  campaigns,
  contacts,
  contactCampaignStatus,
  outreachTouches,
} from "@/lib/schema";
import { requireUser } from "@/lib/auth";
import { and, eq, inArray, sql } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const campaignId = searchParams.get("campaignId");
  const campaignGroup = searchParams.get("campaignGroup");

  if (!campaignId && !campaignGroup) {
    return NextResponse.json(
      { error: "Provide campaignId or campaignGroup" },
      { status: 400 },
    );
  }

  // Resolve campaign IDs
  let campaignIds: string[] = [];
  let campaignMap = new Map<string, string>(); // id -> name

  if (campaignId) {
    const [camp] = await db
      .select({ id: campaigns.id, name: campaigns.name })
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);
    if (!camp) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    campaignIds = [camp.id];
    campaignMap.set(camp.id, camp.name);
  } else if (campaignGroup) {
    const rows = await db
      .select({ id: campaigns.id, name: campaigns.name })
      .from(campaigns)
      .where(eq(campaigns.campaignGroup, campaignGroup));
    if (rows.length === 0) {
      return NextResponse.json({ contacts: [] });
    }
    campaignIds = rows.map((r) => r.id);
    for (const r of rows) campaignMap.set(r.id, r.name);
  }

  // Fetch contact+status rows for these campaigns
  const rows = await db
    .select({
      contact: contacts,
      status: contactCampaignStatus,
    })
    .from(contactCampaignStatus)
    .innerJoin(contacts, eq(contactCampaignStatus.contactId, contacts.id))
    .where(inArray(contactCampaignStatus.campaignId, campaignIds));

  if (rows.length === 0) {
    return NextResponse.json({ contacts: [] });
  }

  // Get touch counts per (contactId, campaignId)
  const contactIdList = [...new Set(rows.map((r) => r.contact.id))];

  const contactIdParams = contactIdList.map((id) => sql`${id}`);
  const contactIdSql = sql.join(contactIdParams, sql`, `);
  const campaignIdParams = campaignIds.map((id) => sql`${id}`);
  const campaignIdSql = sql.join(campaignIdParams, sql`, `);
  const sentTouchesResult = await db.execute(sql`
    SELECT
      contact_id,
      campaign_id,
      count(*)::int as count,
      max(sent_at) as last_sent_at,
      (array_agg(channel ORDER BY sent_at DESC NULLS LAST))[1] as last_channel
    FROM outreach_touches
    WHERE state = 'sent'
      AND contact_id IN (${contactIdSql})
      AND campaign_id IN (${campaignIdSql})
    GROUP BY contact_id, campaign_id
  `);
  const sentTouches = ((sentTouchesResult as unknown as { rows: Array<{ contact_id: string; campaign_id: string; count: number; last_sent_at: string | null; last_channel: string | null }> }).rows) ?? [];

  const draftTouches = await db
    .select({
      contactId: outreachTouches.contactId,
      campaignId: outreachTouches.campaignId,
      count: sql<number>`count(*)::int`,
    })
    .from(outreachTouches)
    .where(
      and(
        eq(outreachTouches.state, "drafted"),
        inArray(outreachTouches.contactId, contactIdList),
        inArray(outreachTouches.campaignId, campaignIds),
      ),
    )
    .groupBy(outreachTouches.contactId, outreachTouches.campaignId);

  // Build lookup maps
  const sentMap = new Map<string, { count: number; lastSentAt: string | null; lastChannel: string | null }>();
  for (const s of sentTouches) {
    sentMap.set(`${s.contact_id}:${s.campaign_id}`, {
      count: s.count,
      lastSentAt: s.last_sent_at,
      lastChannel: s.last_channel,
    });
  }

  const draftMap = new Map<string, number>();
  for (const d of draftTouches) {
    draftMap.set(`${d.contactId}:${d.campaignId}`, d.count);
  }

  const today = new Date();

  const enriched = rows.map(({ contact, status }) => {
    const key = `${contact.id}:${status.campaignId}`;
    const sentInfo = sentMap.get(key);
    const draftCount = draftMap.get(key) ?? 0;
    const touchCount = sentInfo?.count ?? 0;
    const lastSentAt = sentInfo?.lastSentAt ?? null;
    const lastChannel = sentInfo?.lastChannel ?? null;

    let daysSinceContact: number | null = null;
    if (lastSentAt) {
      const diff = today.getTime() - new Date(lastSentAt).getTime();
      daysSinceContact = Math.floor(diff / (1000 * 60 * 60 * 24));
    }

    return {
      // Contact fields
      id: contact.id,
      name: contact.name,
      organization: contact.organization,
      title: contact.title,
      email: contact.email,
      linkedinUrl: contact.linkedinUrl,
      owner: contact.owner,
      isProspect: contact.isProspect,
      isPoc: contact.isPoc,
      notes: contact.notes,
      // Campaign context
      statusId: status.id,
      campaignId: status.campaignId,
      campaignName: campaignMap.get(status.campaignId) ?? "",
      status: status.status ?? "not_started",
      nextTouchDate: status.nextTouchDate,
      doNotContact: status.doNotContact ?? false,
      // Touch stats
      touchCount,
      draftsPending: draftCount,
      lastChannel,
      lastTouch: lastSentAt,
      daysSinceContact,
    };
  });

  return NextResponse.json({ contacts: enriched });
}
