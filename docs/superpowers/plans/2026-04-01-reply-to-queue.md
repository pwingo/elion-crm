# Reply-to-Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect inbound Gmail replies from campaign contacts, record them as touches, and generate threaded reply drafts instead of outreach follow-ups.

**Architecture:** Thread-scoped reply detection via stored `gmailThreadId` on sent touches. A new `sync-replies` endpoint fetches known threads from Gmail, checks for inbound messages, and records them as `received` touches. Draft generation detects reply mode and shifts to a reply prompt. Gmail drafts are created as threaded replies with `In-Reply-To`/`References` headers.

**Tech Stack:** Next.js 16, Drizzle ORM, PostgreSQL (Supabase), Gmail API (googleapis), Claude API (Anthropic SDK)

**Note:** No test framework is configured in this project. Verification steps use `npx tsc --noEmit` for type-checking and manual testing.

**Spec:** `docs/superpowers/specs/2026-04-01-reply-to-queue-design.md`

---

### Task 1: Schema + DB Migration

**Files:**
- Modify: `lib/schema.ts:39` (touchState enum), `lib/schema.ts:113-142` (outreachTouches table)
- Database migration via Supabase MCP

- [ ] **Step 1: Add `received` to touchState enum**

In `lib/schema.ts`, change line 39:

```typescript
// Before:
export const touchStateEnum = ["drafted", "sent", "skipped"] as const;

// After:
export const touchStateEnum = ["drafted", "sent", "skipped", "received"] as const;
```

- [ ] **Step 2: Add Gmail threading columns to outreachTouches**

In `lib/schema.ts`, add two columns after `skipReason` (line 134):

```typescript
// Before:
    skipReason: text("skip_reason"),
  },

// After:
    skipReason: text("skip_reason"),
    gmailThreadId: text("gmail_thread_id"),
    gmailMessageId: text("gmail_message_id"),
  },
```

- [ ] **Step 3: Apply database migration**

Use the Supabase MCP `apply_migration` tool with name `add_reply_support` and the following SQL:

```sql
ALTER TABLE outreach_touches
  ADD COLUMN IF NOT EXISTS gmail_thread_id text,
  ADD COLUMN IF NOT EXISTS gmail_message_id text;
```

The `state` column is `text NOT NULL` (no PostgreSQL enum type), so `received` requires no DDL change — it's validated at the TypeScript level.

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add lib/schema.ts
git commit -m "feat: add received touch state and gmail threading columns"
```

---

### Task 2: Sent-Count Helper

**Files:**
- Create: `lib/sent-count.ts`

The sent-count-since-last-reply query is used in 3 API routes. This helper avoids duplicating the business rule.

- [ ] **Step 1: Create sent-count helper**

Create `lib/sent-count.ts`:

```typescript
import { sql } from "drizzle-orm";

/**
 * Count sent touches since the most recent received (reply) touch
 * for a contact+campaign pair. If no reply exists, counts all sent
 * touches (original behavior).
 *
 * Accepts both `db` and drizzle transaction objects.
 */
export async function getSentCountSinceLastReply(
  executor: { execute: (...args: never[]) => Promise<unknown> },
  contactId: string,
  campaignId: string,
): Promise<number> {
  const result = await (executor as { execute: (q: ReturnType<typeof sql>) => Promise<unknown> }).execute(sql`
    SELECT count(*)::int AS count FROM outreach_touches
    WHERE contact_id = ${contactId}
      AND campaign_id = ${campaignId}
      AND state = 'sent'
      AND (sent_at > (
        SELECT MAX(sent_at) FROM outreach_touches
        WHERE contact_id = ${contactId}
          AND campaign_id = ${campaignId}
          AND state = 'received'
      ) OR NOT EXISTS (
        SELECT 1 FROM outreach_touches
        WHERE contact_id = ${contactId}
          AND campaign_id = ${campaignId}
          AND state = 'received'
      ))
  `);
  const rows = (result as { rows: Array<{ count: number }> }).rows;
  return rows[0]?.count ?? 0;
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add lib/sent-count.ts
git commit -m "feat: add sent-count-since-last-reply helper"
```

---

### Task 3: Gmail Threading Support

**Files:**
- Modify: `lib/gmail.ts:240-287` (createGmailDraft)
- Modify: `app/api/gmail/create-draft/route.ts`

- [ ] **Step 1: Update `createGmailDraft` return type and add threading support**

Replace the entire `createGmailDraft` function in `lib/gmail.ts` (lines 240-287):

```typescript
export async function createGmailDraft(
  userId: string,
  to: string,
  subject: string,
  body: string,
  threadOptions?: {
    threadId: string;
    inReplyTo: string;
  },
): Promise<{ draftId: string; threadId: string } | null> {
  const gmail = await getGmailClient(userId);
  if (!gmail) return null;

  // Look up the user's email for the From header
  const [user] = await db
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const from = user?.name
    ? `${user.name} <${user.email}>`
    : user?.email ?? "me";

  // Build threading headers when replying in an existing thread
  let threadHeaders = "";
  if (threadOptions) {
    threadHeaders += `In-Reply-To: ${threadOptions.inReplyTo}\r\n`;

    // Build References header from the thread's message history
    try {
      const threadData = await gmail.users.threads.get({
        userId: "me",
        id: threadOptions.threadId,
        format: "metadata",
        metadataHeaders: ["Message-ID"],
      });
      const messageIds = (threadData.data.messages ?? [])
        .map((msg) =>
          extractHeader(
            msg.payload?.headers as Array<{ name?: string | null; value?: string | null }> | undefined,
            "Message-ID",
          ),
        )
        .filter(Boolean);
      if (messageIds.length > 0) {
        threadHeaders += `References: ${messageIds.join(" ")}\r\n`;
      }
    } catch (err) {
      console.error("[gmail] Failed to fetch thread for References header:", err);
      // Fall back to In-Reply-To as the sole References value
      threadHeaders += `References: ${threadOptions.inReplyTo}\r\n`;
    }
  }

  const raw =
    `MIME-Version: 1.0\r\n` +
    `From: ${from}\r\n` +
    `To: ${to}\r\n` +
    `Subject: ${mimeEncodeSubject(subject)}\r\n` +
    threadHeaders +
    `Content-Type: text/plain; charset=utf-8\r\n` +
    `\r\n` +
    body;

  const encoded = Buffer.from(raw)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  try {
    const res = await gmail.users.drafts.create({
      userId: "me",
      requestBody: {
        message: {
          raw: encoded,
          threadId: threadOptions?.threadId,
        },
      },
    });
    const draftId = res.data.id;
    const threadId = res.data.message?.threadId;
    if (!draftId || !threadId) return null;
    return { draftId, threadId };
  } catch (err) {
    console.error(`[gmail] createGmailDraft failed for userId=${userId}:`, err);
    return null;
  }
}
```

- [ ] **Step 2: Update the Gmail create-draft API route**

Replace `app/api/gmail/create-draft/route.ts` entirely:

```typescript
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
  const { to, subject, body: messageBody, threadId, inReplyTo } = body as {
    to: string;
    subject: string;
    body: string;
    threadId?: string;
    inReplyTo?: string;
  };

  if (!to || !subject || !messageBody) {
    return NextResponse.json(
      { error: "to, subject, and body are required" },
      { status: 400 },
    );
  }

  const threadOptions =
    threadId && inReplyTo ? { threadId, inReplyTo } : undefined;

  const result = await createGmailDraft(
    user.id,
    to,
    subject,
    messageBody,
    threadOptions,
  );

  if (!result) {
    return NextResponse.json(
      { error: "Failed to create Gmail draft" },
      { status: 500 },
    );
  }

  return NextResponse.json(result);
}
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add lib/gmail.ts app/api/gmail/create-draft/route.ts
git commit -m "feat: add Gmail threading support to draft creation"
```

---

### Task 4: Update Touches API Routes

**Files:**
- Modify: `app/api/touches/route.ts:38-50` (POST — sent-count in draft creation)
- Modify: `app/api/touches/[id]/route.ts:21-23, 64-74` (PATCH — gmailThreadId writeback + sent-count)

- [ ] **Step 1: Update POST /api/touches to use new sent-count semantics**

In `app/api/touches/route.ts`, add the import:

```typescript
// Before (line 8):
import { addBusinessDays } from "@/lib/cadence";

// After:
import { addBusinessDays } from "@/lib/cadence";
import { getSentCountSinceLastReply } from "@/lib/sent-count";
```

Replace the sent-count query inside the `state === "drafted"` block (lines 40-50):

```typescript
    const touch = await db.transaction(async (tx) => {
      // 1. Count sent touches since last reply for this contact+campaign
      const sentCount = await getSentCountSinceLastReply(tx, contactId, campaignId);
```

This replaces the existing `tx.select({ count: ... })` query on lines 41-50. The rest of the transaction (delete existing draft, insert new touch, update status) stays the same.

- [ ] **Step 2: Add gmailThreadId writeback support to PATCH /api/touches/[id]**

In `app/api/touches/[id]/route.ts`, add the import:

```typescript
// Before (line 5):
import { getNextTouchDate } from "@/lib/cadence";

// After:
import { getNextTouchDate } from "@/lib/cadence";
import { getSentCountSinceLastReply } from "@/lib/sent-count";
```

Add gmailThreadId writeback handling after the touch lookup (after line 34, before line 36). Insert this block between the 404 check and the state validation:

```typescript
  // Support gmailThreadId-only update (thread ID writeback after draft creation)
  if (body.gmailThreadId !== undefined && !body.state) {
    const [updated] = await db
      .update(outreachTouches)
      .set({ gmailThreadId: body.gmailThreadId })
      .where(eq(outreachTouches.id, id))
      .returning();
    return NextResponse.json(updated);
  }
```

- [ ] **Step 3: Update sent-count query in PATCH mark-sent flow**

Replace the sent-count query in the PATCH handler (lines 64-74):

```typescript
  // 5. Count sent touches since last reply (including the one just marked)
  const sentCount = await getSentCountSinceLastReply(db, touch.contactId, touch.campaignId);
```

This replaces the existing `db.select({ count: ... })` block.

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add app/api/touches/route.ts app/api/touches/\[id\]/route.ts
git commit -m "feat: update touches API with post-reply sent-count and threadId writeback"
```

---

### Task 5: Reply-Mode Draft Generation

**Files:**
- Modify: `lib/claude.ts:6-38` (DraftInput type), `lib/claude.ts:92-201` (generateDraft)
- Modify: `app/api/draft/route.ts:59-119` (reply detection + context)
- Modify: `app/api/batch-draft/route.ts:170-279` (reply detection + sent-count + threadId carry)

- [ ] **Step 1: Add reply touch to DraftInput and update generateDraft**

In `lib/claude.ts`, add the `replyTouch` field to `DraftInput` (after line 37):

```typescript
  channel: "email" | "linkedin";
  steering?: string;
  replyTouch?: {
    subject: string | null;
    body: string | null;
  };
```

In `generateDraft`, add reply-mode handling. Insert this block after the archetype guidance section (after line 145, before the channel instruction):

```typescript
  // Reply mode: if the contact replied, shift to reply prompt
  if (input.replyTouch) {
    sections.push(
      `## Task\n` +
        `The contact has replied to your outreach. Their most recent message is below.\n` +
        `Write a reply to this email. Do not write a subject line — this will be sent\n` +
        `as a reply in the existing thread. Keep it conversational and responsive to\n` +
        `what they said.\n\n` +
        `--- Their reply ---\n` +
        `Subject: ${input.replyTouch.subject ?? "(no subject)"}\n` +
        `Body: ${input.replyTouch.body ?? ""}\n` +
        `---\n\n` +
        `IMPORTANT: Only reference facts explicitly provided above. Never fabricate details ` +
        `about the contact's location, background, interests, or prior conversations that ` +
        `are not in the correspondence history or contact profile.\n\n` +
        `Respond with just the reply body, no prefix or subject line.`,
    );
  } else if (channel === "email") {
```

Change the existing `if (channel === "email")` on line 148 to `else if (channel === "email")` as shown above.

Update the response parsing (after line 191). Add a reply-mode case before the email parsing:

```typescript
  // Parse response
  if (input.replyTouch) {
    // Reply mode: body only, no subject
    return { subject: null, body: text.trim() };
  } else if (channel === "email") {
```

Change the existing `if (channel === "email")` on line 192 to `else if (channel === "email")` as shown above.

- [ ] **Step 2: Update POST /api/draft for reply detection**

In `app/api/draft/route.ts`, after loading touches (line 68), add reply mode detection:

```typescript
  // Detect reply mode: most recent touch is a received reply
  const sortedTouches = [...touches].sort(
    (a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime(),
  );
  const mostRecentTouch = sortedTouches[0];
  const isReplyMode = mostRecentTouch?.state === "received";

  // In reply mode, force email channel
  const effectiveChannel = isReplyMode ? "email" : channel;
```

Update the voice examples query (line 76) to use `effectiveChannel`:

```typescript
  const examples = await db
    .select()
    .from(voiceExamples)
    .where(
      and(
        eq(voiceExamples.userId, user.id),
        eq(voiceExamples.channel, effectiveChannel),
      ),
    );
```

Update the `generateDraft` call (line 87) to use `effectiveChannel` and pass `replyTouch`:

```typescript
  const result = await generateDraft({
    contact: {
      name: contact.name,
      organization: contact.organization,
      title: contact.title ?? null,
      notes: contact.notes ?? "",
    },
    campaign: {
      name: campaign.name,
      type: campaign.type,
      date: campaign.date ?? null,
      location: campaign.location ?? null,
      description: campaign.description,
      sellingPoints: campaign.sellingPoints,
    },
    gmailThreads,
    touches: touches.map((t) => ({
      touchNumber: t.touchNumber,
      channel: t.channel,
      state: t.state,
      sentAt: t.sentAt,
      subject: t.subject,
      body: t.body,
    })),
    voiceExamples: examples.map((e) => ({
      subject: e.subject,
      body: e.body,
      archetype: e.archetype,
      notes: e.notes,
    })),
    channel: effectiveChannel,
    steering,
    replyTouch: isReplyMode
      ? { subject: mostRecentTouch.subject, body: mostRecentTouch.body }
      : undefined,
  });
```

- [ ] **Step 3: Update POST /api/batch-draft for reply mode + sent-count**

In `app/api/batch-draft/route.ts`, add the import:

```typescript
// Before (line 13):
import { and, eq, isNotNull, or, sql } from "drizzle-orm";

// After:
import { and, eq, isNotNull, or, sql } from "drizzle-orm";
import { getSentCountSinceLastReply } from "@/lib/sent-count";
```

Inside the `batch.map(async (dc) => { ... })` callback (starting around line 170), after loading touches (line 185), add reply detection:

```typescript
            // Detect reply mode
            const sortedTouches = [...touches].sort(
              (a, b) =>
                new Date(b.createdAt ?? 0).getTime() -
                new Date(a.createdAt ?? 0).getTime(),
            );
            const mostRecentTouch = sortedTouches[0];
            const isReplyMode = mostRecentTouch?.state === "received";

            // In reply mode, force email channel
            const effectiveChannel: "email" | "linkedin" = isReplyMode
              ? "email"
              : dc.contactEmail
                ? "email"
                : "linkedin";
```

Replace the existing `channel` variable (line 171-173) with `effectiveChannel`. Use `effectiveChannel` in all places that previously used `channel` within this callback.

Update the `generateDraft` call (around line 201) to pass `replyTouch`:

```typescript
            const result = await generateDraft({
              // ... existing fields ...
              channel: effectiveChannel,
              replyTouch: isReplyMode
                ? { subject: mostRecentTouch.subject, body: mostRecentTouch.body }
                : undefined,
            });
```

Replace the sent-count query inside the transaction (lines 236-245):

```typescript
            await db.transaction(async (tx) => {
              const sentCount = await getSentCountSinceLastReply(
                tx,
                dc.contactId,
                dc.campaignId,
              );
```

When inserting the new drafted touch (around line 257), add `gmailThreadId` from the received touch if in reply mode:

```typescript
              await tx.insert(outreachTouches).values({
                contactId: dc.contactId,
                campaignId: dc.campaignId,
                channel: effectiveChannel,
                state: "drafted",
                touchNumber: sentCount + 1,
                subject: isReplyMode
                  ? `Re: ${mostRecentTouch.subject ?? ""}`
                  : (result.subject ?? null),
                body: result.body,
                draftCreatedAt: new Date(),
                createdBy: user.id,
                gmailThreadId: isReplyMode
                  ? mostRecentTouch.gmailThreadId
                  : null,
              });
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add lib/claude.ts app/api/draft/route.ts app/api/batch-draft/route.ts
git commit -m "feat: add reply-mode draft generation with thread context"
```

---

### Task 6: Sync-Replies Endpoint

**Files:**
- Create: `app/api/queue/sync-replies/route.ts`

- [ ] **Step 1: Create the sync-replies endpoint**

Create `app/api/queue/sync-replies/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  campaigns,
  contacts,
  contactCampaignStatus,
  outreachTouches,
} from "@/lib/schema";
import { requireUser } from "@/lib/auth";
import { getGmailClient } from "@/lib/auth";
import { extractHeader, decodeBody } from "@/lib/gmail";
import { and, eq, isNotNull, or, sql } from "drizzle-orm";

export async function POST() {
  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ownerName = user.ownerName;
  if (!ownerName) {
    return NextResponse.json({ error: "No owner name set" }, { status: 400 });
  }

  const today = new Date().toISOString().split("T")[0];

  // 1. Load all active campaigns
  const activeCampaigns = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.isActive, true));

  if (activeCampaigns.length === 0) {
    return NextResponse.json({ found: 0 });
  }

  let totalFound = 0;

  for (const campaign of activeCampaigns) {
    // 2. Find in_progress contacts owned by current user with email
    const rows = await db
      .select({
        contact: contacts,
        status: contactCampaignStatus,
      })
      .from(contactCampaignStatus)
      .innerJoin(contacts, eq(contactCampaignStatus.contactId, contacts.id))
      .where(
        and(
          eq(contactCampaignStatus.campaignId, campaign.id),
          eq(contactCampaignStatus.status, "in_progress"),
          sql`lower(${contacts.owner}) = lower(${ownerName})`,
          eq(contactCampaignStatus.doNotContact, false),
          isNotNull(contacts.email),
        ),
      );

    if (rows.length === 0) continue;

    // 3. For each contact, find sent touches with gmailThreadId
    for (const { contact, status } of rows) {
      const sentTouches = await db
        .select()
        .from(outreachTouches)
        .where(
          and(
            eq(outreachTouches.contactId, contact.id),
            eq(outreachTouches.campaignId, campaign.id),
            eq(outreachTouches.state, "sent"),
            isNotNull(outreachTouches.gmailThreadId),
          ),
        );

      if (sentTouches.length === 0) continue;

      // 4. For each sent touch, check its thread for replies
      for (const sentTouch of sentTouches) {
        if (!sentTouch.gmailThreadId || !sentTouch.createdBy) continue;

        // Use createdBy as mailbox owner (thread IDs are mailbox-local)
        const gmail = await getGmailClient(sentTouch.createdBy);
        if (!gmail) continue;

        let threadMessages: Array<{
          id?: string | null;
          payload?: {
            headers?: Array<{ name?: string | null; value?: string | null }> | null;
            mimeType?: string | null;
            body?: { data?: string | null } | null;
            parts?: Array<{
              mimeType?: string | null;
              body?: { data?: string | null } | null;
              parts?: unknown[];
            }> | null;
          } | null;
          internalDate?: string | null;
        }>;

        try {
          const threadData = await gmail.users.threads.get({
            userId: "me",
            id: sentTouch.gmailThreadId,
            format: "full",
            metadataHeaders: ["Message-ID", "From", "Subject", "Date"],
          });
          threadMessages = threadData.data.messages ?? [];
        } catch (err) {
          console.error(
            `[sync-replies] Failed to fetch thread ${sentTouch.gmailThreadId}:`,
            err,
          );
          continue;
        }

        // Filter to messages FROM the contact AFTER our sent touch
        const sentAtMs = sentTouch.sentAt
          ? new Date(sentTouch.sentAt).getTime()
          : 0;
        const contactEmailLower = contact.email!.toLowerCase();

        // Find the most recent inbound message
        let latestReply: {
          messageId: string;
          subject: string;
          body: string;
          date: Date;
        } | null = null;

        for (const msg of threadMessages) {
          const headers = msg.payload?.headers ?? [];
          const from = extractHeader(
            headers as Array<{ name?: string | null; value?: string | null }>,
            "From",
          ).toLowerCase();

          if (!from.includes(contactEmailLower)) continue;

          const msgDate = msg.internalDate
            ? new Date(Number(msg.internalDate))
            : null;
          if (!msgDate || msgDate.getTime() <= sentAtMs) continue;

          const gmailMessageId = extractHeader(
            headers as Array<{ name?: string | null; value?: string | null }>,
            "Message-ID",
          );
          const subject = extractHeader(
            headers as Array<{ name?: string | null; value?: string | null }>,
            "Subject",
          );
          const body = decodeBody(msg.payload as Parameters<typeof decodeBody>[0]);

          if (
            !latestReply ||
            msgDate.getTime() > latestReply.date.getTime()
          ) {
            latestReply = {
              messageId: gmailMessageId,
              subject,
              body: body.slice(0, 5000),
              date: msgDate,
            };
          }
        }

        if (!latestReply) continue;

        // 5. Dedup: check if we already recorded this reply
        const [existing] = await db
          .select({ id: outreachTouches.id })
          .from(outreachTouches)
          .where(
            and(
              eq(outreachTouches.contactId, contact.id),
              eq(outreachTouches.campaignId, campaign.id),
              eq(outreachTouches.state, "received"),
              eq(outreachTouches.gmailMessageId, latestReply.messageId),
            ),
          )
          .limit(1);

        if (existing) continue;

        // 6. Record the reply and clean up stale drafts
        await db.transaction(async (tx) => {
          // Delete any existing drafted touch (stale draft cleanup)
          await tx
            .delete(outreachTouches)
            .where(
              and(
                eq(outreachTouches.contactId, contact.id),
                eq(outreachTouches.campaignId, campaign.id),
                eq(outreachTouches.state, "drafted"),
              ),
            );

          // Insert received touch
          await tx.insert(outreachTouches).values({
            contactId: contact.id,
            campaignId: campaign.id,
            touchNumber: null,
            channel: "email",
            state: "received",
            sentAt: latestReply!.date,
            subject: latestReply!.subject,
            body: latestReply!.body,
            createdBy: "sync",
            gmailThreadId: sentTouch.gmailThreadId,
            gmailMessageId: latestReply!.messageId,
          });

          // Set nextTouchDate to today
          await tx
            .update(contactCampaignStatus)
            .set({ nextTouchDate: today })
            .where(
              and(
                eq(contactCampaignStatus.contactId, contact.id),
                eq(contactCampaignStatus.campaignId, campaign.id),
              ),
            );
        });

        totalFound++;
        // Only record the most recent reply per contact+campaign per sync
        break;
      }
    }
  }

  return NextResponse.json({ found: totalFound });
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add app/api/queue/sync-replies/route.ts
git commit -m "feat: add sync-replies endpoint for inbound reply detection"
```

---

### Task 7: Queue API + UI for Replies

**Files:**
- Modify: `app/api/queue/route.ts:69-81, 119-125, 160-181`
- Modify: `components/QueueCard.tsx:19-27, 83-118`
- Modify: `app/queue/page.tsx:26-32, 50-63, 181-321`

- [ ] **Step 1: Add `hasReply` to queue API response**

In `app/api/queue/route.ts`, after the `draftedTouches` query (line 81), add a query for recent received touches:

```typescript
    // Get most recent touch state per contact for this campaign
    const latestTouchResult = await db.execute(sql`
      SELECT DISTINCT ON (contact_id) contact_id, state
      FROM outreach_touches
      WHERE campaign_id = ${campaign.id}
        AND contact_id IN (${contactIdList})
      ORDER BY contact_id, created_at DESC
    `);
    const latestTouchRows = (latestTouchResult as unknown as { rows: Array<{ contact_id: string; state: string }> }).rows ?? [];
    const latestStateByContact = new Map(
      latestTouchRows.map((r) => [r.contact_id, r.state]),
    );
```

Update the `QueueItem` interface (line 160) to add `hasReply`:

```typescript
interface QueueItem {
  contact: {
    id: string;
    name: string;
    organization: string;
    title: string | null;
    email: string | null;
    linkedinUrl: string | null;
    owner: string;
  };
  status: {
    id: string;
    contactId: string;
    campaignId: string;
    status: string | null;
    nextTouchDate: string | null;
    doNotContact: boolean | null;
  };
  touchCount: number;
  lastChannel: string | null;
  draftTouchId: string | null;
  hasReply: boolean;
}
```

Update the item construction (around line 119):

```typescript
      const item: QueueItem = {
        contact,
        status,
        touchCount,
        lastChannel,
        draftTouchId: draft?.id ?? null,
        hasReply: latestStateByContact.get(contact.id) === "received",
      };
```

- [ ] **Step 2: Add reply badge to QueueCard**

In `components/QueueCard.tsx`, add `hasReply` to the props interface (line 19):

```typescript
interface QueueCardProps {
  contact: Contact;
  status: Status;
  campaignId: string;
  touchCount: number;
  lastChannel: string | null;
  draftTouchId: string | null;
  hasReply: boolean;
  onMarkSent?: () => void;
}
```

Update the component destructuring (line 52):

```typescript
export function QueueCard({
  contact,
  status,
  campaignId,
  touchCount,
  lastChannel,
  draftTouchId,
  hasReply,
  onMarkSent,
}: QueueCardProps) {
```

Add the reply badge after the StatusBadge in the card (after line 93):

```typescript
          <StatusBadge status={status.status} />
          {hasReply && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700">
              Reply
            </span>
          )}
```

- [ ] **Step 3: Add "Check for Replies" button + toast to queue page**

In `app/queue/page.tsx`, update the `QueueItem` interface (line 26) to add `hasReply`:

```typescript
interface QueueItem {
  contact: Contact;
  status: Status;
  touchCount: number;
  lastChannel: string | null;
  draftTouchId: string | null;
  hasReply: boolean;
}
```

Add sync state alongside `batchState` (after line 62):

```typescript
  const [syncState, setSyncState] = useState<{
    loading: boolean;
    message: string | null;
  }>({ loading: false, message: null });
```

Add the sync handler function (after `fetchQueue`, around line 81):

```typescript
  const syncReplies = useCallback(async () => {
    setSyncState({ loading: true, message: null });
    try {
      const res = await fetch("/api/queue/sync-replies", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSyncState({ loading: false, message: body.error ?? "Sync failed" });
        return;
      }
      const { found } = await res.json();
      setSyncState({
        loading: false,
        message: found > 0 ? `Found ${found} new ${found === 1 ? "reply" : "replies"}` : "No new replies",
      });
      if (found > 0) fetchQueue();
      // Auto-dismiss toast after 4 seconds
      setTimeout(() => setSyncState((s) => ({ ...s, message: null })), 4000);
    } catch {
      setSyncState({ loading: false, message: "Sync failed" });
    }
  }, [fetchQueue]);
```

Add the Check for Replies button in the summary bar area (after the summary chips, around line 196):

```typescript
      {/* Summary bar */}
      {!loading && !error && data && data.campaigns.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <SummaryChip
            count={totalNeedsMarkSent}
            label="awaiting send confirmation"
            color="yellow"
          />
          <SummaryChip count={totalDueToday} label="due today" color="blue" />
          <SummaryChip count={totalUpcoming} label="upcoming (7 days)" color="gray" />
          <button
            onClick={syncReplies}
            disabled={syncState.loading}
            className="ml-auto px-4 py-1.5 text-sm font-medium rounded-lg border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 disabled:opacity-50 transition-colors"
          >
            {syncState.loading ? "Checking…" : "Check for Replies"}
          </button>
        </div>
      )}
```

Add the sync toast display (after the summary bar, before the batch draft button):

```typescript
      {/* Sync replies toast */}
      {syncState.message && (
        <div className="mt-2 flex items-center gap-2">
          <span className="px-3 py-1.5 rounded-lg text-sm font-medium bg-purple-50 border border-purple-200 text-purple-700">
            {syncState.message}
          </span>
          <button
            onClick={() => setSyncState((s) => ({ ...s, message: null }))}
            className="text-sm text-gray-500 hover:text-gray-700 underline"
          >
            Dismiss
          </button>
        </div>
      )}
```

Also update the `SectionBlock` to pass `hasReply` to `QueueCard` (around line 392):

```typescript
          <QueueCard
            key={item.contact.id}
            contact={item.contact}
            status={item.status}
            campaignId={campaignId}
            touchCount={item.touchCount}
            lastChannel={item.lastChannel}
            draftTouchId={item.draftTouchId}
            hasReply={item.hasReply}
            onMarkSent={onMarkSent}
          />
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add app/api/queue/route.ts components/QueueCard.tsx app/queue/page.tsx
git commit -m "feat: add reply badge and Check for Replies button to queue"
```

---

### Task 8: DraftPanel Reply Mode + ThreadId Writeback

**Files:**
- Modify: `components/DraftPanel.tsx:9-20, 41-52, 97-140, 292-323`
- Modify: `app/contacts/[contactId]/[campaignId]/page.tsx:24-31, 155-223`
- Modify: `components/ContactDetail.tsx:22-27, 54-58`

- [ ] **Step 1: Add reply context props to DraftPanel**

In `components/DraftPanel.tsx`, update the `DraftPanelProps` interface (line 9):

```typescript
interface DraftPanelProps {
  contactId: string;
  campaignId: string;
  contactEmail: string | null;
  contactLinkedinUrl: string | null;
  hasDraft: boolean;
  existingDraftTouchId: string | null;
  existingDraftSubject: string | null;
  existingDraftBody: string | null;
  existingDraftChannel: "email" | "linkedin" | null;
  replyContext: {
    gmailThreadId: string;
    gmailMessageId: string;
    subject: string | null;
  } | null;
  onAction: (actionType: "drafted" | "sent" | "skipped") => void;
}
```

Add `replyContext` to the component destructuring (after line 51):

```typescript
  replyContext,
  onAction,
}: DraftPanelProps) {
```

- [ ] **Step 2: Lock channel to email in reply mode**

After the `defaultChannel` calculation (line 57), add reply mode channel override:

```typescript
  const defaultChannel = existingDraftChannel ?? resolveDefaultChannel(hasEmail, hasLinkedin);

  // In reply mode, force email channel
  const isReplyMode = replyContext !== null;
```

Update the channel state initialization to respect reply mode:

```typescript
  const [channel, setChannel] = useState<Channel>(
    isReplyMode ? "email" : (defaultChannel ?? "email"),
  );
```

In the channel toggle buttons (around line 292), disable the LinkedIn button in reply mode:

```typescript
        <button
          type="button"
          onClick={() => setChannel("linkedin")}
          disabled={!hasLinkedin || isReplyMode}
          className={[
            "px-4 py-1.5 rounded text-sm font-medium transition-colors",
            channel === "linkedin" && hasLinkedin && !isReplyMode
              ? "bg-[var(--primary)] text-white"
              : hasLinkedin && !isReplyMode
                ? "bg-gray-100 text-gray-700 hover:bg-gray-200"
                : "bg-gray-50 text-gray-300 cursor-not-allowed",
          ].join(" ")}
        >
          LinkedIn
        </button>
```

- [ ] **Step 3: Add threadId writeback to handleCreateGmailDraft**

Replace the `handleCreateGmailDraft` function (lines 99-140):

```typescript
  async function handleCreateGmailDraft() {
    if (!contactEmail) return;
    setSubmitting(true);
    try {
      // 1. Record touch in DB first (source of truth)
      const touchRes = await fetch("/api/touches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId,
          campaignId,
          channel: "email",
          state: "drafted",
          subject: isReplyMode ? `Re: ${replyContext?.subject ?? ""}` : subject,
          messageBody: body,
        }),
      });

      if (!touchRes.ok) {
        const err = await touchRes.json().catch(() => ({}));
        showToast(`Error saving draft: ${err.error ?? "Unknown error"}`);
        return;
      }

      const touch = await touchRes.json();

      // 2. Create Gmail draft (with threading if reply mode)
      const gmailPayload: Record<string, string> = {
        to: contactEmail,
        subject: isReplyMode ? `Re: ${replyContext?.subject ?? ""}` : subject,
        body,
      };
      if (replyContext) {
        gmailPayload.threadId = replyContext.gmailThreadId;
        gmailPayload.inReplyTo = replyContext.gmailMessageId;
      }

      const gmailRes = await fetch("/api/gmail/create-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(gmailPayload),
      });

      if (!gmailRes.ok) {
        showToast("Draft saved but Gmail draft creation failed — you can copy the text manually.");
      } else {
        const { threadId } = await gmailRes.json();

        // 3. Write back gmailThreadId to the touch record
        if (threadId && touch.id) {
          await fetch(`/api/touches/${touch.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ gmailThreadId: threadId }),
          });
        }

        showToast("Gmail draft created.");
      }

      onAction("drafted");
    } finally {
      setSubmitting(false);
    }
  }
```

- [ ] **Step 4: Update the contact detail page to pass reply context**

In `app/contacts/[contactId]/[campaignId]/page.tsx`, update the `Touch` interface (line 24) to include the `received` state and Gmail fields:

```typescript
interface Touch {
  id: string;
  touchNumber: number | null;
  channel: "email" | "linkedin";
  state: "drafted" | "sent" | "skipped" | "received";
  subject: string | null;
  body: string | null;
  sentAt: string | null;
  draftCreatedAt: string | null;
  createdAt: string | null;
  createdBy: string;
  gmailThreadId: string | null;
  gmailMessageId: string | null;
}
```

After the `draftTouch` calculation (line 157), add reply context detection:

```typescript
  const draftTouch = touches.find((t) => t.state === "drafted") ?? null;
  const hasDraft = draftTouch !== null;

  // Detect reply mode: most recent touch is "received"
  const sortedTouches = [...touches].sort(
    (a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime(),
  );
  const mostRecentTouch = sortedTouches[0];
  const replyContext =
    mostRecentTouch?.state === "received" &&
    mostRecentTouch.gmailThreadId &&
    mostRecentTouch.gmailMessageId
      ? {
          gmailThreadId: mostRecentTouch.gmailThreadId,
          gmailMessageId: mostRecentTouch.gmailMessageId,
          subject: mostRecentTouch.subject,
        }
      : null;
```

Pass `replyContext` to the DraftPanel (around line 211):

```typescript
        <DraftPanel
          contactId={contactId}
          campaignId={campaignId}
          contactEmail={contact.email}
          contactLinkedinUrl={contact.linkedinUrl}
          hasDraft={hasDraft}
          existingDraftTouchId={draftTouch?.id ?? null}
          existingDraftSubject={draftTouch?.subject ?? null}
          existingDraftBody={draftTouch?.body ?? null}
          existingDraftChannel={draftTouch?.channel ?? null}
          replyContext={replyContext}
          onAction={handleDraftAction}
        />
```

- [ ] **Step 5: Update ContactDetail Touch type**

In `components/ContactDetail.tsx`, update the `Touch` interface (line 22) to include `received`:

```typescript
interface Touch {
  id: string;
  touchNumber: number | null;
  channel: "email" | "linkedin";
  state: "drafted" | "sent" | "skipped" | "received";
  subject: string | null;
  sentAt: string | null;
  draftCreatedAt: string | null;
  createdAt: string | null;
  createdBy: string;
}
```

Add the `received` state badge style (line 54):

```typescript
const stateBadgeClass: Record<string, string> = {
  sent: "bg-green-100 text-green-700",
  drafted: "bg-yellow-100 text-yellow-700",
  skipped: "bg-gray-100 text-gray-500",
  received: "bg-purple-100 text-purple-700",
};
```

- [ ] **Step 6: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add components/DraftPanel.tsx app/contacts/\[contactId\]/\[campaignId\]/page.tsx components/ContactDetail.tsx
git commit -m "feat: add reply mode to DraftPanel with channel lock and threadId writeback"
```

---

## Self-Review Checklist

| Spec Requirement | Task |
|---|---|
| Add `received` to touchState enum | Task 1 |
| Add `gmailThreadId` + `gmailMessageId` columns | Task 1 |
| Mailbox ownership via `createdBy` | Task 6 (sync-replies uses `sentTouch.createdBy`) |
| Sent-count since last reply (3 locations) | Task 2 (helper), Task 4 (touches routes), Task 5 (batch-draft) |
| `createGmailDraft` returns `{ draftId, threadId }` | Task 3 |
| `createGmailDraft` accepts `threadOptions` | Task 3 |
| `In-Reply-To` + `References` MIME headers | Task 3 |
| `POST /api/gmail/create-draft` accepts threading params | Task 3 |
| `PATCH /api/touches/{id}` gmailThreadId writeback | Task 4 |
| Reply-mode prompt in `generateDraft` | Task 5 |
| Reply detection in `/api/draft` | Task 5 |
| Reply detection in `/api/batch-draft` | Task 5 |
| `gmailThreadId` carried from received touch to drafted touch | Task 5 (batch-draft) |
| `POST /api/queue/sync-replies` endpoint | Task 6 |
| Thread-scoped Gmail scan | Task 6 |
| Message-ID dedup | Task 6 |
| Stale draft cleanup during sync | Task 6 |
| `hasReply` in queue API response | Task 7 |
| Reply badge on QueueCard | Task 7 |
| "Check for Replies" button + toast | Task 7 |
| DraftPanel channel lock in reply mode | Task 8 |
| DraftPanel threadId writeback | Task 8 |
| Contact detail page passes reply context | Task 8 |
| `received` state badge in ContactDetail | Task 8 |
| Database migration | Task 1 |
