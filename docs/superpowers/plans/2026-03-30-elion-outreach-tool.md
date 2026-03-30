# Elion Outreach Tool — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Next.js web app that drafts personalized outreach (email + LinkedIn) using Gmail correspondence history and Claude, with queue management and pipeline tracking.

**Architecture:** Standalone Next.js 15 app (App Router) with PostgreSQL via Drizzle ORM. Google OAuth for auth + Gmail API access. Server-side Claude API calls for draft generation. Deployed to Cloud Run.

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS v4, PostgreSQL, Drizzle ORM, Google APIs (OAuth2, Gmail), Anthropic Claude SDK, Biome

**Spec:** `docs/superpowers/specs/2026-03-29-summit-recruiting-tool-design.md`

---

## File Structure

```
elion-crm/
├── app/
│   ├── layout.tsx                    # Root layout with providers
│   ├── page.tsx                      # Redirect to /queue
│   ├── globals.css                   # Tailwind imports + theme
│   ├── providers.tsx                 # Client-side context providers
│   ├── login/page.tsx                # Login page
│   ├── queue/page.tsx                # My Queue view
│   ├── pipeline/page.tsx             # Pipeline Overview view
│   ├── contacts/
│   │   └── [contactId]/
│   │       └── [campaignId]/page.tsx # Contact Detail / Drafting view
│   ├── settings/
│   │   ├── page.tsx                  # Settings landing (campaigns)
│   │   ├── campaigns/
│   │   │   ├── new/page.tsx          # Create campaign
│   │   │   └── [id]/page.tsx         # Edit campaign
│   │   ├── import/page.tsx           # CSV import
│   │   ├── voice-examples/page.tsx   # Voice examples CRUD
│   │   └── export/page.tsx           # CSV export
│   └── api/
│       ├── auth/
│       │   ├── login/route.ts        # Initiate Google OAuth
│       │   ├── callback/route.ts     # OAuth callback handler
│       │   └── me/route.ts           # Get current user
│       ├── campaigns/
│       │   └── route.ts              # GET list, POST create
│       ├── campaigns/[id]/
│       │   └── route.ts              # GET, PATCH, DELETE campaign
│       ├── contacts/
│       │   └── route.ts              # GET list (with campaign filters)
│       ├── contacts/[id]/
│       │   └── route.ts              # GET, PATCH contact
│       ├── campaign-status/[id]/
│       │   └── route.ts              # PATCH contact_campaign_status (status, nextTouchDate, doNotContact)
│       ├── contacts/import/
│       │   └── route.ts              # POST CSV import
│       ├── contacts/export/
│       │   └── route.ts              # GET CSV export
│       ├── queue/
│       │   └── route.ts              # GET queue for current user
│       ├── context/
│       │   └── route.ts              # GET assembled context for contact+campaign
│       ├── draft/
│       │   └── route.ts              # POST generate draft via Claude
│       ├── touches/
│       │   ├── route.ts              # POST create touch (draft/skip)
│       │   └── [id]/
│       │       └── route.ts          # PATCH mark sent
│       ├── gmail/
│       │   └── create-draft/route.ts # POST create Gmail draft
│       └── voice-examples/
│           └── route.ts              # GET, POST, DELETE voice examples
├── lib/
│   ├── db.ts                         # Drizzle client instance
│   ├── schema.ts                     # Drizzle schema (all tables)
│   ├── auth.ts                       # Auth helpers (OAuth, Gmail client, requireUser)
│   ├── session.ts                    # Signed session cookie helpers (HMAC-SHA256)
│   ├── gmail.ts                      # Gmail API service
│   ├── claude.ts                     # Claude drafting service
│   ├── cadence.ts                    # Business day calculation + cadence logic
│   └── csv-import.ts                 # CSV parsing + import logic
├── components/
│   ├── Nav.tsx                       # Top navigation bar
│   ├── QueueCard.tsx                 # Contact card in My Queue
│   ├── PipelineTable.tsx             # Pipeline Overview table
│   ├── ContactDetail.tsx             # Left panel — context briefing
│   ├── DraftPanel.tsx                # Right panel — drafting
│   ├── StatusBadge.tsx               # Status enum dropdown/badge
│   ├── CampaignSelector.tsx          # Campaign/group selector
│   ├── EditStatusModal.tsx            # Edit campaign status modal (status, nextTouchDate, doNotContact)
│   └── CsvImportForm.tsx             # CSV upload + campaign selector
├── drizzle/                          # Generated migration files
├── drizzle.config.ts                 # Drizzle Kit config
├── package.json
├── tsconfig.json
├── next.config.ts
├── postcss.config.mjs
├── biome.json
└── .env.local                        # Local environment variables
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `biome.json`, `app/globals.css`, `.env.local`, `.gitignore`

- [ ] **Step 1: Initialize Next.js project**

```bash
cd /Users/patrickwingo/Desktop/Elion/code/hackweek/elion-crm
npx create-next-app@latest . --typescript --tailwind --eslint=false --app --src-dir=false --import-alias="@/*" --turbopack=false --yes
```

Expected: Next.js 15 project scaffolded with App Router

- [ ] **Step 2: Remove default boilerplate**

Delete the default page content and unused files:
- Clear `app/page.tsx` to a simple redirect
- Clear `app/globals.css` to minimal Tailwind imports
- Remove `app/favicon.ico` default, `public/` default SVGs

- [ ] **Step 3: Install core dependencies**

```bash
pnpm add drizzle-orm pg @anthropic-ai/sdk googleapis papaparse
pnpm add -D drizzle-kit @types/pg @types/papaparse @biomejs/biome typescript @types/node
```

- [ ] **Step 4: Configure Biome**

Create `biome.json`:
```json
{
  "$schema": "https://biomejs.dev/schemas/2.3.15/schema.json",
  "formatter": {
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "linter": {
    "rules": {
      "recommended": true,
      "correctness": {
        "noUnusedImports": "warn",
        "noUnusedVariables": "warn"
      },
      "suspicious": {
        "noExplicitAny": "warn"
      }
    }
  },
  "files": {
    "ignores": ["node_modules", ".next", "dist", "drizzle"]
  }
}
```

- [ ] **Step 5: Configure PostCSS for Tailwind v4**

Replace `postcss.config.mjs`:
```javascript
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
```

- [ ] **Step 6: Set up globals.css**

Replace `app/globals.css`:
```css
@import "tailwindcss";

:root {
  --background: #ffffff;
  --foreground: #171717;
  --muted: #f5f5f5;
  --muted-foreground: #737373;
  --border: #e5e5e5;
  --primary: #2563eb;
  --primary-foreground: #ffffff;
  --destructive: #dc2626;
  --success: #16a34a;
  --warning: #d97706;
}
```

- [ ] **Step 7: Configure next.config.ts**

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg"],
};

export default nextConfig;
```

- [ ] **Step 8: Create .env.local template**

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/elion_crm

# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/callback

# Claude
ANTHROPIC_API_KEY=

# Attio (optional)
ATTIO_API_KEY=

# App
NEXTAUTH_SECRET=generate-a-random-secret-here
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- [ ] **Step 9: Update .gitignore**

Append to `.gitignore`:
```
.env.local
.env.production
drizzle/meta
```

- [ ] **Step 10: Verify project runs**

```bash
pnpm dev
```

Expected: App starts on http://localhost:3000

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js 15 project with Tailwind, Drizzle, Biome"
```

---

### Task 2: Database Schema + Migrations

**Files:**
- Create: `lib/schema.ts`, `lib/db.ts`, `drizzle.config.ts`

- [ ] **Step 1: Create Drizzle config**

Create `drizzle.config.ts`:
```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./lib/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

- [ ] **Step 2: Create the full schema**

Create `lib/schema.ts`:
```typescript
import {
  pgTable,
  text,
  boolean,
  integer,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// ============ USERS ============
export const users = pgTable("users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  googleAccessToken: text("google_access_token"),
  googleRefreshToken: text("google_refresh_token"),
  ownerName: text("owner_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============ CONTACTS ============
export const contacts = pgTable("contacts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  organization: text("organization").notNull(),
  title: text("title"),
  email: text("email"),
  linkedinUrl: text("linkedin_url"),
  owner: text("owner").notNull(),
  isProspect: boolean("is_prospect").default(false).notNull(),
  isPoc: boolean("is_poc").default(false).notNull(),
  notes: text("notes").default("").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============ CAMPAIGNS ============
export const campaignTypeEnum = [
  "provider_recruiting",
  "vendor_recruiting",
  "sales",
  "content",
  "conference",
  "other",
] as const;

export type CampaignType = (typeof campaignTypeEnum)[number];

export const campaigns = pgTable("campaigns", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  type: text("type").$type<CampaignType>().notNull(),
  campaignGroup: text("campaign_group"),
  date: text("date"),
  location: text("location"),
  description: text("description").notNull(),
  sellingPoints: text("selling_points").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  cadenceDays: text("cadence_days").default("[5, 7, 10, 14]").notNull(),
  maxTouches: integer("max_touches").default(4).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============ CONTACT CAMPAIGN STATUS ============
export const statusEnum = [
  "not_started",
  "in_progress",
  "responded",
  "confirmed",
  "declined",
  "no_response",
  "on_hold",
  "not_a_fit",
] as const;

export type ContactStatus = (typeof statusEnum)[number];

export const contactCampaignStatus = pgTable(
  "contact_campaign_status",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    status: text("status").$type<ContactStatus>().default("not_started").notNull(),
    nextTouchDate: text("next_touch_date"),
    doNotContact: boolean("do_not_contact").default(false).notNull(),
  },
  (table) => [
    uniqueIndex("contact_campaign_unique").on(table.contactId, table.campaignId),
  ]
);

// ============ OUTREACH TOUCHES ============
export const channelEnum = ["email", "linkedin"] as const;
export type Channel = (typeof channelEnum)[number];

export const touchStateEnum = ["drafted", "sent", "skipped"] as const;
export type TouchState = (typeof touchStateEnum)[number];

export const outreachTouches = pgTable(
  "outreach_touches",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    touchNumber: integer("touch_number"),
    channel: text("channel").$type<Channel>().notNull(),
    state: text("state").$type<TouchState>().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    draftCreatedAt: timestamp("draft_created_at"),
    sentAt: timestamp("sent_at"),
    subject: text("subject"),
    body: text("body"),
    createdBy: text("created_by").notNull(),
    skipReason: text("skip_reason"),
  },
  (table) => [
    // One-open-draft invariant: at most one drafted touch per contact+campaign
    uniqueIndex("one_open_draft").on(table.contactId, table.campaignId).where(
      sql`state = 'drafted'`
    ),
  ]
);

// ============ VOICE EXAMPLES ============
export const voiceExamples = pgTable("voice_examples", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  channel: text("channel").$type<Channel>().notNull(),
  archetype: text("archetype"),
  subject: text("subject"),
  body: text("body").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============ RELATIONS ============
export const usersRelations = relations(users, ({ many }) => ({
  voiceExamples: many(voiceExamples),
}));

export const contactsRelations = relations(contacts, ({ many }) => ({
  campaignStatuses: many(contactCampaignStatus),
  touches: many(outreachTouches),
}));

export const campaignsRelations = relations(campaigns, ({ many }) => ({
  contactStatuses: many(contactCampaignStatus),
  touches: many(outreachTouches),
}));

export const contactCampaignStatusRelations = relations(
  contactCampaignStatus,
  ({ one }) => ({
    contact: one(contacts, {
      fields: [contactCampaignStatus.contactId],
      references: [contacts.id],
    }),
    campaign: one(campaigns, {
      fields: [contactCampaignStatus.campaignId],
      references: [campaigns.id],
    }),
  })
);

export const outreachTouchesRelations = relations(outreachTouches, ({ one }) => ({
  contact: one(contacts, {
    fields: [outreachTouches.contactId],
    references: [contacts.id],
  }),
  campaign: one(campaigns, {
    fields: [outreachTouches.campaignId],
    references: [campaigns.id],
  }),
}));

export const voiceExamplesRelations = relations(voiceExamples, ({ one }) => ({
  user: one(users, {
    fields: [voiceExamples.userId],
    references: [users.id],
  }),
}));
```

- [ ] **Step 3: Create Drizzle client**

Create `lib/db.ts`:
```typescript
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });
```

- [ ] **Step 4: Generate and run migrations**

```bash
pnpm drizzle-kit generate
pnpm drizzle-kit push
```

Expected: Tables created in PostgreSQL with the partial unique index on outreach_touches.

- [ ] **Step 5: Verify schema**

```bash
pnpm drizzle-kit studio
```

Expected: Drizzle Studio opens, showing all 6 tables with correct columns and indexes.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add PostgreSQL schema with Drizzle ORM — users, contacts, campaigns, touches, voice_examples"
```

---

### Task 3: Google OAuth Authentication

**Files:**
- Create: `lib/session.ts`, `lib/auth.ts`, `app/api/auth/login/route.ts`, `app/api/auth/callback/route.ts`, `app/api/auth/me/route.ts`, `app/login/page.tsx`, `app/providers.tsx`

- [ ] **Step 1: Create signed session helpers**

Create `lib/session.ts`:
```typescript
import { cookies } from "next/headers";
import crypto from "crypto";

const SECRET = process.env.NEXTAUTH_SECRET!;
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
    maxAge: 60 * 60 * 24 * 30, // 30 days
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
```

- [ ] **Step 2: Create auth helpers**

Create `lib/auth.ts`:
```typescript
import { google } from "googleapis";
import { db } from "./db";
import { users } from "./schema";
import { eq } from "drizzle-orm";
import { getSessionUserId } from "./session";

const SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
];

export function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

export function getAuthUrl(state: string) {
  const oauth2Client = getOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state,
  });
}

export async function getSession() {
  const userId = await getSessionUserId();
  if (!userId) return null;

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return user ?? null;
}

export async function requireUser() {
  const user = await getSession();
  if (!user) {
    throw new Error("Unauthorized");
  }
  return user;
}

export async function getGmailClient(userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user?.googleAccessToken) return null;

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: user.googleAccessToken,
    refresh_token: user.googleRefreshToken,
  });

  // Handle token refresh
  oauth2Client.on("tokens", async (tokens) => {
    if (tokens.access_token) {
      await db
        .update(users)
        .set({
          googleAccessToken: tokens.access_token,
          ...(tokens.refresh_token ? { googleRefreshToken: tokens.refresh_token } : {}),
        })
        .where(eq(users.id, userId));
    }
  });

  return google.gmail({ version: "v1", auth: oauth2Client });
}
```

- [ ] **Step 3: Create OAuth login route with state parameter**

Create `app/api/auth/login/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { getAuthUrl } from "@/lib/auth";
import { cookies } from "next/headers";
import crypto from "crypto";

export async function GET() {
  // Generate and store OAuth state for CSRF protection
  const state = crypto.randomBytes(32).toString("base64url");
  const cookieStore = await cookies();
  cookieStore.set("oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes
    path: "/",
  });

  const url = getAuthUrl(state);
  return NextResponse.redirect(url);
}
```

- [ ] **Step 4: Create OAuth callback route with state validation**

Create `app/api/auth/callback/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { getOAuth2Client } from "@/lib/auth";
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

  // Validate OAuth state to prevent CSRF
  const cookieStore = await cookies();
  const savedState = cookieStore.get("oauth_state")?.value;
  cookieStore.delete("oauth_state");

  if (!state || !savedState || state !== savedState) {
    return NextResponse.redirect(new URL("/login?error=invalid_state", request.url));
  }

  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  // Get user info
  const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
  const { data: profile } = await oauth2.userinfo.get();

  if (!profile.email || !profile.name) {
    return NextResponse.redirect(new URL("/login?error=no_profile", request.url));
  }

  // Upsert user
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, profile.email))
    .limit(1);

  let userId: string;

  if (existing.length > 0) {
    userId = existing[0].id;
    await db
      .update(users)
      .set({
        googleAccessToken: tokens.access_token ?? null,
        googleRefreshToken: tokens.refresh_token ?? existing[0].googleRefreshToken,
        name: profile.name,
      })
      .where(eq(users.id, userId));
  } else {
    userId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: profile.email,
      name: profile.name,
      googleAccessToken: tokens.access_token ?? null,
      googleRefreshToken: tokens.refresh_token ?? null,
      ownerName: profile.name.split(" ")[0], // Default to first name
    });
  }

  // Set signed session cookie
  await setSessionCookie(userId);

  return NextResponse.redirect(new URL("/queue", request.url));
}
```

- [ ] **Step 4: Create /me endpoint**

Create `app/api/auth/me/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export async function GET() {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      ownerName: user.ownerName,
    },
  });
}
```

- [ ] **Step 5: Create login page**

Create `app/login/page.tsx`:
```typescript
export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm space-y-6 text-center">
        <h1 className="text-2xl font-bold">Elion Outreach</h1>
        <p className="text-gray-600">Sign in to manage your outreach campaigns</p>
        <a
          href="/api/auth/login"
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-white font-medium hover:bg-blue-700"
        >
          Sign in with Google
        </a>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create auth-aware root layout**

Create `app/providers.tsx`:
```typescript
"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

interface User {
  id: string;
  email: string;
  name: string;
  ownerName: string | null;
}

const UserContext = createContext<{ user: User | null; loading: boolean }>({
  user: null,
  loading: true,
});

export function useUser() {
  return useContext(UserContext);
}

export function Providers({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => setUser(data.user ?? null))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <UserContext.Provider value={{ user, loading }}>{children}</UserContext.Provider>
  );
}
```

Update `app/layout.tsx`:
```typescript
import type { Metadata } from "next";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Elion Outreach",
  description: "AI-powered outreach campaign management",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased bg-white text-gray-900">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 7: Create root redirect**

Update `app/page.tsx`:
```typescript
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export default async function Home() {
  const user = await getSession();
  if (!user) redirect("/login");
  redirect("/queue");
}
```

- [ ] **Step 8: Verify login flow**

```bash
pnpm dev
```

1. Visit http://localhost:3000 → redirects to /login
2. Click "Sign in with Google" → redirects to Google OAuth
3. Authorize → redirected back to /queue (404 is expected — page not built yet)
4. Check DB: user row created with tokens

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add Google OAuth login with Gmail scopes, session management"
```

---

### Task 4: Navigation + Layout Shell

**Files:**
- Create: `components/Nav.tsx`, `app/queue/page.tsx` (stub), `app/pipeline/page.tsx` (stub)

- [ ] **Step 1: Create Nav component**

Create `components/Nav.tsx`:
```typescript
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser } from "@/app/providers";

const navItems = [
  { href: "/queue", label: "My Queue" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  const pathname = usePathname();
  const { user } = useUser();

  if (!user) return null;

  return (
    <nav className="border-b border-gray-200 bg-white px-6 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/queue" className="text-lg font-bold text-blue-600">
            Elion Outreach
          </Link>
          <div className="flex gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-md px-3 py-2 text-sm font-medium ${
                  pathname.startsWith(item.href)
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="text-sm text-gray-500">{user.name}</div>
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Add Nav to layout**

Update `app/layout.tsx` body to include Nav:
```typescript
import { Nav } from "@/components/Nav";
// ... existing imports

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased bg-gray-50 text-gray-900">
        <Providers>
          <Nav />
          <main className="mx-auto max-w-7xl px-6 py-6">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Create stub pages**

Create `app/queue/page.tsx`:
```typescript
export default function QueuePage() {
  return <div>My Queue — coming soon</div>;
}
```

Create `app/pipeline/page.tsx`:
```typescript
export default function PipelinePage() {
  return <div>Pipeline Overview — coming soon</div>;
}
```

Create `app/settings/page.tsx`:
```typescript
export default function SettingsPage() {
  return <div>Settings — coming soon</div>;
}
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add navigation shell with queue, pipeline, settings stubs"
```

---

### Task 5: Campaign CRUD

**Files:**
- Create: `app/api/campaigns/route.ts`, `app/api/campaigns/[id]/route.ts`, `app/settings/page.tsx`, `app/settings/campaigns/new/page.tsx`, `app/settings/campaigns/[id]/page.tsx`

- [ ] **Step 1: Campaign list + create API**

Create `app/api/campaigns/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { campaigns } from "@/lib/schema";
import { requireUser } from "@/lib/auth";
import { desc, eq } from "drizzle-orm";

export async function GET() {
  try {
    await requireUser();
    const rows = await db.select().from(campaigns).orderBy(desc(campaigns.createdAt));
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireUser();
    const body = await request.json();
    const [row] = await db
      .insert(campaigns)
      .values({
        name: body.name,
        type: body.type,
        campaignGroup: body.campaignGroup || null,
        date: body.date || null,
        location: body.location || null,
        description: body.description,
        sellingPoints: body.sellingPoints,
        isActive: body.isActive ?? true,
        cadenceDays: body.cadenceDays || "[5, 7, 10, 14]",
        maxTouches: body.maxTouches || 4,
      })
      .returning();
    return NextResponse.json(row, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
```

- [ ] **Step 2: Campaign get/update/delete API**

Create `app/api/campaigns/[id]/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { campaigns } from "@/lib/schema";
import { requireUser } from "@/lib/auth";
import { eq } from "drizzle-orm";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const { id } = await params;
    const [row] = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const { id } = await params;
    const body = await request.json();
    const [row] = await db.update(campaigns).set(body).where(eq(campaigns.id, id)).returning();
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
```

- [ ] **Step 3: Campaign settings UI — list page**

Update `app/settings/page.tsx`:
```typescript
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface Campaign {
  id: string;
  name: string;
  type: string;
  campaignGroup: string | null;
  isActive: boolean;
}

export default function SettingsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);

  useEffect(() => {
    fetch("/api/campaigns")
      .then((r) => r.json())
      .then(setCampaigns);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Campaigns</h1>
        <Link
          href="/settings/campaigns/new"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
        >
          New Campaign
        </Link>
      </div>
      <div className="space-y-2">
        {campaigns.map((c) => (
          <Link
            key={c.id}
            href={`/settings/campaigns/${c.id}`}
            className="flex items-center justify-between rounded-lg border p-4 hover:bg-gray-50"
          >
            <div>
              <div className="font-medium">{c.name}</div>
              <div className="text-sm text-gray-500">
                {c.type} {c.campaignGroup && `· ${c.campaignGroup}`}
              </div>
            </div>
            <span
              className={`rounded-full px-2 py-1 text-xs font-medium ${
                c.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"
              }`}
            >
              {c.isActive ? "Active" : "Inactive"}
            </span>
          </Link>
        ))}
      </div>
      <div className="border-t pt-6 space-y-2">
        <Link href="/settings/import" className="block text-sm text-blue-600 hover:underline">
          Import CSV →
        </Link>
        <Link href="/settings/voice-examples" className="block text-sm text-blue-600 hover:underline">
          Voice Examples →
        </Link>
        <Link href="/settings/export" className="block text-sm text-blue-600 hover:underline">
          Export CSV →
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Campaign create/edit form page**

Create `app/settings/campaigns/new/page.tsx`:
```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const campaignTypes = [
  { value: "provider_recruiting", label: "Provider Recruiting" },
  { value: "vendor_recruiting", label: "Vendor Recruiting" },
  { value: "sales", label: "Sales" },
  { value: "content", label: "Content" },
  { value: "conference", label: "Conference" },
  { value: "other", label: "Other" },
];

export default function NewCampaignPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const formData = new FormData(e.currentTarget);
    const body = {
      name: formData.get("name"),
      type: formData.get("type"),
      campaignGroup: formData.get("campaignGroup") || null,
      date: formData.get("date") || null,
      location: formData.get("location") || null,
      description: formData.get("description"),
      sellingPoints: formData.get("sellingPoints"),
    };
    await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    router.push("/settings");
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-bold">New Campaign</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium">Name</label>
          <input name="name" required className="mt-1 w-full rounded-md border px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium">Type</label>
          <select name="type" required className="mt-1 w-full rounded-md border px-3 py-2">
            {campaignTypes.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium">Campaign Group</label>
          <input name="campaignGroup" placeholder="e.g., Summer 2026" className="mt-1 w-full rounded-md border px-3 py-2" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium">Date</label>
            <input name="date" type="date" className="mt-1 w-full rounded-md border px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium">Location</label>
            <input name="location" className="mt-1 w-full rounded-md border px-3 py-2" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium">Description</label>
          <textarea name="description" required rows={3} className="mt-1 w-full rounded-md border px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium">Selling Points</label>
          <textarea name="sellingPoints" required rows={3} className="mt-1 w-full rounded-md border px-3 py-2" />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Creating..." : "Create Campaign"}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add campaign CRUD — API routes + settings UI"
```

---

### Task 6: CSV Import

**Files:**
- Create: `lib/csv-import.ts`, `app/api/contacts/import/route.ts`, `app/settings/import/page.tsx`

- [ ] **Step 1: Create CSV import logic**

Create `lib/csv-import.ts`:
```typescript
import { db } from "./db";
import { contacts, contactCampaignStatus, outreachTouches, statusEnum } from "./schema";
import type { ContactStatus } from "./schema";
import { eq, and } from "drizzle-orm";

interface CsvRow {
  Name: string;
  Organization: string;
  Title?: string;
  Owner: string;
  "Prospect?"?: string;
  POC?: string;
  LinkedIn?: string;
  Notes?: string;
  Status?: string;
  "Last Touch"?: string;
  "Next Touch"?: string;
  "Spring 2025 Attendee"?: string;
  "Winter 2025 Attendee"?: string;
  [key: string]: string | undefined;
}

function mapStatus(raw: string | undefined): ContactStatus {
  if (!raw) return "not_started";
  const lower = raw.toLowerCase().trim();
  if (lower.includes("confirmed")) return "confirmed";
  if (lower.includes("declined") || lower.includes("can't attend")) return "declined";
  if (lower.includes("respond")) return "responded";
  if (lower.includes("hold")) return "on_hold";
  if (lower.includes("not") && lower.includes("fit")) return "not_a_fit";
  if (lower.includes("no response") || lower.includes("dfn")) return "no_response";
  if (lower.includes("progress") || lower.includes("email")) return "in_progress";
  return "not_started";
}

export async function importCsv(rows: CsvRow[], campaignId: string) {
  const results = { created: 0, updated: 0, errors: 0 };

  for (const row of rows) {
    try {
      if (!row.Name || !row.Organization) {
        results.errors++;
        continue;
      }

      // Build notes including attendance
      const notesParts: string[] = [];
      if (row.Notes) notesParts.push(row.Notes);
      const attended: string[] = [];
      if (row["Spring 2025 Attendee"]?.toUpperCase() === "Y") attended.push("Spring 2025");
      if (row["Winter 2025 Attendee"]?.toUpperCase() === "Y") attended.push("Winter 2025");
      if (attended.length > 0) notesParts.push(`Attended: ${attended.join(", ")}`);
      const notes = notesParts.join("\n");

      // Check if contact exists
      const existing = await db
        .select()
        .from(contacts)
        .where(and(eq(contacts.name, row.Name), eq(contacts.organization, row.Organization)))
        .limit(1);

      let contactId: string;

      if (existing.length > 0) {
        contactId = existing[0].id;
        await db
          .update(contacts)
          .set({
            title: row.Title || existing[0].title,
            owner: row.Owner || existing[0].owner,
            linkedinUrl: row.LinkedIn || existing[0].linkedinUrl,
            notes: notes || existing[0].notes,
            isProspect: row["Prospect?"]?.toUpperCase() === "Y",
            isPoc: row.POC?.toUpperCase() === "Y",
          })
          .where(eq(contacts.id, contactId));
        results.updated++;
      } else {
        contactId = crypto.randomUUID();
        await db.insert(contacts).values({
          id: contactId,
          name: row.Name,
          organization: row.Organization,
          title: row.Title || null,
          email: null, // CSV doesn't have email — populated from Attio or manually
          linkedinUrl: row.LinkedIn || null,
          owner: row.Owner || "Unassigned",
          isProspect: row["Prospect?"]?.toUpperCase() === "Y",
          isPoc: row.POC?.toUpperCase() === "Y",
          notes,
        });
        results.created++;
      }

      // Create/update campaign status
      const existingStatus = await db
        .select()
        .from(contactCampaignStatus)
        .where(
          and(
            eq(contactCampaignStatus.contactId, contactId),
            eq(contactCampaignStatus.campaignId, campaignId)
          )
        )
        .limit(1);

      if (existingStatus.length === 0) {
        await db.insert(contactCampaignStatus).values({
          contactId,
          campaignId,
          status: mapStatus(row.Status),
          nextTouchDate: row["Next Touch"] || null,
        });
      }

      // Create synthetic historical touch if Last Touch exists
      if (row["Last Touch"] && existingStatus.length === 0) {
        await db.insert(outreachTouches).values({
          contactId,
          campaignId,
          touchNumber: 1,
          channel: "email",
          state: "sent",
          sentAt: new Date(row["Last Touch"]),
          subject: "[Imported — no subject]",
          body: null,
          createdBy: "import",
        });
      }
    } catch (e) {
      console.error("Import error for row:", row.Name, e);
      results.errors++;
    }
  }

  return results;
}
```

- [ ] **Step 2: Create import API route**

Create `app/api/contacts/import/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { importCsv } from "@/lib/csv-import";

export async function POST(request: NextRequest) {
  try {
    await requireUser();
    const body = await request.json();
    const { rows, campaignId } = body;

    if (!rows || !campaignId) {
      return NextResponse.json({ error: "rows and campaignId required" }, { status: 400 });
    }

    const results = await importCsv(rows, campaignId);
    return NextResponse.json(results);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
```

- [ ] **Step 3: Create import UI page**

Create `app/settings/import/page.tsx`:
```typescript
"use client";

import { useEffect, useState } from "react";
import Papa from "papaparse";

interface Campaign {
  id: string;
  name: string;
}

export default function ImportPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<{ created: number; updated: number; errors: number } | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    fetch("/api/campaigns").then((r) => r.json()).then(setCampaigns);
  }, []);

  async function handleImport() {
    if (!file || !campaignId) return;
    setImporting(true);

    const text = await file.text();
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
    });

    if (parsed.errors.length > 0) {
      console.warn("CSV parse warnings:", parsed.errors);
    }

    const res = await fetch("/api/contacts/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: parsed.data, campaignId }),
    });
    setResult(await res.json());
    setImporting(false);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-bold">Import Contacts</h1>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium">Campaign</label>
          <select
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
            className="mt-1 w-full rounded-md border px-3 py-2"
          >
            <option value="">Select campaign...</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium">CSV File</label>
          <input
            type="file"
            accept=".csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-1"
          />
        </div>
        <button
          onClick={handleImport}
          disabled={!file || !campaignId || importing}
          className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {importing ? "Importing..." : "Import"}
        </button>
        {result && (
          <div className="rounded-md bg-green-50 p-4 text-sm">
            Created: {result.created}, Updated: {result.updated}, Errors: {result.errors}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add CSV import — parses recruitment sheet, creates contacts + campaign status + synthetic touches"
```

---

### Task 7: Gmail Context Service

**Files:**
- Create: `lib/gmail.ts`

- [ ] **Step 1: Create Gmail service**

Create `lib/gmail.ts`:
```typescript
import { db } from "./db";
import { users } from "./schema";
import { getGmailClient } from "./auth";

const MAX_THREADS = 5;
const MAX_MESSAGES_PER_THREAD = 4;
const MAX_CHARS_PER_MESSAGE = 2000;
const MAX_TOTAL_CHARS = 20000;

interface GmailMessage {
  messageId: string; // RFC 2822 Message-ID for dedup
  from: string;
  to: string;
  date: string;
  subject: string;
  body: string;
}

interface GmailThread {
  subject: string;
  messages: GmailMessage[];
}

function extractHeader(headers: Array<{ name: string; value: string }>, name: string): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function decodeBody(payload: any): string {
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf-8");
  }
  if (payload.parts) {
    // Prefer text/plain
    const textPart = payload.parts.find((p: any) => p.mimeType === "text/plain");
    if (textPart?.body?.data) {
      return Buffer.from(textPart.body.data, "base64url").toString("utf-8");
    }
    // Fall back to first part with data
    for (const part of payload.parts) {
      const result = decodeBody(part);
      if (result) return result;
    }
  }
  return "";
}

async function searchUserMailbox(
  userId: string,
  contactEmail: string
): Promise<GmailThread[]> {
  const gmail = await getGmailClient(userId);
  if (!gmail) return [];

  try {
    const query = `from:${contactEmail} OR to:${contactEmail}`;
    const listRes = await gmail.users.threads.list({
      userId: "me",
      q: query,
      maxResults: MAX_THREADS,
    });

    const threads: GmailThread[] = [];

    for (const threadMeta of listRes.data.threads ?? []) {
      const threadRes = await gmail.users.threads.get({
        userId: "me",
        id: threadMeta.id!,
        format: "full",
        metadataHeaders: ["Message-ID", "From", "To", "Subject", "Date"],
      });

      const allMessages = threadRes.data.messages ?? [];

      // Select messages: first + 3 most recent (or all if <= 4)
      let selectedMessages: typeof allMessages;
      if (allMessages.length <= MAX_MESSAGES_PER_THREAD) {
        selectedMessages = allMessages;
      } else {
        selectedMessages = [
          allMessages[0],
          ...allMessages.slice(-3),
        ];
      }

      const messages: GmailMessage[] = selectedMessages.map((msg) => {
        const headers = msg.payload?.headers ?? [];
        let body = decodeBody(msg.payload);
        if (body.length > MAX_CHARS_PER_MESSAGE) {
          body = body.slice(0, MAX_CHARS_PER_MESSAGE) + "...";
        }
        return {
          messageId: extractHeader(headers, "Message-ID"),
          from: extractHeader(headers, "From"),
          to: extractHeader(headers, "To"),
          date: extractHeader(headers, "Date"),
          subject: extractHeader(headers, "Subject"),
          body,
        };
      });

      threads.push({
        subject: messages[0]?.subject ?? "(no subject)",
        messages,
      });
    }

    return threads;
  } catch (e) {
    console.error(`Gmail search failed for user ${userId}:`, e);
    return [];
  }
}

export async function getCorrespondenceHistory(
  contactEmail: string
): Promise<GmailThread[]> {
  // Get all users with tokens
  const allUsers = await db.select().from(users);
  const usersWithTokens = allUsers.filter((u) => u.googleAccessToken);

  // Search all mailboxes in parallel
  const results = await Promise.all(
    usersWithTokens.map((u) => searchUserMailbox(u.id, contactEmail))
  );

  // Flatten and deduplicate by Message-ID
  const allThreads = results.flat();
  const seenMessageIds = new Set<string>();
  const dedupedThreads: GmailThread[] = [];

  for (const thread of allThreads) {
    const dedupedMessages = thread.messages.filter((msg) => {
      if (!msg.messageId || seenMessageIds.has(msg.messageId)) return false;
      seenMessageIds.add(msg.messageId);
      return true;
    });
    if (dedupedMessages.length > 0) {
      dedupedThreads.push({ ...thread, messages: dedupedMessages });
    }
  }

  // Sort threads by most recent message date (newest first)
  dedupedThreads.sort((a, b) => {
    const dateA = new Date(a.messages[a.messages.length - 1]?.date ?? 0);
    const dateB = new Date(b.messages[b.messages.length - 1]?.date ?? 0);
    return dateB.getTime() - dateA.getTime();
  });

  // Enforce total character budget
  let totalChars = 0;
  const budgetedThreads: GmailThread[] = [];
  for (const thread of dedupedThreads.slice(0, MAX_THREADS)) {
    const threadChars = thread.messages.reduce((sum, m) => sum + m.body.length, 0);
    if (totalChars + threadChars > MAX_TOTAL_CHARS) break;
    totalChars += threadChars;
    budgetedThreads.push(thread);
  }

  return budgetedThreads;
}

export async function createGmailDraft(
  userId: string,
  to: string,
  subject: string,
  body: string
): Promise<string | null> {
  const gmail = await getGmailClient(userId);
  if (!gmail) return null;

  const raw = Buffer.from(
    `To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`
  ).toString("base64url");

  const res = await gmail.users.drafts.create({
    userId: "me",
    requestBody: { message: { raw } },
  });

  return res.data.id ?? null;
}
```

- [ ] **Step 2: Create context API route**

Create `app/api/context/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { contacts, contactCampaignStatus, campaigns, outreachTouches } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { getCorrespondenceHistory } from "@/lib/gmail";

export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const contactId = request.nextUrl.searchParams.get("contactId");
    const campaignId = request.nextUrl.searchParams.get("campaignId");

    if (!contactId || !campaignId) {
      return NextResponse.json({ error: "contactId and campaignId required" }, { status: 400 });
    }

    // Get contact
    const [contact] = await db
      .select()
      .from(contacts)
      .where(eq(contacts.id, contactId))
      .limit(1);
    if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

    // Get campaign
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);
    if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

    // Get campaign status
    const [status] = await db
      .select()
      .from(contactCampaignStatus)
      .where(
        and(
          eq(contactCampaignStatus.contactId, contactId),
          eq(contactCampaignStatus.campaignId, campaignId)
        )
      )
      .limit(1);

    // Get outreach touches for this campaign
    const touches = await db
      .select()
      .from(outreachTouches)
      .where(
        and(
          eq(outreachTouches.contactId, contactId),
          eq(outreachTouches.campaignId, campaignId)
        )
      )
      .orderBy(outreachTouches.createdAt);

    // Get Gmail correspondence (only if contact has email)
    let gmailThreads: Awaited<ReturnType<typeof getCorrespondenceHistory>> = [];
    if (contact.email) {
      gmailThreads = await getCorrespondenceHistory(contact.email);
    }

    return NextResponse.json({
      contact,
      campaign,
      status,
      touches,
      gmailThreads,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add Gmail context service — cross-user search, Message-ID dedup, context limits"
```

---

### Task 8: Claude Drafting Service

**Files:**
- Create: `lib/claude.ts`, `app/api/draft/route.ts`

- [ ] **Step 1: Create Claude drafting service**

Create `lib/claude.ts`:
```typescript
import Anthropic from "@anthropic-ai/sdk";
import type { GmailThread } from "@/lib/gmail";

const client = new Anthropic();

interface DraftInput {
  contact: {
    name: string;
    organization: string;
    title: string | null;
    notes: string;
  };
  campaign: {
    name: string;
    type: string;
    date: string | null;
    location: string | null;
    description: string;
    sellingPoints: string;
  };
  gmailThreads: GmailThread[];
  touches: Array<{
    touchNumber: number | null;
    channel: string;
    state: string;
    sentAt: Date | null;
    subject: string | null;
    body: string | null;
  }>;
  voiceExamples: Array<{
    subject: string | null;
    body: string;
    archetype: string | null;
    notes: string | null;
  }>;
  channel: "email" | "linkedin";
  steering?: string;
}

function formatGmailContext(threads: GmailThread[]): string {
  if (threads.length === 0) return "No prior email correspondence found.";

  return threads
    .map((thread) => {
      const msgs = thread.messages
        .map((m) => `From: ${m.from}\nDate: ${m.date}\n\n${m.body}`)
        .join("\n---\n");
      return `=== Thread: ${thread.subject} ===\n${msgs}`;
    })
    .join("\n\n");
}

function formatTouchHistory(
  touches: DraftInput["touches"],
  channel: "email" | "linkedin"
): string {
  const sentTouches = touches.filter((t) => t.state === "sent");
  if (sentTouches.length === 0) return "No prior outreach in this campaign.";

  return sentTouches
    .map((t) => {
      let line = `Touch #${t.touchNumber} (${t.channel}) — ${t.sentAt ? new Date(t.sentAt).toLocaleDateString() : "unknown date"}`;
      if (t.subject) line += ` — Subject: "${t.subject}"`;
      // Include body only for LinkedIn touches (no Gmail record for those)
      if (t.channel === "linkedin" && t.body) {
        line += `\nMessage: ${t.body}`;
      }
      return line;
    })
    .join("\n");
}

function formatVoiceExamples(examples: DraftInput["voiceExamples"]): string {
  if (examples.length === 0) return "";

  return examples
    .map((ex, i) => {
      let block = `--- Example ${i + 1}${ex.archetype ? ` (${ex.archetype})` : ""} ---`;
      if (ex.subject) block += `\nSubject: ${ex.subject}`;
      block += `\n${ex.body}`;
      if (ex.notes) block += `\n[Note: ${ex.notes}]`;
      return block;
    })
    .join("\n\n");
}

export async function generateDraft(input: DraftInput): Promise<{
  subject: string | null;
  body: string;
}> {
  const systemPrompt = `You are a skilled outreach writer for the Elion team. You draft personalized ${input.channel === "email" ? "emails" : "LinkedIn messages"} for outreach campaigns.

Campaign: ${input.campaign.name}
Type: ${input.campaign.type}
${input.campaign.date ? `Date: ${input.campaign.date}` : ""}
${input.campaign.location ? `Location: ${input.campaign.location}` : ""}

Campaign Description:
${input.campaign.description}

Selling Points:
${input.campaign.sellingPoints}`;

  const voiceSection = input.voiceExamples.length > 0
    ? `\n\n## Voice Examples (match this style)\n\n${formatVoiceExamples(input.voiceExamples)}`
    : "";

  const userPrompt = `## Contact Profile
Name: ${input.contact.name}
Organization: ${input.contact.organization}
${input.contact.title ? `Title: ${input.contact.title}` : ""}
${input.contact.notes ? `\nNotes:\n${input.contact.notes}` : ""}
${voiceSection}

## Correspondence History
${formatGmailContext(input.gmailThreads)}

## Outreach History This Campaign
${formatTouchHistory(input.touches, input.channel)}

## Instructions
Based on the correspondence history and context above, determine the appropriate tone and approach for this outreach.

${input.channel === "email"
  ? 'Draft a personalized email with subject line. Plain text only. Be creative. Match the voice of the examples. Account for the full relationship context.\n\nRespond in this exact format:\nSUBJECT: <subject line>\nBODY:\n<email body>'
  : 'Draft a LinkedIn message. Keep it concise (2-4 short paragraphs, under 300 words). No subject line. More conversational and direct than email. Match the voice of the examples.\n\nRespond with just the message body, no prefix.'}${input.steering ? `\n\nAdditional guidance: ${input.steering}` : ""}`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";

  if (input.channel === "email") {
    const subjectMatch = text.match(/^SUBJECT:\s*(.+)/m);
    const bodyMatch = text.match(/BODY:\n([\s\S]*)/);
    return {
      subject: subjectMatch?.[1]?.trim() ?? "Follow-up",
      body: bodyMatch?.[1]?.trim() ?? text,
    };
  }

  return { subject: null, body: text.trim() };
}
```

- [ ] **Step 2: Create draft API route**

Create `app/api/draft/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  contacts,
  campaigns,
  outreachTouches,
  voiceExamples,
} from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { getCorrespondenceHistory } from "@/lib/gmail";
import { generateDraft } from "@/lib/claude";

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const { contactId, campaignId, channel, steering } = body;

    // Load contact
    const [contact] = await db
      .select()
      .from(contacts)
      .where(eq(contacts.id, contactId))
      .limit(1);
    if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

    // Load campaign
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);
    if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

    // Load touches
    const touches = await db
      .select()
      .from(outreachTouches)
      .where(
        and(
          eq(outreachTouches.contactId, contactId),
          eq(outreachTouches.campaignId, campaignId)
        )
      )
      .orderBy(outreachTouches.createdAt);

    // Load voice examples for this user + channel
    const examples = await db
      .select()
      .from(voiceExamples)
      .where(
        and(eq(voiceExamples.userId, user.id), eq(voiceExamples.channel, channel))
      );

    // Get Gmail threads
    let gmailThreads: Awaited<ReturnType<typeof getCorrespondenceHistory>> = [];
    if (contact.email) {
      gmailThreads = await getCorrespondenceHistory(contact.email);
    }

    const draft = await generateDraft({
      contact,
      campaign,
      gmailThreads,
      touches,
      voiceExamples: examples,
      channel,
      steering,
    });

    return NextResponse.json(draft);
  } catch (e) {
    console.error("Draft generation error:", e);
    return NextResponse.json({ error: "Failed to generate draft" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add Claude drafting service — prompt assembly with Gmail context, voice examples, channel-aware output"
```

---

### Task 9: Cadence Logic

**Files:**
- Create: `lib/cadence.ts`

- [ ] **Step 1: Create cadence helper**

Create `lib/cadence.ts`:
```typescript
export function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const dayOfWeek = result.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      added++;
    }
  }
  return result;
}

export function getNextTouchDate(
  touchNumber: number,
  cadenceDaysJson: string
): string {
  const cadence: number[] = JSON.parse(cadenceDaysJson);
  const index = Math.min(touchNumber - 1, cadence.length - 1);
  const daysToAdd = cadence[index];
  const nextDate = addBusinessDays(new Date(), daysToAdd);
  return nextDate.toISOString().split("T")[0];
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/cadence.ts
git commit -m "feat: add business day cadence calculation"
```

---

### Task 10: Touch Actions API

**Files:**
- Create: `app/api/touches/route.ts`, `app/api/touches/[id]/route.ts`, `app/api/gmail/create-draft/route.ts`

- [ ] **Step 1: Create touch create/skip route**

Create `app/api/touches/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  outreachTouches,
  contactCampaignStatus,
} from "@/lib/schema";
import { eq, and, sql } from "drizzle-orm";
import { addBusinessDays } from "@/lib/cadence";

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const { contactId, campaignId, channel, state, subject, messageBody, skipReason } = body;

    if (state === "drafted") {
      // Atomic: count sent touches, delete existing draft, insert new one — all in one transaction
      const touch = await db.transaction(async (tx) => {
        const [countResult] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(outreachTouches)
          .where(
            and(
              eq(outreachTouches.contactId, contactId),
              eq(outreachTouches.campaignId, campaignId),
              eq(outreachTouches.state, "sent")
            )
          );
        const touchNumber = (countResult?.count ?? 0) + 1;

        // Delete existing draft (if any) within the transaction
        await tx
          .delete(outreachTouches)
          .where(
            and(
              eq(outreachTouches.contactId, contactId),
              eq(outreachTouches.campaignId, campaignId),
              eq(outreachTouches.state, "drafted")
            )
          );

        const [newTouch] = await tx
          .insert(outreachTouches)
          .values({
            contactId,
          campaignId,
          touchNumber,
          channel,
          state: "drafted",
          draftCreatedAt: new Date(),
          subject: subject || null,
          body: messageBody || null,
          createdBy: user.id,
        })
        .returning();

        // Update status to in_progress if not_started
        await tx
          .update(contactCampaignStatus)
          .set({ status: "in_progress" })
          .where(
            and(
              eq(contactCampaignStatus.contactId, contactId),
              eq(contactCampaignStatus.campaignId, campaignId),
              eq(contactCampaignStatus.status, "not_started")
            )
          );

        return newTouch;
      });

      return NextResponse.json(touch, { status: 201 });
    }

    if (state === "skipped") {
      // Push nextTouchDate forward by 2 business days
      const nextDate = addBusinessDays(new Date(), 2).toISOString().split("T")[0];

      const [touch] = await db
        .insert(outreachTouches)
        .values({
          contactId,
          campaignId,
          touchNumber: null,
          channel,
          state: "skipped",
          skipReason: skipReason || null,
          createdBy: user.id,
        })
        .returning();

      await db
        .update(contactCampaignStatus)
        .set({ nextTouchDate: nextDate })
        .where(
          and(
            eq(contactCampaignStatus.contactId, contactId),
            eq(contactCampaignStatus.campaignId, campaignId)
          )
        );

      return NextResponse.json(touch, { status: 201 });
    }

    return NextResponse.json({ error: "Invalid state" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
```

- [ ] **Step 2: Create mark-sent route**

Create `app/api/touches/[id]/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  outreachTouches,
  contactCampaignStatus,
  campaigns,
} from "@/lib/schema";
import { eq, and, sql } from "drizzle-orm";
import { getNextTouchDate } from "@/lib/cadence";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser();
    const { id } = await params;
    const body = await request.json();

    if (body.state === "sent") {
      // Get the touch
      const [touch] = await db
        .select()
        .from(outreachTouches)
        .where(eq(outreachTouches.id, id))
        .limit(1);
      if (!touch) return NextResponse.json({ error: "Not found" }, { status: 404 });

      // Validate state transition: only drafted → sent is allowed
      if (touch.state !== "drafted") {
        return NextResponse.json(
          { error: `Cannot mark as sent: touch is currently "${touch.state}", expected "drafted"` },
          { status: 409 }
        );
      }

      // Mark as sent
      await db
        .update(outreachTouches)
        .set({ state: "sent", sentAt: new Date() })
        .where(eq(outreachTouches.id, id));

      // Get campaign for cadence settings
      const [campaign] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, touch.campaignId))
        .limit(1);

      // Count total sent touches to determine cadence
      const [countResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(outreachTouches)
        .where(
          and(
            eq(outreachTouches.contactId, touch.contactId),
            eq(outreachTouches.campaignId, touch.campaignId),
            eq(outreachTouches.state, "sent")
          )
        );
      const sentCount = countResult?.count ?? 1;

      // Check max touches
      if (campaign && sentCount >= campaign.maxTouches) {
        await db
          .update(contactCampaignStatus)
          .set({ status: "no_response", nextTouchDate: null })
          .where(
            and(
              eq(contactCampaignStatus.contactId, touch.contactId),
              eq(contactCampaignStatus.campaignId, touch.campaignId)
            )
          );
      } else if (campaign) {
        // Calculate next touch date (allow override)
        const nextDate = body.nextTouchDate || getNextTouchDate(sentCount, campaign.cadenceDays);
        await db
          .update(contactCampaignStatus)
          .set({ nextTouchDate: nextDate })
          .where(
            and(
              eq(contactCampaignStatus.contactId, touch.contactId),
              eq(contactCampaignStatus.campaignId, touch.campaignId)
            )
          );
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid update" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
```

- [ ] **Step 3: Create Gmail draft creation route**

Create `app/api/gmail/create-draft/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createGmailDraft } from "@/lib/gmail";

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const { to, subject, body } = await request.json();

    const draftId = await createGmailDraft(user.id, to, subject, body);

    if (!draftId) {
      return NextResponse.json({ error: "Failed to create Gmail draft" }, { status: 500 });
    }

    return NextResponse.json({ draftId });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add touch actions — create draft, mark sent with cadence, skip, Gmail draft creation"
```

---

### Task 11: Queue API + View

**Files:**
- Create: `app/api/queue/route.ts`, update `app/queue/page.tsx`, create `components/QueueCard.tsx`

- [ ] **Step 1: Create queue API**

Create `app/api/queue/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  contacts,
  contactCampaignStatus,
  campaigns,
  outreachTouches,
} from "@/lib/schema";
import { eq, and, lte, sql, or } from "drizzle-orm";

export async function GET() {
  try {
    const user = await requireUser();
    if (!user.ownerName) {
      return NextResponse.json({ campaigns: [] });
    }

    const today = new Date().toISOString().split("T")[0];
    const weekFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    // Get active campaigns
    const activeCampaigns = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.isActive, true));

    const result = [];

    for (const campaign of activeCampaigns) {
      // Get all contacts for this user in this campaign
      const rows = await db
        .select({
          contact: contacts,
          status: contactCampaignStatus,
        })
        .from(contactCampaignStatus)
        .innerJoin(contacts, eq(contacts.id, contactCampaignStatus.contactId))
        .where(
          and(
            eq(contactCampaignStatus.campaignId, campaign.id),
            eq(contacts.owner, user.ownerName),
            eq(contactCampaignStatus.doNotContact, false),
            or(contacts.email.isNotNull(), contacts.linkedinUrl.isNotNull())
          )
        );

      // Get draft touches for these contacts
      const contactIds = rows.map((r) => r.contact.id);
      const drafts = contactIds.length > 0
        ? await db
            .select()
            .from(outreachTouches)
            .where(
              and(
                eq(outreachTouches.campaignId, campaign.id),
                eq(outreachTouches.state, "drafted"),
                sql`${outreachTouches.contactId} = ANY(${contactIds})`
              )
            )
        : [];

      const draftContactIds = new Set(drafts.map((d) => d.contactId));

      // Get sent touch counts
      const touchCounts = contactIds.length > 0
        ? await db
            .select({
              contactId: outreachTouches.contactId,
              count: sql<number>`count(*)::int`,
              lastChannel: sql<string>`(array_agg(${outreachTouches.channel} ORDER BY ${outreachTouches.sentAt} DESC))[1]`,
            })
            .from(outreachTouches)
            .where(
              and(
                eq(outreachTouches.campaignId, campaign.id),
                eq(outreachTouches.state, "sent"),
                sql`${outreachTouches.contactId} = ANY(${contactIds})`
              )
            )
            .groupBy(outreachTouches.contactId)
        : [];

      const touchCountMap = new Map(touchCounts.map((t) => [t.contactId, t]));

      // Categorize
      const needsMarkSent: typeof rows = [];
      const dueToday: typeof rows = [];
      const upcoming: typeof rows = [];

      for (const row of rows) {
        const { contact, status } = row;
        const hasDraft = draftContactIds.has(contact.id);

        if (hasDraft) {
          needsMarkSent.push(row);
        } else if (
          status.nextTouchDate &&
          status.nextTouchDate <= today &&
          (status.status === "not_started" || status.status === "in_progress")
        ) {
          dueToday.push(row);
        } else if (
          status.nextTouchDate &&
          status.nextTouchDate > today &&
          status.nextTouchDate <= weekFromNow &&
          (status.status === "not_started" || status.status === "in_progress")
        ) {
          upcoming.push(row);
        }
      }

      if (needsMarkSent.length + dueToday.length + upcoming.length > 0) {
        result.push({
          campaign,
          needsMarkSent: needsMarkSent.map((r) => ({
            ...r,
            touchInfo: touchCountMap.get(r.contact.id),
            draft: drafts.find((d) => d.contactId === r.contact.id),
          })),
          dueToday: dueToday.map((r) => ({
            ...r,
            touchInfo: touchCountMap.get(r.contact.id),
          })),
          upcoming: upcoming.map((r) => ({
            ...r,
            touchInfo: touchCountMap.get(r.contact.id),
          })),
        });
      }
    }

    return NextResponse.json({ campaigns: result });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
```

- [ ] **Step 2: Create QueueCard component**

Create `components/QueueCard.tsx`:
```typescript
"use client";

import Link from "next/link";

interface QueueCardProps {
  contact: {
    id: string;
    name: string;
    organization: string;
    title: string | null;
  };
  campaignId: string;
  status: string;
  touchCount: number;
  lastChannel: string | null;
  section: "needsMarkSent" | "dueToday" | "upcoming";
  draftId?: string;
  onMarkSent?: (touchId: string) => void;
}

export function QueueCard({
  contact,
  campaignId,
  status,
  touchCount,
  lastChannel,
  section,
  draftId,
  onMarkSent,
}: QueueCardProps) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4">
      <Link
        href={`/contacts/${contact.id}/${campaignId}`}
        className="flex-1"
      >
        <div className="font-medium text-gray-900">{contact.name}</div>
        <div className="text-sm text-gray-500">
          {contact.organization}
          {contact.title && ` · ${contact.title}`}
        </div>
        <div className="mt-1 flex gap-3 text-xs text-gray-400">
          <span>{touchCount} touch{touchCount !== 1 ? "es" : ""}</span>
          {lastChannel && <span>Last: {lastChannel}</span>}
          <span className="capitalize">{status.replace("_", " ")}</span>
        </div>
      </Link>
      {section === "needsMarkSent" && draftId && onMarkSent && (
        <button
          onClick={(e) => {
            e.preventDefault();
            onMarkSent(draftId);
          }}
          className="rounded-md bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700"
        >
          Mark Sent
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Build Queue page**

Replace `app/queue/page.tsx`:
```typescript
"use client";

import { useEffect, useState } from "react";
import { QueueCard } from "@/components/QueueCard";

interface QueueData {
  campaigns: Array<{
    campaign: { id: string; name: string };
    needsMarkSent: Array<any>;
    dueToday: Array<any>;
    upcoming: Array<any>;
  }>;
}

export default function QueuePage() {
  const [data, setData] = useState<QueueData | null>(null);
  const [loading, setLoading] = useState(true);

  function loadQueue() {
    fetch("/api/queue")
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadQueue(); }, []);

  async function handleMarkSent(touchId: string) {
    await fetch(`/api/touches/${touchId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: "sent" }),
    });
    loadQueue();
  }

  if (loading) return <div className="text-gray-500">Loading queue...</div>;
  if (!data?.campaigns.length) {
    return <div className="text-gray-500">No items in your queue. Check Pipeline to add contacts.</div>;
  }

  const totalMarkSent = data.campaigns.reduce((s, c) => s + c.needsMarkSent.length, 0);
  const totalDue = data.campaigns.reduce((s, c) => s + c.dueToday.length, 0);
  const totalUpcoming = data.campaigns.reduce((s, c) => s + c.upcoming.length, 0);

  return (
    <div className="space-y-8">
      <div className="flex gap-4 text-sm">
        {totalMarkSent > 0 && (
          <span className="rounded-full bg-yellow-100 px-3 py-1 text-yellow-800">
            {totalMarkSent} awaiting send confirmation
          </span>
        )}
        <span className="rounded-full bg-blue-100 px-3 py-1 text-blue-800">
          {totalDue} due today
        </span>
        <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-600">
          {totalUpcoming} upcoming
        </span>
      </div>

      {data.campaigns.map(({ campaign, needsMarkSent, dueToday, upcoming }) => (
        <div key={campaign.id} className="space-y-4">
          <h2 className="text-lg font-semibold">{campaign.name}</h2>

          {needsMarkSent.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-yellow-700">Needs "Mark Sent"</h3>
              {needsMarkSent.map((item: any) => (
                <QueueCard
                  key={item.contact.id}
                  contact={item.contact}
                  campaignId={campaign.id}
                  status={item.status.status}
                  touchCount={item.touchInfo?.count ?? 0}
                  lastChannel={item.touchInfo?.lastChannel}
                  section="needsMarkSent"
                  draftId={item.draft?.id}
                  onMarkSent={handleMarkSent}
                />
              ))}
            </div>
          )}

          {dueToday.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-blue-700">Due Today / Overdue</h3>
              {dueToday.map((item: any) => (
                <QueueCard
                  key={item.contact.id}
                  contact={item.contact}
                  campaignId={campaign.id}
                  status={item.status.status}
                  touchCount={item.touchInfo?.count ?? 0}
                  lastChannel={item.touchInfo?.lastChannel}
                  section="dueToday"
                />
              ))}
            </div>
          )}

          {upcoming.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-gray-500">Upcoming This Week</h3>
              {upcoming.map((item: any) => (
                <QueueCard
                  key={item.contact.id}
                  contact={item.contact}
                  campaignId={campaign.id}
                  status={item.status.status}
                  touchCount={item.touchInfo?.count ?? 0}
                  lastChannel={item.touchInfo?.lastChannel}
                  section="upcoming"
                />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add My Queue view — grouped by campaign, 3 sections, mark sent from card"
```

---

### Task 12: Contact Detail / Drafting View

**Files:**
- Create: `app/contacts/[contactId]/[campaignId]/page.tsx`, `components/ContactDetail.tsx`, `components/DraftPanel.tsx`

- [ ] **Step 1: Create Contact Detail component (left panel)**

Create `components/ContactDetail.tsx`:
```typescript
"use client";

interface ContactDetailProps {
  contact: {
    name: string;
    organization: string;
    title: string | null;
    email: string | null;
    linkedinUrl: string | null;
    notes: string;
  };
  touches: Array<{
    touchNumber: number | null;
    channel: string;
    state: string;
    sentAt: string | null;
    subject: string | null;
    createdAt: string;
  }>;
  gmailThreads: Array<{
    subject: string;
    messages: Array<{
      from: string;
      date: string;
      body: string;
    }>;
  }>;
  onUpdateNotes: (notes: string) => void;
}

export function ContactDetail({
  contact,
  touches,
  gmailThreads,
  onUpdateNotes,
}: ContactDetailProps) {
  return (
    <div className="space-y-6 overflow-y-auto pr-4" style={{ maxHeight: "calc(100vh - 120px)" }}>
      {/* Contact metadata */}
      <div>
        <h2 className="text-xl font-bold">{contact.name}</h2>
        <p className="text-gray-600">{contact.organization}</p>
        {contact.title && <p className="text-sm text-gray-500">{contact.title}</p>}
        <div className="mt-2 flex gap-3 text-sm">
          {contact.email && <span className="text-blue-600">{contact.email}</span>}
          {contact.linkedinUrl && (
            <a href={contact.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
              LinkedIn →
            </a>
          )}
        </div>
      </div>

      {/* Notes */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700">Notes</h3>
        <textarea
          defaultValue={contact.notes}
          onBlur={(e) => onUpdateNotes(e.target.value)}
          rows={4}
          className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
          placeholder="Add context about this contact..."
        />
      </div>

      {/* Gmail threads */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700">
          Email History ({gmailThreads.length} thread{gmailThreads.length !== 1 ? "s" : ""})
        </h3>
        {!contact.email && (
          <p className="mt-2 text-sm text-amber-600">
            No email correspondence available — add an email address to view history.
          </p>
        )}
        {gmailThreads.length === 0 && contact.email && (
          <p className="mt-2 text-sm text-gray-400">No email threads found.</p>
        )}
        <div className="mt-2 space-y-3">
          {gmailThreads.map((thread, i) => (
            <details key={i} className="rounded-md border bg-gray-50">
              <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
                {thread.subject} ({thread.messages.length} messages)
              </summary>
              <div className="space-y-2 px-3 pb-3">
                {thread.messages.map((msg, j) => (
                  <div key={j} className="rounded border bg-white p-2 text-xs">
                    <div className="text-gray-500">
                      {msg.from} · {msg.date}
                    </div>
                    <pre className="mt-1 whitespace-pre-wrap font-sans">{msg.body}</pre>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      </div>

      {/* Outreach history */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700">Outreach This Campaign</h3>
        {touches.length === 0 && (
          <p className="mt-2 text-sm text-gray-400">No touches yet.</p>
        )}
        <div className="mt-2 space-y-1">
          {touches.map((t, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span
                className={`rounded px-1.5 py-0.5 font-medium ${
                  t.state === "sent"
                    ? "bg-green-100 text-green-700"
                    : t.state === "drafted"
                      ? "bg-yellow-100 text-yellow-700"
                      : "bg-gray-100 text-gray-500"
                }`}
              >
                {t.state}
              </span>
              {t.touchNumber && <span>#{t.touchNumber}</span>}
              <span className="text-gray-400">{t.channel}</span>
              {t.subject && <span className="truncate text-gray-600">{t.subject}</span>}
              <span className="text-gray-400">
                {t.sentAt
                  ? new Date(t.sentAt).toLocaleDateString()
                  : new Date(t.createdAt).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create Draft Panel component (right panel)**

Create `components/DraftPanel.tsx`:
```typescript
"use client";

import { useState } from "react";

interface DraftPanelProps {
  contactId: string;
  campaignId: string;
  contactEmail: string | null;
  contactLinkedinUrl: string | null;
  hasDraft: boolean;
  onDraftCreated: () => void;
  onMarkSent: (touchId: string) => void;
  onSkip: () => void;
  existingDraftTouchId?: string;
}

export function DraftPanel({
  contactId,
  campaignId,
  contactEmail,
  contactLinkedinUrl,
  hasDraft,
  onDraftCreated,
  onMarkSent,
  onSkip,
  existingDraftTouchId,
}: DraftPanelProps) {
  const hasEmail = !!contactEmail;
  const hasLinkedin = !!contactLinkedinUrl;
  const canDraft = hasEmail || hasLinkedin;

  const defaultChannel = hasEmail ? "email" : "linkedin";
  const [channel, setChannel] = useState<"email" | "linkedin">(defaultChannel);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [steering, setSteering] = useState("");
  const [generating, setGenerating] = useState(false);
  const [skipReason, setSkipReason] = useState("");
  const [showSkipInput, setShowSkipInput] = useState(false);

  async function generateDraft() {
    setGenerating(true);
    const res = await fetch("/api/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId, campaignId, channel, steering: steering || undefined }),
    });
    const data = await res.json();
    setSubject(data.subject || "");
    setBody(data.body || "");
    setSteering("");
    setGenerating(false);
  }

  async function handleCreateGmailDraft() {
    if (!contactEmail) return;

    // Create Gmail draft
    await fetch("/api/gmail/create-draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: contactEmail, subject, body }),
    });

    // Record touch
    await fetch("/api/touches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contactId,
        campaignId,
        channel: "email",
        state: "drafted",
        subject,
        messageBody: body,
      }),
    });

    onDraftCreated();
  }

  async function handleCopyLinkedIn() {
    await navigator.clipboard.writeText(body);

    // Open LinkedIn profile
    if (contactLinkedinUrl) {
      window.open(contactLinkedinUrl, "_blank");
    }

    // Record touch
    await fetch("/api/touches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contactId,
        campaignId,
        channel: "linkedin",
        state: "drafted",
        subject: null,
        messageBody: body,
      }),
    });

    onDraftCreated();
  }

  async function handleSkip() {
    await fetch("/api/touches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contactId,
        campaignId,
        channel,
        state: "skipped",
        skipReason: skipReason || undefined,
      }),
    });
    onSkip();
  }

  async function handleSaveAsVoiceExample() {
    const archetype = prompt("Archetype label (optional, e.g., 'cold outreach', 'follow-up'):");
    await fetch("/api/voice-examples", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel,
        archetype: archetype || null,
        subject: channel === "email" ? subject : null,
        body,
        notes: "(AI-generated draft — review before relying on as style reference)",
      }),
    });
    alert("Saved as voice example!");
  }

  if (!canDraft) {
    return (
      <div className="flex h-full items-center justify-center text-gray-400">
        Add email or LinkedIn URL to enable drafting.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col space-y-4">
      {/* Channel toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setChannel("email")}
          disabled={!hasEmail}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            channel === "email"
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          } disabled:opacity-30`}
        >
          Email
        </button>
        <button
          onClick={() => setChannel("linkedin")}
          disabled={!hasLinkedin}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            channel === "linkedin"
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          } disabled:opacity-30`}
        >
          LinkedIn
        </button>
      </div>

      {/* Generate / Regenerate */}
      <div className="flex gap-2">
        <button
          onClick={generateDraft}
          disabled={generating}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {generating ? "Generating..." : body ? "Regenerate" : "Generate Draft"}
        </button>
        {body && (
          <input
            value={steering}
            onChange={(e) => setSteering(e.target.value)}
            placeholder="Steering (e.g., 'make it warmer')"
            className="flex-1 rounded-md border px-3 py-2 text-sm"
          />
        )}
      </div>

      {/* Subject (email only) */}
      {channel === "email" && body && (
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject"
          className="rounded-md border px-3 py-2 text-sm font-medium"
        />
      )}

      {/* Body */}
      {body && (
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="flex-1 rounded-md border px-3 py-2 text-sm font-mono"
          style={{ minHeight: "200px" }}
        />
      )}

      {/* Actions */}
      {body && (
        <div className="flex flex-wrap gap-2">
          {channel === "email" && contactEmail && (
            <button
              onClick={handleCreateGmailDraft}
              className="rounded-md bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700"
            >
              Create Gmail Draft
            </button>
          )}
          {channel === "linkedin" && (
            <button
              onClick={handleCopyLinkedIn}
              className="rounded-md bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700"
            >
              Copy to Clipboard
            </button>
          )}

          {hasDraft && existingDraftTouchId && (
            <button
              onClick={() => onMarkSent(existingDraftTouchId)}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
            >
              Mark Sent
            </button>
          )}

          <button
            onClick={handleSaveAsVoiceExample}
            className="rounded-md border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            Save as Voice Example
          </button>

          {!hasDraft && (
            <>
              {!showSkipInput ? (
                <button
                  onClick={() => setShowSkipInput(true)}
                  className="rounded-md border px-4 py-2 text-sm text-gray-400 hover:bg-gray-50"
                >
                  Skip
                </button>
              ) : (
                <div className="flex gap-2">
                  <input
                    value={skipReason}
                    onChange={(e) => setSkipReason(e.target.value)}
                    placeholder="Reason (optional)"
                    className="rounded-md border px-3 py-2 text-sm"
                  />
                  <button
                    onClick={handleSkip}
                    className="rounded-md bg-gray-600 px-3 py-2 text-sm text-white"
                  >
                    Confirm Skip
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create Contact Detail page**

Create `app/contacts/[contactId]/[campaignId]/page.tsx`:
```typescript
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ContactDetail } from "@/components/ContactDetail";
import { DraftPanel } from "@/components/DraftPanel";

export default function ContactDraftingPage() {
  const params = useParams();
  const router = useRouter();
  const contactId = params.contactId as string;
  const campaignId = params.campaignId as string;
  const [context, setContext] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  function loadContext() {
    fetch(`/api/context?contactId=${contactId}&campaignId=${campaignId}`)
      .then((r) => r.json())
      .then(setContext)
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadContext(); }, [contactId, campaignId]);

  async function handleUpdateNotes(notes: string) {
    await fetch(`/api/contacts/${contactId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    });
  }

  async function handleMarkSent(touchId: string) {
    await fetch(`/api/touches/${touchId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: "sent" }),
    });
    router.push("/queue");
  }

  function handleDraftCreated() {
    loadContext(); // Refresh to show draft in outreach history
  }

  function handleSkip() {
    router.push("/queue");
  }

  if (loading) return <div className="text-gray-500">Loading context...</div>;
  if (!context) return <div className="text-red-500">Failed to load context.</div>;

  const draftTouch = context.touches.find((t: any) => t.state === "drafted");

  return (
    <div className="grid grid-cols-2 gap-6" style={{ height: "calc(100vh - 120px)" }}>
      <ContactDetail
        contact={context.contact}
        touches={context.touches}
        gmailThreads={context.gmailThreads}
        onUpdateNotes={handleUpdateNotes}
      />
      <DraftPanel
        contactId={contactId}
        campaignId={campaignId}
        contactEmail={context.contact.email}
        contactLinkedinUrl={context.contact.linkedinUrl}
        hasDraft={!!draftTouch}
        existingDraftTouchId={draftTouch?.id}
        onDraftCreated={handleDraftCreated}
        onMarkSent={handleMarkSent}
        onSkip={handleSkip}
      />
    </div>
  );
}
```

- [ ] **Step 4: Create contact PATCH route**

Create `app/api/contacts/[id]/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { contacts } from "@/lib/schema";
import { eq } from "drizzle-orm";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser();
    const { id } = await params;
    const body = await request.json();
    const [row] = await db.update(contacts).set(body).where(eq(contacts.id, id)).returning();
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Contact Detail / Drafting view — split panel with context, Claude drafting, Gmail/LinkedIn actions"
```

---

### Task 13: Pipeline Overview

**Files:**
- Create: `app/api/contacts/route.ts`, `app/api/campaign-status/[id]/route.ts`, `components/EditStatusModal.tsx`, update `app/pipeline/page.tsx`

- [ ] **Step 1: Create contacts list API with campaign context**

Create `app/api/contacts/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { contacts, contactCampaignStatus, campaigns, outreachTouches } from "@/lib/schema";
import { eq, and, sql } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const campaignId = request.nextUrl.searchParams.get("campaignId");
    const campaignGroup = request.nextUrl.searchParams.get("campaignGroup");

    if (!campaignId && !campaignGroup) {
      return NextResponse.json({ error: "campaignId or campaignGroup required" }, { status: 400 });
    }

    let campaignIds: string[] = [];

    if (campaignId) {
      campaignIds = [campaignId];
    } else if (campaignGroup) {
      const grouped = await db
        .select({ id: campaigns.id })
        .from(campaigns)
        .where(eq(campaigns.campaignGroup, campaignGroup));
      campaignIds = grouped.map((c) => c.id);
    }

    if (campaignIds.length === 0) {
      return NextResponse.json([]);
    }

    const rows = await db
      .select({
        contact: contacts,
        status: contactCampaignStatus,
        campaignName: campaigns.name,
      })
      .from(contactCampaignStatus)
      .innerJoin(contacts, eq(contacts.id, contactCampaignStatus.contactId))
      .innerJoin(campaigns, eq(campaigns.id, contactCampaignStatus.campaignId))
      .where(sql`${contactCampaignStatus.campaignId} = ANY(${campaignIds})`);

    // Get touch counts
    const touchCounts = await db
      .select({
        contactId: outreachTouches.contactId,
        campaignId: outreachTouches.campaignId,
        sentCount: sql<number>`count(*) filter (where ${outreachTouches.state} = 'sent')::int`,
        draftCount: sql<number>`count(*) filter (where ${outreachTouches.state} = 'drafted')::int`,
        lastSentAt: sql<string>`max(${outreachTouches.sentAt})`,
        lastChannel: sql<string>`(array_agg(${outreachTouches.channel} ORDER BY ${outreachTouches.sentAt} DESC NULLS LAST))[1]`,
      })
      .from(outreachTouches)
      .where(sql`${outreachTouches.campaignId} = ANY(${campaignIds})`)
      .groupBy(outreachTouches.contactId, outreachTouches.campaignId);

    const touchMap = new Map(
      touchCounts.map((t) => [`${t.contactId}-${t.campaignId}`, t])
    );

    const result = rows.map((row) => {
      const key = `${row.contact.id}-${row.status.campaignId}`;
      const touchInfo = touchMap.get(key);
      const lastSentAt = touchInfo?.lastSentAt;
      const daysSinceContact = lastSentAt
        ? Math.floor((Date.now() - new Date(lastSentAt).getTime()) / (1000 * 60 * 60 * 24))
        : null;

      return {
        ...row.contact,
        campaignId: row.status.campaignId,
        campaignName: row.campaignName,
        statusId: row.status.id,
        status: row.status.status,
        nextTouchDate: row.status.nextTouchDate,
        doNotContact: row.status.doNotContact,
        touchCount: touchInfo?.sentCount ?? 0,
        draftsPending: touchInfo?.draftCount ?? 0,
        lastChannel: touchInfo?.lastChannel ?? null,
        lastTouch: lastSentAt ?? null,
        daysSinceContact,
      };
    });

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
```

- [ ] **Step 2: Create campaign-status PATCH route**

Create `app/api/campaign-status/[id]/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { contactCampaignStatus, statusEnum } from "@/lib/schema";
import { eq } from "drizzle-orm";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser();
    const { id } = await params;
    const body = await request.json();

    // Only allow updating known fields
    const updates: Record<string, unknown> = {};
    if (body.status !== undefined) {
      if (!statusEnum.includes(body.status)) {
        return NextResponse.json({ error: `Invalid status: ${body.status}` }, { status: 400 });
      }
      updates.status = body.status;
    }
    if (body.nextTouchDate !== undefined) updates.nextTouchDate = body.nextTouchDate;
    if (body.doNotContact !== undefined) updates.doNotContact = body.doNotContact;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const [row] = await db
      .update(contactCampaignStatus)
      .set(updates)
      .where(eq(contactCampaignStatus.id, id))
      .returning();
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
```

- [ ] **Step 3: Create EditStatusModal component**

Create `components/EditStatusModal.tsx`:
```typescript
"use client";

import { useState } from "react";

const STATUS_OPTIONS = [
  { value: "not_started", label: "Not Started" },
  { value: "in_progress", label: "In Progress" },
  { value: "responded", label: "Responded" },
  { value: "confirmed", label: "Confirmed" },
  { value: "declined", label: "Declined" },
  { value: "no_response", label: "No Response" },
  { value: "on_hold", label: "On Hold" },
  { value: "not_a_fit", label: "Not a Fit" },
];

interface EditStatusModalProps {
  statusId: string;
  contactName: string;
  currentStatus: string;
  currentNextTouchDate: string | null;
  currentDoNotContact: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function EditStatusModal({
  statusId,
  contactName,
  currentStatus,
  currentNextTouchDate,
  currentDoNotContact,
  onClose,
  onSaved,
}: EditStatusModalProps) {
  const [status, setStatus] = useState(currentStatus);
  const [nextTouchDate, setNextTouchDate] = useState(currentNextTouchDate ?? "");
  const [doNotContact, setDoNotContact] = useState(currentDoNotContact);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await fetch(`/api/campaign-status/${statusId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        nextTouchDate: nextTouchDate || null,
        doNotContact,
      }),
    });
    setSaving(false);
    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold">{contactName}</h3>
        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium">Next Touch Date</label>
            <input
              type="date"
              value={nextTouchDate}
              onChange={(e) => setNextTouchDate(e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={doNotContact}
              onChange={(e) => setDoNotContact(e.target.checked)}
              id="dnc"
            />
            <label htmlFor="dnc" className="text-sm">Do Not Contact (this campaign)</label>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border px-4 py-2 text-sm">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Build Pipeline Overview page**

Replace `app/pipeline/page.tsx`:
```typescript
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { EditStatusModal } from "@/components/EditStatusModal";

interface Campaign {
  id: string;
  name: string;
  campaignGroup: string | null;
}

interface PipelineRow {
  id: string;
  name: string;
  organization: string;
  title: string | null;
  email: string | null;
  linkedinUrl: string | null;
  owner: string;
  campaignId: string;
  campaignName: string;
  statusId: string;
  status: string;
  nextTouchDate: string | null;
  doNotContact: boolean;
  touchCount: number;
  draftsPending: number;
  lastChannel: string | null;
  lastTouch: string | null;
  daysSinceContact: number | null;
}

export default function PipelinePage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState("");
  const [rows, setRows] = useState<PipelineRow[]>([]);
  const [filterOwner, setFilterOwner] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [editingRow, setEditingRow] = useState<PipelineRow | null>(null);

  useEffect(() => {
    fetch("/api/campaigns").then((r) => r.json()).then((data) => {
      setCampaigns(data);
      if (data.length > 0) setSelectedCampaign(data[0].id);
    });
  }, []);

  function loadRows() {
    if (!selectedCampaign) return;
    fetch(`/api/contacts?campaignId=${selectedCampaign}`)
      .then((r) => r.json())
      .then(setRows);
  }

  useEffect(() => { loadRows(); }, [selectedCampaign]);

  const filtered = rows
    .filter((r) => !filterOwner || r.owner === filterOwner)
    .filter((r) => !filterStatus || r.status === filterStatus)
    .sort((a, b) => {
      if (sortBy === "staleness") return (b.daysSinceContact ?? 999) - (a.daysSinceContact ?? 999);
      if (sortBy === "nextTouch") return (a.nextTouchDate ?? "9999").localeCompare(b.nextTouchDate ?? "9999");
      return a.name.localeCompare(b.name);
    });

  const owners = [...new Set(rows.map((r) => r.owner))];
  const statuses = [...new Set(rows.map((r) => r.status))];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <select
          value={selectedCampaign}
          onChange={(e) => setSelectedCampaign(e.target.value)}
          className="rounded-md border px-3 py-2 font-medium"
        >
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select value={filterOwner} onChange={(e) => setFilterOwner(e.target.value)} className="rounded-md border px-3 py-2 text-sm">
          <option value="">All owners</option>
          {owners.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="rounded-md border px-3 py-2 text-sm">
          <option value="">All statuses</option>
          {statuses.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="rounded-md border px-3 py-2 text-sm">
          <option value="name">Sort: Name</option>
          <option value="staleness">Sort: Staleness</option>
          <option value="nextTouch">Sort: Next Touch</option>
        </select>
        <span className="text-sm text-gray-500">{filtered.length} contacts</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">Org</th>
              <th className="py-2 pr-4">Owner</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Touches</th>
              <th className="py-2 pr-4">Last Touch</th>
              <th className="py-2 pr-4">Next Touch</th>
              <th className="py-2 pr-4">Days Stale</th>
              <th className="py-2 pr-4"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={`${row.id}-${row.campaignId}`} className="border-b hover:bg-gray-50">
                <td className="py-2 pr-4">
                  <Link
                    href={`/contacts/${row.id}/${row.campaignId}`}
                    className="text-blue-600 hover:underline"
                  >
                    {row.name}
                  </Link>
                  {row.doNotContact && (
                    <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">DNC</span>
                  )}
                  {!row.email && !row.linkedinUrl && (
                    <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">Needs Contact Info</span>
                  )}
                </td>
                <td className="py-2 pr-4 text-gray-600">{row.organization}</td>
                <td className="py-2 pr-4">{row.owner}</td>
                <td className="py-2 pr-4 capitalize">{row.status.replace("_", " ")}</td>
                <td className="py-2 pr-4">{row.touchCount}{row.draftsPending > 0 && ` (+${row.draftsPending} draft)`}</td>
                <td className="py-2 pr-4 text-gray-500">{row.lastTouch ? new Date(row.lastTouch).toLocaleDateString() : "—"}</td>
                <td className="py-2 pr-4">{row.nextTouchDate ?? "—"}</td>
                <td className="py-2 pr-4">
                  {row.daysSinceContact !== null ? (
                    <span className={row.daysSinceContact > 14 ? "text-red-600 font-medium" : ""}>
                      {row.daysSinceContact}d
                    </span>
                  ) : "—"}
                </td>
                <td className="py-2">
                  <button
                    onClick={() => setEditingRow(row)}
                    className="rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingRow && (
        <EditStatusModal
          statusId={editingRow.statusId}
          contactName={editingRow.name}
          currentStatus={editingRow.status}
          currentNextTouchDate={editingRow.nextTouchDate}
          currentDoNotContact={editingRow.doNotContact}
          onClose={() => setEditingRow(null)}
          onSaved={loadRows}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add Pipeline Overview — filterable table with campaign scoping, staleness sorting"
```

---

### Task 14: Voice Examples CRUD

**Files:**
- Create: `app/api/voice-examples/route.ts`, `app/settings/voice-examples/page.tsx`

- [ ] **Step 1: Voice examples API**

Create `app/api/voice-examples/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { voiceExamples } from "@/lib/schema";
import { eq, and } from "drizzle-orm";

export async function GET() {
  try {
    const user = await requireUser();
    const rows = await db
      .select()
      .from(voiceExamples)
      .where(eq(voiceExamples.userId, user.id))
      .orderBy(voiceExamples.createdAt);
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const [row] = await db
      .insert(voiceExamples)
      .values({
        userId: user.id,
        channel: body.channel,
        archetype: body.archetype || null,
        subject: body.subject || null,
        body: body.body,
        notes: body.notes || null,
      })
      .returning();
    return NextResponse.json(row, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireUser();
    const { id } = await request.json();
    await db
      .delete(voiceExamples)
      .where(and(eq(voiceExamples.id, id), eq(voiceExamples.userId, user.id)));
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
```

- [ ] **Step 2: Voice examples settings page**

Create `app/settings/voice-examples/page.tsx`:
```typescript
"use client";

import { useEffect, useState } from "react";

interface VoiceExample {
  id: string;
  channel: string;
  archetype: string | null;
  subject: string | null;
  body: string;
  notes: string | null;
}

export default function VoiceExamplesPage() {
  const [examples, setExamples] = useState<VoiceExample[]>([]);
  const [channel, setChannel] = useState<"email" | "linkedin">("email");
  const [archetype, setArchetype] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [notes, setNotes] = useState("");

  function load() {
    fetch("/api/voice-examples").then((r) => r.json()).then(setExamples);
  }

  useEffect(() => { load(); }, []);

  async function handleAdd() {
    await fetch("/api/voice-examples", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel, archetype: archetype || null, subject: subject || null, body, notes: notes || null }),
    });
    setBody("");
    setSubject("");
    setArchetype("");
    setNotes("");
    load();
  }

  async function handleDelete(id: string) {
    await fetch("/api/voice-examples", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
  }

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-xl font-bold">Voice Examples</h1>
      <p className="text-sm text-gray-500">
        Add example messages you've sent. Claude uses these to match your writing style.
      </p>

      {/* Add form */}
      <div className="space-y-3 rounded-lg border p-4">
        <div className="flex gap-3">
          <select value={channel} onChange={(e) => setChannel(e.target.value as any)} className="rounded-md border px-3 py-2 text-sm">
            <option value="email">Email</option>
            <option value="linkedin">LinkedIn</option>
          </select>
          <input value={archetype} onChange={(e) => setArchetype(e.target.value)} placeholder="Archetype tag (optional)" className="rounded-md border px-3 py-2 text-sm" />
        </div>
        {channel === "email" && (
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject line" className="w-full rounded-md border px-3 py-2 text-sm" />
        )}
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message body" rows={5} className="w-full rounded-md border px-3 py-2 text-sm" />
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes about when this works well (optional)" className="w-full rounded-md border px-3 py-2 text-sm" />
        <button onClick={handleAdd} disabled={!body} className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
          Add Example
        </button>
      </div>

      {/* Existing examples */}
      <div className="space-y-3">
        {examples.map((ex) => (
          <div key={ex.id} className="rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div className="flex gap-2 text-xs">
                <span className="rounded bg-gray-100 px-2 py-0.5">{ex.channel}</span>
                {ex.archetype && <span className="rounded bg-blue-50 px-2 py-0.5 text-blue-700">{ex.archetype}</span>}
              </div>
              <button onClick={() => handleDelete(ex.id)} className="text-xs text-red-500 hover:underline">Delete</button>
            </div>
            {ex.subject && <div className="mt-2 text-sm font-medium">{ex.subject}</div>}
            <pre className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{ex.body}</pre>
            {ex.notes && <div className="mt-2 text-xs text-gray-400">{ex.notes}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add voice examples CRUD — settings page + API + save from draft panel"
```

---

### Task 15: CSV Export

**Files:**
- Create: `app/api/contacts/export/route.ts`, `app/settings/export/page.tsx`

- [ ] **Step 1: Create export API**

Create `app/api/contacts/export/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { contacts } from "@/lib/schema";

export async function GET() {
  try {
    await requireUser();
    const rows = await db.select().from(contacts).orderBy(contacts.name);

    const headers = ["Name", "Organization", "Title", "Email", "LinkedIn", "Owner", "Prospect", "POC", "Notes"];
    const csv = [
      headers.join(","),
      ...rows.map((r) =>
        [
          `"${r.name}"`,
          `"${r.organization}"`,
          `"${r.title ?? ""}"`,
          `"${r.email ?? ""}"`,
          `"${r.linkedinUrl ?? ""}"`,
          `"${r.owner}"`,
          r.isProspect ? "Y" : "N",
          r.isPoc ? "Y" : "N",
          `"${(r.notes ?? "").replace(/"/g, '""')}"`,
        ].join(",")
      ),
    ].join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=elion-contacts.csv",
      },
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
```

- [ ] **Step 2: Create export page**

Create `app/settings/export/page.tsx`:
```typescript
export default function ExportPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Export Contacts</h1>
      <a
        href="/api/contacts/export"
        className="inline-block rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
      >
        Download CSV
      </a>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add CSV export"
```

---

### Task 16: Final Integration + Polish

- [ ] **Step 1: Add middleware for auth redirect**

Create `middleware.ts` in the project root:
```typescript
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

function verifySignedCookie(signed: string, secret: string): boolean {
  const lastDot = signed.lastIndexOf(".");
  if (lastDot === -1) return false;
  const value = signed.slice(0, lastDot);
  const expectedHmac = crypto.createHmac("sha256", secret).update(value).digest("base64url");
  return signed === `${value}.${expectedHmac}`;
}

export function middleware(request: NextRequest) {
  const sessionCookie = request.cookies.get("session")?.value;
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  // Redirect unauthenticated users to login — verify signed cookie, not just presence
  if (!sessionCookie || !verifySignedCookie(sessionCookie, process.env.NEXTAUTH_SECRET!)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 2: Verify end-to-end flow**

1. Login with Google OAuth
2. Create a campaign in Settings
3. Import the recruitment CSV
4. View Pipeline — verify contacts appear
5. Set a nextTouchDate on a contact
6. View Queue — verify contact appears
7. Click into Contact Detail — verify Gmail context loads
8. Generate a draft — verify Claude produces output
9. Create Gmail Draft — verify draft appears in Gmail
10. Mark Sent — verify queue advances and next touch date is calculated

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add auth middleware, final integration"
```

---

## Self-Review

### Spec Coverage Check

| Spec Section | Task(s) |
|---|---|
| Core Workflow (steps 1-10) | Tasks 3, 7, 8, 10, 11, 12 |
| Channel Selection Logic | Task 12 (DraftPanel) |
| Gmail Architecture — cross-user search | Task 7 |
| Cross-Mailbox Deduplication | Task 7 (Message-ID dedupe) |
| OAuth Token Management | Task 3 (auto-refresh in getGmailClient) |
| Data Model — all 6 tables | Task 2 |
| Contact Reachability | Tasks 11, 12 |
| doNotContact per campaign | Task 2 (schema), Task 11 (queue filter), Task 13 (pipeline) |
| One-Open-Draft Invariant | Task 2 (partial unique index), Task 10 (transactional upsert) |
| Skip + Outstanding Draft | Task 12 (skip disabled when draft exists) |
| Voice Examples per-user per-channel | Task 2 (schema), Task 14 (CRUD) |
| My Queue — 3 sections | Task 11 |
| Pipeline Overview — campaign/group scoping | Task 13 |
| Contact Detail / Drafting — split panel | Task 12 |
| Save as Voice Example | Task 12 (DraftPanel) |
| LinkedIn copy + open profile | Task 12 (DraftPanel) |
| Context Assembly — Gmail + DB merge | Tasks 7, 8 |
| Claude Prompt Structure (all 8 items) | Task 8 |
| Cadence calculation | Task 9 |
| State Transitions | Task 10 |
| Bootstrap — campaigns, CSV, synthetic touches | Tasks 5, 6 |
| CSV Export | Task 15 |
| Settings / Admin | Tasks 5, 6, 14, 15 |

### Gaps Found & Addressed

1. **Campaign edit page** — Task 5 has the new page but not the edit page. The same form component works for both; the `[id]` route is created in the API. The builder can reuse `new/page.tsx` with pre-populated values for the edit case.
2. **Campaign group selector in Pipeline** — The Pipeline page uses a campaign selector but doesn't yet show the campaign group dropdown. The API supports `campaignGroup` param; the UI just needs a second dropdown.

### Code Review Fixes Applied

1. **[P1] Auth hardened** — Session cookie is now HMAC-SHA256 signed via `lib/session.ts`. OAuth login generates a random `state` parameter stored in a short-lived cookie, validated on callback. Middleware verifies the signed cookie, not just its presence.
2. **[P1] Draft creation is atomic** — Touch create route wraps count + delete + insert in `db.transaction()`. Gmail-first ordering is intentional (orphan draft is harmless; orphan DB state would be worse).
3. **[P1] Pipeline mutations implemented** — New `PATCH /api/campaign-status/[id]` route for status, nextTouchDate, doNotContact. New `EditStatusModal` component. Pipeline table has Edit button per row. Status validated against enum before persisting.
4. **[P2] CSV parser replaced** — `papaparse` replaces hand-rolled CSV splitting. Handles quoted fields, embedded commas, and line breaks correctly.
5. **[P2] State transition validated** — Mark Sent route checks `touch.state === "drafted"` and returns 409 if not. Prevents double-send or marking skipped touches as sent.
6. **[P2] Voice example self-reference mitigated** — "Save as Voice Example" from draft panel auto-tags with `notes: "(AI-generated draft — review before relying on as style reference)"` and prompts for archetype label.
