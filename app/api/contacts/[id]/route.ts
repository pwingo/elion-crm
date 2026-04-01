import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contacts } from "@/lib/schema";
import { requireUser } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { isBlockedEmail } from "@/lib/env";

export async function PATCH(
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

  const [existing] = await db
    .select()
    .from(contacts)
    .where(eq(contacts.id, id))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  // Whitelist + validate mutable fields
  const allowed: Record<string, unknown> = {};
  const errors: string[] = [];

  if (body.name !== undefined) {
    if (typeof body.name !== "string" || body.name.trim().length === 0 || body.name.length > 200) {
      errors.push("name must be a non-empty string (max 200 chars)");
    } else {
      allowed.name = body.name.trim();
    }
  }
  if (body.organization !== undefined) {
    if (typeof body.organization !== "string" || body.organization.trim().length === 0 || body.organization.length > 200) {
      errors.push("organization must be a non-empty string (max 200 chars)");
    } else {
      allowed.organization = body.organization.trim();
    }
  }
  if (body.title !== undefined) {
    if (body.title !== null && (typeof body.title !== "string" || body.title.length > 200)) {
      errors.push("title must be a string (max 200 chars) or null");
    } else {
      allowed.title = body.title;
    }
  }
  if (body.email !== undefined) {
    if (body.email !== null && (typeof body.email !== "string" || body.email.length > 254 || (body.email && !body.email.includes("@")))) {
      errors.push("email must be a valid email string or null");
    } else if (typeof body.email === "string" && isBlockedEmail(body.email)) {
      errors.push("email domain is not allowed");
    } else {
      allowed.email = body.email;
    }
  }
  if (body.linkedinUrl !== undefined) {
    if (body.linkedinUrl !== null && (typeof body.linkedinUrl !== "string" || body.linkedinUrl.length > 500)) {
      errors.push("linkedinUrl must be a string (max 500 chars) or null");
    } else {
      allowed.linkedinUrl = body.linkedinUrl;
    }
  }
  if (body.owner !== undefined) {
    if (typeof body.owner !== "string" || body.owner.trim().length === 0 || body.owner.length > 100) {
      errors.push("owner must be a non-empty string (max 100 chars)");
    } else {
      allowed.owner = body.owner.trim();
    }
  }
  if (body.isProspect !== undefined) {
    if (typeof body.isProspect !== "boolean") {
      errors.push("isProspect must be a boolean");
    } else {
      allowed.isProspect = body.isProspect;
    }
  }
  if (body.isPoc !== undefined) {
    if (typeof body.isPoc !== "boolean") {
      errors.push("isPoc must be a boolean");
    } else {
      allowed.isPoc = body.isPoc;
    }
  }
  if (body.notes !== undefined) {
    if (body.notes !== null && (typeof body.notes !== "string" || body.notes.length > 10000)) {
      errors.push("notes must be a string (max 10000 chars) or null");
    } else {
      allowed.notes = body.notes;
    }
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join("; ") }, { status: 400 });
  }

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const [updated] = await db
    .update(contacts)
    .set(allowed)
    .where(eq(contacts.id, id))
    .returning();

  return NextResponse.json(updated);
}
