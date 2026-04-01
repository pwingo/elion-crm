import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { campaigns, contactCampaignStatus } from "@/lib/schema";
import { requireUser } from "@/lib/auth";
import { sql } from "drizzle-orm";

export async function GET() {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await db.execute(sql`
    SELECT
      c.id,
      c.name,
      c.type,
      c.is_active,
      c.date,
      c.location,
      count(ccs.id)::int AS contact_count,
      ccs.status
    FROM ${campaigns} c
    LEFT JOIN ${contactCampaignStatus} ccs ON ccs.campaign_id = c.id
    GROUP BY c.id, c.name, c.type, c.is_active, c.date, c.location, ccs.status
    ORDER BY c.created_at DESC
  `);

  interface SummaryRow { id: string; name: string; type: string; is_active: boolean; date: string | null; location: string | null; contact_count: number; status: string | null }
  const rows: SummaryRow[] = (result as unknown as { rows: SummaryRow[] }).rows ?? [];

  // Aggregate rows: multiple rows per campaign (one per status) into one object
  const campaignMap = new Map<
    string,
    {
      id: string;
      name: string;
      type: string;
      isActive: boolean;
      date: string | null;
      location: string | null;
      contactCount: number;
      statusBreakdown: Record<string, number>;
    }
  >();

  for (const row of rows) {
    let entry = campaignMap.get(row.id);
    if (!entry) {
      entry = {
        id: row.id,
        name: row.name,
        type: row.type,
        isActive: row.is_active,
        date: row.date,
        location: row.location,
        contactCount: 0,
        statusBreakdown: {},
      };
      campaignMap.set(row.id, entry);
    }

    if (row.status && row.contact_count > 0) {
      entry.statusBreakdown[row.status] = row.contact_count;
      entry.contactCount += row.contact_count;
    }
  }

  return NextResponse.json([...campaignMap.values()]);
}
