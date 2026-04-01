import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  contacts,
  campaigns,
  contactCampaignStatus,
  outreachTouches,
} from "@/lib/schema";
import { requireUser } from "@/lib/auth";
import { getCorrespondenceHistory } from "@/lib/gmail";
import { getAllContactEmails } from "@/lib/contact-emails";
import { eq, and } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const contactId = searchParams.get("contactId");
  const campaignId = searchParams.get("campaignId");

  if (!contactId || !campaignId) {
    return NextResponse.json(
      { error: "contactId and campaignId are required" },
      { status: 400 },
    );
  }

  // Run all DB queries and email lookup in parallel
  const [contactRows, campaignRows, statusRows, touches, allEmails] = await Promise.all([
    db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1),
    db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1),
    db.select().from(contactCampaignStatus).where(
      and(
        eq(contactCampaignStatus.contactId, contactId),
        eq(contactCampaignStatus.campaignId, campaignId),
      ),
    ).limit(1),
    db.select().from(outreachTouches).where(
      and(
        eq(outreachTouches.contactId, contactId),
        eq(outreachTouches.campaignId, campaignId),
      ),
    ),
    getAllContactEmails(contactId),
  ]);

  const [contact] = contactRows;
  const [campaign] = campaignRows;
  const [status] = statusRows;

  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  let gmailThreads: Awaited<ReturnType<typeof getCorrespondenceHistory>> = [];
  if (allEmails.length > 0) {
    try {
      gmailThreads = await getCorrespondenceHistory(allEmails);
    } catch (err) {
      console.error(`[context] Gmail error for ${contact.email}:`, err);
      gmailThreads = [];
    }
  }

  return NextResponse.json({
    contact,
    campaign,
    status: status ?? null,
    touches,
    gmailThreads,
  });
}
