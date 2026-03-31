import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { importCsv } from "@/lib/csv-import";

export async function POST(request: NextRequest) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { rows: Record<string, string>[]; campaignId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { rows, campaignId } = body;

  if (!Array.isArray(rows)) {
    return NextResponse.json(
      { error: "Missing required field: rows (array)" },
      { status: 400 },
    );
  }

  const result = await importCsv(rows, campaignId);
  return NextResponse.json(result);
}
