import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contacts } from "@/lib/schema";
import { requireUser } from "@/lib/auth";
import { asc } from "drizzle-orm";

function csvEscape(value: string | null | boolean | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  // If the value contains a comma, newline, or double-quote, wrap in quotes
  if (str.includes('"') || str.includes(",") || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET() {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select()
    .from(contacts)
    .orderBy(asc(contacts.name));

  const headers = ["Name", "Organization", "Title", "Email", "LinkedIn", "Owner", "Prospect", "POC", "Notes"];

  const lines: string[] = [headers.join(",")];

  for (const row of rows) {
    const line = [
      csvEscape(row.name),
      csvEscape(row.organization),
      csvEscape(row.title),
      csvEscape(row.email),
      csvEscape(row.linkedinUrl),
      csvEscape(row.owner),
      csvEscape(row.isProspect ? "Yes" : "No"),
      csvEscape(row.isPoc ? "Yes" : "No"),
      csvEscape(row.notes),
    ].join(",");
    lines.push(line);
  }

  const csv = lines.join("\r\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contacts-${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}
