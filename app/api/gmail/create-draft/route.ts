import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createGmailDraft } from "@/lib/gmail";

export async function POST(request: NextRequest) {
  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { to, subject, body: messageBody } = body as {
    to: string;
    subject: string;
    body: string;
  };

  if (!to || !subject || !messageBody) {
    return NextResponse.json(
      { error: "to, subject, and body are required" },
      { status: 400 },
    );
  }

  const draftId = await createGmailDraft(user.id, to, subject, messageBody);

  if (!draftId) {
    return NextResponse.json(
      { error: "Failed to create Gmail draft" },
      { status: 500 },
    );
  }

  return NextResponse.json({ draftId });
}
