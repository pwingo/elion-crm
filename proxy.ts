import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

function verifySignedCookie(signed: string, secret: string): boolean {
  const lastDot = signed.lastIndexOf(".");
  if (lastDot === -1) return false;
  const value = signed.slice(0, lastDot);
  const expectedHmac = crypto.createHmac("sha256", secret).update(value).digest("base64url");
  return signed === `${value}.${expectedHmac}`;
}

export function proxy(request: NextRequest) {
  const sessionCookie = request.cookies.get("session")?.value;
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  if (!sessionCookie || !verifySignedCookie(sessionCookie, process.env.NEXTAUTH_SECRET!)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
