import { cookies } from "next/headers";
import crypto from "crypto";
import { env } from "@/lib/env";

const SECRET = env.NEXTAUTH_SECRET;
const COOKIE_NAME = "session";

function sign(value: string): string {
  const hmac = crypto.createHmac("sha256", SECRET).update(value).digest("base64url");
  return `${value}.${hmac}`;
}

function verify(signed: string): string | null {
  const lastDot = signed.lastIndexOf(".");
  if (lastDot === -1) return null;
  const value = signed.slice(0, lastDot);
  const expected = sign(value);
  if (signed !== expected) return null;
  return value;
}

export async function setSessionCookie(userId: string) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, sign(userId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
}

export async function getSessionUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  return verify(raw);
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
