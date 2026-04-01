import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contacts, contactEmails } from "@/lib/schema";
import { requireUser } from "@/lib/auth";
import { eq, and } from "drizzle-orm";
import { isBlockedEmail } from "@/lib/env";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const rows = await db
    .select()
    .from(contactEmails)
    .where(eq(contactEmails.contactId, id));

  return NextResponse.json(rows);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!email || !email.includes("@") || email.length > 254) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  if (isBlockedEmail(email)) {
    return NextResponse.json(
      { error: "Email domain is not allowed" },
      { status: 400 },
    );
  }

  const [contact] = await db
    .select({ email: contacts.email })
    .from(contacts)
    .where(eq(contacts.id, id))
    .limit(1);

  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  if (contact.email?.toLowerCase() === email) {
    return NextResponse.json(
      { error: "This is already the primary email" },
      { status: 400 },
    );
  }

  try {
    const [row] = await db
      .insert(contactEmails)
      .values({ contactId: id, email })
      .returning();
    return NextResponse.json(row, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("unique") || msg.includes("duplicate")) {
      return NextResponse.json(
        { error: "Email already exists" },
        { status: 409 },
      );
    }
    throw err;
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const emailId = body.emailId;

  if (!emailId) {
    return NextResponse.json(
      { error: "emailId is required" },
      { status: 400 },
    );
  }

  const deleted = await db
    .delete(contactEmails)
    .where(
      and(eq(contactEmails.id, emailId), eq(contactEmails.contactId, id)),
    )
    .returning({ id: contactEmails.id });

  if (deleted.length === 0) {
    return NextResponse.json({ error: "Email not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
