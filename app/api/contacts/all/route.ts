import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contacts, contactCampaignStatus, campaigns } from "@/lib/schema";
import { requireUser } from "@/lib/auth";
import { eq, asc } from "drizzle-orm";

export async function GET() {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch all contacts ordered by name
  const rows = await db
    .select()
    .from(contacts)
    .orderBy(asc(contacts.name));

  // Fetch campaign memberships for all contacts (to show as badges)
  const statuses = await db
    .select({
      statusId: contactCampaignStatus.id,
      contactId: contactCampaignStatus.contactId,
      campaignId: contactCampaignStatus.campaignId,
      campaignName: campaigns.name,
    })
    .from(contactCampaignStatus)
    .innerJoin(campaigns, eq(contactCampaignStatus.campaignId, campaigns.id));

  // Build a map of contactId -> campaign list
  const campaignsByContact = new Map<string, { statusId: string; id: string; name: string }[]>();
  for (const s of statuses) {
    const list = campaignsByContact.get(s.contactId) ?? [];
    list.push({ statusId: s.statusId, id: s.campaignId, name: s.campaignName });
    campaignsByContact.set(s.contactId, list);
  }

  const enriched = rows.map((c) => ({
    id: c.id,
    name: c.name,
    organization: c.organization,
    title: c.title,
    email: c.email,
    linkedinUrl: c.linkedinUrl,
    owner: c.owner,
    isProspect: c.isProspect,
    isPoc: c.isPoc,
    notes: c.notes,
    campaigns: campaignsByContact.get(c.id) ?? [],
  }));

  return NextResponse.json({ contacts: enriched });
}
