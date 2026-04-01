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

  const [contact] = await db
    .select()
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .limit(1);

  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const [status] = await db
    .select()
    .from(contactCampaignStatus)
    .where(
      and(
        eq(contactCampaignStatus.contactId, contactId),
        eq(contactCampaignStatus.campaignId, campaignId),
      ),
    )
    .limit(1);

  const touches = await db
    .select()
    .from(outreachTouches)
    .where(
      and(
        eq(outreachTouches.contactId, contactId),
        eq(outreachTouches.campaignId, campaignId),
      ),
    );

  let gmailThreads: Awaited<ReturnType<typeof getCorrespondenceHistory>> = [];
  const allEmails = await getAllContactEmails(contactId);
  if (allEmails.length > 0) {
    try {
      gmailThreads = await getCorrespondenceHistory(allEmails);
      console.log(`[context] Gmail threads for ${contact.email}: ${gmailThreads.length}`);
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
