# Security Hardening for Cloud Deployment

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden access control, input validation, and configuration so the app can be safely deployed to the cloud.

**Architecture:** All API routes already require authentication via `requireUser()`, but the OAuth callback accepts *any* Google account. The main gaps in priority order: (1) no sign-in allowlist — anyone with a Google account can create a user and access the app; (2) PATCH endpoints pass raw request bodies directly to Drizzle `.set()`, allowing any column to be overwritten, with no value validation; (3) bulk and CSV import operations have no size limits; (4) env vars aren't validated at startup; (5) no logout endpoint. We fix each with minimal, targeted changes.

**Tech Stack:** Next.js 16, Drizzle ORM, PostgreSQL, Google OAuth 2.0

**Allowed users:** patrick@elion.health, bobby@elion.health, jeremy@elion.health

---

### Task 1: Restrict sign-in to allowed emails

**Files:**
- Create: `lib/env.ts`
- Modify: `app/api/auth/callback/route.ts:34-36`

This is the highest-priority fix. Currently `app/api/auth/callback/route.ts:38-62` creates or updates a user row for any Google account that completes the OAuth flow. On the public internet, anyone with a Google account gets full access.

- [ ] **Step 1: Create `lib/env.ts` with allowlist and env validation**

```typescript
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  DATABASE_URL: requireEnv("DATABASE_URL"),
  NEXTAUTH_SECRET: requireEnv("NEXTAUTH_SECRET"),
  GOOGLE_CLIENT_ID: requireEnv("GOOGLE_CLIENT_ID"),
  GOOGLE_CLIENT_SECRET: requireEnv("GOOGLE_CLIENT_SECRET"),
  GOOGLE_REDIRECT_URI: requireEnv("GOOGLE_REDIRECT_URI"),
  ANTHROPIC_API_KEY: requireEnv("ANTHROPIC_API_KEY"),
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  ALLOWED_EMAILS: (process.env.ALLOWED_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean),
} as const;
```

- [ ] **Step 2: Add allowlist check in the OAuth callback**

In `app/api/auth/callback/route.ts`, after the `if (!profile.email || !profile.name)` check (line 34-36), add:

```typescript
  // Restrict access to allowed emails only
  const allowedEmails = env.ALLOWED_EMAILS;
  if (allowedEmails.length > 0 && !allowedEmails.includes(profile.email.toLowerCase())) {
    return NextResponse.redirect(new URL("/login?error=not_allowed", request.url));
  }
```

Add the import at the top of the file:

```typescript
import { env } from "@/lib/env";
```

- [ ] **Step 3: Add `ALLOWED_EMAILS` to `.env.local`**

```
ALLOWED_EMAILS=patrick@elion.health,bobby@elion.health,jeremy@elion.health
```

- [ ] **Step 4: Verify by testing login**

Run: `pnpm dev`, navigate to `/login`, sign in with an allowed Google account.
Expected: Redirects to `/queue` as before.

Then test with a non-allowed account (or temporarily remove your email from the list).
Expected: Redirects to `/login?error=not_allowed`.

- [ ] **Step 5: Commit**

```bash
git add lib/env.ts app/api/auth/callback/route.ts
git commit -m "feat: restrict sign-in to ALLOWED_EMAILS allowlist"
```

---

### Task 2: Wire env validation into remaining modules

**Files:**
- Modify: `lib/db.ts:1-9`
- Modify: `lib/auth.ts:1-20`
- Modify: `lib/session.ts:1-4`

Now that `lib/env.ts` exists (from Task 1), wire the other modules to use it so the app fails fast on missing config.

- [ ] **Step 1: Wire `lib/db.ts`**

Replace `process.env.DATABASE_URL` usage:

```typescript
import { env } from "@/lib/env";
// ...
const pool = new Pool({
  connectionString: env.DATABASE_URL,
});
```

- [ ] **Step 2: Wire `lib/auth.ts`**

Replace `process.env` usage in `getOAuth2Client()`:

```typescript
import { env } from "./env";
// ...
export function getOAuth2Client() {
  return new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URI,
  );
}
```

- [ ] **Step 3: Wire `lib/session.ts`**

Replace `const SECRET = process.env.NEXTAUTH_SECRET!;` with:

```typescript
import { env } from "@/lib/env";
const SECRET = env.NEXTAUTH_SECRET;
```

- [ ] **Step 4: Verify the app starts**

Run: `pnpm dev`
Expected: App starts normally. Temporarily remove a required var from `.env.local` to confirm it throws a clear error.

- [ ] **Step 5: Commit**

```bash
git add lib/db.ts lib/auth.ts lib/session.ts
git commit -m "refactor: wire all modules to lib/env for fail-fast validation"
```

---

### Task 3: Add field whitelisting + value validation to contacts PATCH

**Files:**
- Modify: `app/api/contacts/[id]/route.ts:17-34`

Currently `db.update(contacts).set(body)` passes the raw request body, allowing overwrite of `id`, `createdAt`, or any column. Beyond key whitelisting, values need type/length checks too.

- [ ] **Step 1: Replace the PATCH handler body (lines 17-36)**

```typescript
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
```

- [ ] **Step 2: Test manually**

Edit a contact in the UI — name, notes, email fields. Verify the update still works.

- [ ] **Step 3: Commit**

```bash
git add app/api/contacts/[id]/route.ts
git commit -m "fix: whitelist fields and validate values on contacts PATCH"
```

---

### Task 4: Add field whitelisting + value validation to campaigns PATCH

**Files:**
- Modify: `app/api/campaigns/[id]/route.ts:43-59`

Same raw body issue. Also validates `type` against the enum, `maxTouches` as a positive integer, and `cadenceDays` as valid JSON array.

- [ ] **Step 1: Add import for `campaignTypeEnum`**

At the top of `app/api/campaigns/[id]/route.ts`:

```typescript
import { campaigns, campaignTypeEnum } from "@/lib/schema";
```

- [ ] **Step 2: Replace the PATCH handler body (lines 43-61)**

```typescript
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
```

- [ ] **Step 3: Commit**

```bash
git add app/api/campaigns/[id]/route.ts
git commit -m "fix: whitelist fields and validate values on campaigns PATCH"
```

---

### Task 5: Add size limits to bulk operations and CSV import

**Files:**
- Modify: `app/api/contacts/bulk-assign/route.ts:20-22`
- Modify: `app/api/contacts/bulk-owner/route.ts:20-22`
- Modify: `app/api/contacts/import/route.ts:19-28`

CSV import is the heaviest unbounded path — it fans out into N DB writes + N Attio API lookups per row. Bulk-assign and bulk-owner also need caps.

- [ ] **Step 1: Add limit to CSV import**

In `app/api/contacts/import/route.ts`, after the `if (!Array.isArray(rows))` check (line 21-25), add:

```typescript
  if (rows.length > 1000) {
    return NextResponse.json(
      { error: "Maximum 1000 rows per import" },
      { status: 400 },
    );
  }
```

- [ ] **Step 2: Add limit to bulk-assign**

In `app/api/contacts/bulk-assign/route.ts`, after the existing `if (!Array.isArray(contactIds) || contactIds.length === 0)` check, add:

```typescript
  if (contactIds.length > 500) {
    return NextResponse.json(
      { error: "Maximum 500 contacts per request" },
      { status: 400 },
    );
  }
```

- [ ] **Step 3: Add limit to bulk-owner**

In `app/api/contacts/bulk-owner/route.ts`, after the existing `if (!Array.isArray(contactIds) || contactIds.length === 0)` check, add:

```typescript
  if (contactIds.length > 500) {
    return NextResponse.json(
      { error: "Maximum 500 contacts per request" },
      { status: 400 },
    );
  }
```

- [ ] **Step 4: Commit**

```bash
git add app/api/contacts/import/route.ts app/api/contacts/bulk-assign/route.ts app/api/contacts/bulk-owner/route.ts
git commit -m "fix: add size limits to CSV import (1000) and bulk ops (500)"
```

---

### Task 6: Add logout endpoint

**Files:**
- Create: `app/api/auth/logout/route.ts`

`clearSession()` exists in `lib/session.ts` but nothing calls it. Lower priority than access control and validation, but needed for session revocation.

- [ ] **Step 1: Create the logout route**

Create `app/api/auth/logout/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { clearSession } from "@/lib/session";

export async function POST() {
  await clearSession();
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Verify it works**

```bash
curl -X POST http://localhost:3000/api/auth/logout -b 'session=...'
```

Expected: 200 with `{"ok":true}`, and the session cookie is cleared.

- [ ] **Step 3: Commit**

```bash
git add app/api/auth/logout/route.ts
git commit -m "feat: add /api/auth/logout endpoint"
```

---

### Task 7: Create `.env.example`

**Files:**
- Create: `.env.example`

Documents required vars for deployment without exposing real values.

- [ ] **Step 1: Create `.env.example`**

```bash
# Database
DATABASE_URL=postgresql://user:password@host:5432/dbname

# Auth
NEXTAUTH_SECRET=generate-a-random-secret-with-openssl-rand-base64-32

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-secret
GOOGLE_REDIRECT_URI=https://your-domain.com/api/auth/callback

# Anthropic
ANTHROPIC_API_KEY=sk-ant-your-key

# Attio (optional)
ATTIO_API_KEY=your-attio-key

# Access control — comma-separated list of allowed Google emails
ALLOWED_EMAILS=patrick@elion.health,bobby@elion.health,jeremy@elion.health

# App
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: add .env.example for deployment reference"
```

---

### Summary of changes (priority order)

| Task | What | Closes |
|------|------|--------|
| 1 | Email allowlist on OAuth callback + env validation | Anyone-can-sign-in exposure |
| 2 | Wire env validation into remaining modules | Cryptic crash on missing config |
| 3 | Contacts PATCH: field whitelist + value validation | Column overwrite + malformed data |
| 4 | Campaigns PATCH: field whitelist + value validation | Column overwrite + invalid type/cadenceDays/maxTouches |
| 5 | Size limits on CSV import, bulk-assign, bulk-owner | Unbounded DB mutations + Attio fan-out |
| 6 | Logout endpoint | Session revocation |
| 7 | `.env.example` | Deployment documentation |

**Already secure (no changes needed):**
- `touches/[id]` PATCH — validates `state === "sent"`, only sets `state`/`sentAt`
- `campaign-status/[id]` PATCH — already whitelists `status`, `nextTouchDate`, `doNotContact` with enum validation
- `voice-examples` — properly scoped to `user.id`, destructured fields
- Session cookies — httpOnly, secure in prod, sameSite=lax, HMAC-signed
- OAuth tokens — AES-256-GCM encrypted at rest
- All SQL — parameterized via Drizzle ORM
