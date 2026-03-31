import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contacts, contactCampaignStatus } from "@/lib/schema";
import { requireUser } from "@/lib/auth";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const campaignId = searchParams.get("campaignId");

  if (!campaignId) {
    return NextResponse.json({ error: "campaignId is required" }, { status: 400 });
  }

  // Find all contact IDs already assigned to this campaign
  const assigned = await db
    .select({ contactId: contactCampaignStatus.contactId })
    .from(contactCampaignStatus)
    .where(eq(contactCampaignStatus.campaignId, campaignId));

  const assignedIds = new Set(assigned.map((r) => r.contactId));

  // Fetch all contacts and filter out the assigned ones
  const allContacts = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      organization: contacts.organization,
      title: contacts.title,
      email: contacts.email,
      linkedinUrl: contacts.linkedinUrl,
      owner: contacts.owner,
    })
    .from(contacts);

  const unassigned = allContacts.filter((c) => !assignedIds.has(c.id));

  return NextResponse.json({ contacts: unassigned });
}
