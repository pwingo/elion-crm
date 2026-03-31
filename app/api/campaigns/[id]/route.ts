import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { campaigns, campaignTypeEnum } from "@/lib/schema";
import { requireUser } from "@/lib/auth";
import { eq } from "drizzle-orm";

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

  const [row] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, id))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(row);
}

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
    .from(campaigns)
    .where(eq(campaigns.id, id))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
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
  if (body.type !== undefined) {
    if (!campaignTypeEnum.includes(body.type)) {
      errors.push(`type must be one of: ${campaignTypeEnum.join(", ")}`);
    } else {
      allowed.type = body.type;
    }
  }
  if (body.campaignGroup !== undefined) {
    if (body.campaignGroup !== null && (typeof body.campaignGroup !== "string" || body.campaignGroup.length > 200)) {
      errors.push("campaignGroup must be a string (max 200 chars) or null");
    } else {
      allowed.campaignGroup = body.campaignGroup;
    }
  }
  if (body.date !== undefined) {
    if (body.date !== null && (typeof body.date !== "string" || body.date.length > 50)) {
      errors.push("date must be a string (max 50 chars) or null");
    } else {
      allowed.date = body.date;
    }
  }
  if (body.location !== undefined) {
    if (body.location !== null && (typeof body.location !== "string" || body.location.length > 200)) {
      errors.push("location must be a string (max 200 chars) or null");
    } else {
      allowed.location = body.location;
    }
  }
  if (body.description !== undefined) {
    if (typeof body.description !== "string" || body.description.trim().length === 0 || body.description.length > 5000) {
      errors.push("description must be a non-empty string (max 5000 chars)");
    } else {
      allowed.description = body.description;
    }
  }
  if (body.sellingPoints !== undefined) {
    if (typeof body.sellingPoints !== "string" || body.sellingPoints.trim().length === 0 || body.sellingPoints.length > 5000) {
      errors.push("sellingPoints must be a non-empty string (max 5000 chars)");
    } else {
      allowed.sellingPoints = body.sellingPoints;
    }
  }
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== "boolean") {
      errors.push("isActive must be a boolean");
    } else {
      allowed.isActive = body.isActive;
    }
  }
  if (body.cadenceDays !== undefined) {
    if (typeof body.cadenceDays !== "string" || body.cadenceDays.length > 100) {
      errors.push("cadenceDays must be a string (max 100 chars)");
    } else {
      try {
        const parsed = JSON.parse(body.cadenceDays);
        if (!Array.isArray(parsed) || !parsed.every((n: unknown) => typeof n === "number" && n > 0)) {
          errors.push("cadenceDays must be a JSON array of positive numbers");
        } else {
          allowed.cadenceDays = body.cadenceDays;
        }
      } catch {
        errors.push("cadenceDays must be valid JSON");
      }
    }
  }
  if (body.maxTouches !== undefined) {
    if (typeof body.maxTouches !== "number" || !Number.isInteger(body.maxTouches) || body.maxTouches < 1 || body.maxTouches > 20) {
      errors.push("maxTouches must be an integer between 1 and 20");
    } else {
      allowed.maxTouches = body.maxTouches;
    }
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join("; ") }, { status: 400 });
  }

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const [updated] = await db
    .update(campaigns)
    .set(allowed)
    .where(eq(campaigns.id, id))
    .returning();

  return NextResponse.json(updated);
}
