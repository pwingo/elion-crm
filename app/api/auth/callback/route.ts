import { NextRequest, NextResponse } from "next/server";
import { getOAuth2Client } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { env } from "@/lib/env";
import { setSessionCookie } from "@/lib/session";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { google } from "googleapis";
import { cookies } from "next/headers";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=no_code", request.url));
  }

  const cookieStore = await cookies();
  const savedState = cookieStore.get("oauth_state")?.value;
  cookieStore.delete("oauth_state");

  if (!state || !savedState || state !== savedState) {
    return NextResponse.redirect(new URL("/login?error=invalid_state", request.url));
  }

  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
  const { data: profile } = await oauth2.userinfo.get();

  if (!profile.email || !profile.name) {
    return NextResponse.redirect(new URL("/login?error=no_profile", request.url));
  }

  // Restrict access to allowed emails only
  const allowedEmails = env.ALLOWED_EMAILS;
  if (allowedEmails.length > 0 && !allowedEmails.includes(profile.email.toLowerCase())) {
    return NextResponse.redirect(new URL("/login?error=not_allowed", request.url));
  }

  const existing = await db.select().from(users).where(eq(users.email, profile.email)).limit(1);
  let userId: string;

  if (existing.length > 0) {
    userId = existing[0].id;
    await db
      .update(users)
      .set({
        googleAccessToken: tokens.access_token ? encrypt(tokens.access_token) : null,
        googleRefreshToken: tokens.refresh_token
          ? encrypt(tokens.refresh_token)
          : existing[0].googleRefreshToken,
        name: profile.name,
      })
      .where(eq(users.id, userId));
  } else {
    userId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: profile.email,
      name: profile.name,
      googleAccessToken: tokens.access_token ? encrypt(tokens.access_token) : null,
      googleRefreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
      ownerName: profile.name.split(" ")[0],
    });
  }

  await setSessionCookie(userId);
  return NextResponse.redirect(new URL("/queue", request.url));
}
