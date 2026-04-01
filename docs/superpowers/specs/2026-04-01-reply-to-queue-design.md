# Reply-to-Queue: Detect Inbound Replies and Draft Responses

## Problem

When a campaign contact replies to our outreach, there is no way to record that reply in the CRM. The reply sits in Gmail unnoticed, the contact stays on their existing outreach cadence (or ages out via maxTouches), and no response draft is generated. We lose momentum on warm leads.

## Solution

Add a "Check for Replies" button on the queue page that scans Gmail for inbound emails from active campaign contacts. When a reply is detected, record it as a touch, re-add the contact to the queue, and generate a reply draft (not a new outreach) when the user triggers drafting.

## Data Model

### New enum value

Add `received` to the `touchState` enum in `lib/schema.ts`:

```
touchState: drafted | sent | skipped | received
```

### New columns on `outreachTouches`

Add two nullable text columns to store Gmail threading identifiers:

| Column | Type | Purpose |
|--------|------|---------|
| `gmailThreadId` | `text` (nullable) | Gmail thread ID — scoped to the mailbox of the `createdBy` user |
| `gmailMessageId` | `text` (nullable) | RFC 2822 `Message-ID` header — durable dedupe key for received touches |

**Mailbox ownership**: Gmail thread IDs are mailbox-local. The `createdBy` field on the touch identifies which user's Gmail mailbox the `gmailThreadId` belongs to. Any Gmail API call using a stored `gmailThreadId` must use `createdBy` as the `userId` parameter.

These columns are populated:
- **On outbound draft creation (interactive path)**: The current flow creates the DB touch first (`POST /api/touches`), then creates the Gmail draft (`POST /api/gmail/create-draft`). The Gmail `drafts.create` response includes `message.threadId`. After the Gmail draft is created, the touch record must be updated with the returned `gmailThreadId` via `PATCH /api/touches/{id}`. `gmailMessageId` is null (not known until Gmail actually sends the message).
- **On outbound draft creation (batch path)**: Same as interactive — `batch-draft` creates the touch, then calls `createGmailDraft()`, then patches the touch with the returned `threadId`.
- **On inbound reply detection**: Both are populated from the Gmail message metadata during `sync-replies`.

### Received touch record

When an inbound reply is detected, insert an `outreachTouches` row:

| Field | Value |
|-------|-------|
| `state` | `"received"` |
| `subject` | Inbound email subject |
| `body` | Inbound email body (plain text) |
| `sentAt` | Timestamp from the inbound email |
| `touchNumber` | `null` (does not count toward outbound cadence) |
| `channel` | `"email"` |
| `createdBy` | `"sync"` |
| `gmailThreadId` | Thread ID from Gmail |
| `gmailMessageId` | RFC `Message-ID` header from the inbound message |

### contactCampaignStatus update

When a reply is detected for a contact+campaign:

- Set `nextTouchDate` to today (surfaces in "Due Today" queue section)
- Keep `status` as `in_progress` (still active — we haven't responded yet)

No new columns are added to `contactCampaignStatus`. No existing rows are modified beyond `nextTouchDate`.

## Sent-Count Semantics Change

Currently, sent touch count is calculated as the total number of `state = "sent"` touches for a contact+campaign pair. This count is used for:

1. **maxTouches check**: If `sentCount >= campaign.maxTouches`, mark contact as `no_response`
2. **Cadence index**: `sentCount` indexes into `campaign.cadenceDays` to determine next touch spacing

**Change**: Count only sent touches **after the most recent `received` touch**. If no received touch exists, count all sent touches (current behavior).

```sql
-- Pseudocode for new count
SELECT COUNT(*) FROM outreach_touches
WHERE contact_id = ? AND campaign_id = ? AND state = 'sent'
  AND (sent_at > (
    SELECT MAX(sent_at) FROM outreach_touches
    WHERE contact_id = ? AND campaign_id = ? AND state = 'received'
  ) OR NOT EXISTS (
    SELECT 1 FROM outreach_touches
    WHERE contact_id = ? AND campaign_id = ? AND state = 'received'
  ))
```

This means:
- maxTouches represents "max touches since last reply"
- Cadence restarts from index 0 after a reply
- Full outreach history is preserved (no rows modified or deleted)

**Important**: This count change must be applied everywhere `sentCount` is calculated — not just the mark-sent path. Specifically:
- `app/api/touches/[id]/route.ts` (PATCH — mark sent, compute next touch)
- `app/api/batch-draft/route.ts` (POST — compute `touchNumber` for new drafts)
- `app/api/touches/route.ts` (POST — compute `touchNumber` for interactive drafts)

## New API Endpoint: `POST /api/queue/sync-replies`

### Flow

1. Authenticate the current user
2. Load all active campaigns
3. For each campaign, find `contactCampaignStatus` rows where:
   - `status = "in_progress"`
   - `owner = currentUser.ownerName`
   - `doNotContact = false`
   - Contact has an email address
4. For each matching contact:
   - Find all outbound touches (`state = "sent"`) that have a `gmailThreadId`
   - If no sent touches with thread IDs exist, skip (we haven't emailed them yet, or threads predate this feature)
5. For each sent touch's `gmailThreadId`:
   - Fetch the Gmail thread using `createdBy` from the sent touch as the Gmail `userId` (thread IDs are mailbox-local)
   - Check for messages **from** the contact's email address **after** the touch's `sentAt` timestamp
   - This ensures replies are attributed to the correct campaign via thread association, not just sender email
6. For each new inbound message found:
   - Check if a `received` touch already exists with the same `gmailMessageId` (RFC Message-ID header) — dedup
   - If new: insert a `received` touch with the email content, `gmailThreadId`, and `gmailMessageId`
   - Delete any existing `state = "drafted"` touch for this contact+campaign (prevents stale drafts from showing "Mark Sent" in the queue while a reply is pending — see "Stale draft cleanup" below)
   - Set `nextTouchDate = today` on the `contactCampaignStatus` row
7. Return `{ found: number }` with the count of newly detected replies

### Gmail Query

Use the existing `gmail.ts` infrastructure. For each sent touch with a `gmailThreadId`:
- Fetch the thread via `gmail.users.threads.get({ userId: sentTouch.createdBy, id: sentTouch.gmailThreadId })`
- Filter messages in the thread to those **from** the contact's email address and **after** the sent touch's `sentAt`

This is thread-scoped, not a broad mailbox search. A reply is only detected if it arrives in the same Gmail thread as our outbound message, preventing misattribution of unrelated emails from the same contact.

### Stale draft cleanup

When a reply is detected for a contact+campaign that already has a `state = "drafted"` touch, delete the drafted touch during sync. This prevents the queue from presenting a stale "Mark Sent" action for an outreach draft that is no longer relevant — the contact has replied and needs a response draft, not the original follow-up. The next draft generation (batch or interactive) will create a reply-mode draft instead.

### Multi-Campaign Contacts

When a contact is active in multiple campaigns, each campaign's sent touches carry their own `gmailThreadId`. Replies are attributed to the campaign whose thread they appear in. An unrelated email from the same contact (different thread) will not be picked up. If the same thread is somehow associated with multiple campaigns (unlikely but possible if the same email was used for both), attribute the reply to the campaign with the most recent sent touch in that thread.

### Dedup Strategy

Before inserting a `received` touch, check if one already exists for this contact+campaign with the same `gmailMessageId` (RFC 2822 `Message-ID` header). This is a durable, globally unique identifier assigned by the sending mail server — it survives multiple sync runs, multi-user mailbox scans, and Gmail API pagination. The `gmailMessageId` is extracted via `getCorrespondenceHistory()`'s existing `Message-ID` header parsing logic (`lib/gmail.ts`).

## Queue Page Changes

### "Check for Replies" button

- Placed at the top of the queue page, alongside existing controls
- On click: call `POST /api/queue/sync-replies`
- Show loading state on the button during the request
- On completion: show a toast ("Found 3 new replies" or "No new replies")
- Refresh queue data after sync completes

### Reply badge on queue cards

When a contact's most recent touch is `state = "received"`, the queue card should display a visual indicator (e.g., a "Reply" badge or icon) so the user can distinguish replies from regular cadence follow-ups at a glance.

## Draft Generation Changes

### Detection

In `lib/claude.ts` `generateDraft`, `app/api/batch-draft/route.ts`, and `app/api/draft/route.ts`:

Before generating a draft, check if the most recent touch for this contact+campaign is `state = "received"`.

### Reply mode

When the most recent touch is a received reply:

- **Prompt shift**: Instead of "write outreach touch #N for this campaign," instruct Claude to "write a reply to their email." Include the received email's subject and body as the message being replied to.
- **Channel**: Always email (they emailed us). The `DraftPanel` channel toggle must be locked to email when in reply mode.
- **Output format**: Reply body only. No subject line — this will be sent as a threaded reply.
- **Touch record**: The drafted reply gets `state: "drafted"` as usual, but `touchNumber = 1` (first outbound in the new post-reply cycle, per the sent-count semantics change). Subject is set to `"Re: {original subject}"`. `gmailThreadId` is carried over from the received touch to ensure the draft is created in the same thread.

### Gmail threaded reply

When creating a Gmail draft for a reply-mode touch:

1. Pass the `gmailThreadId` from the received touch to `createGmailDraft()`
2. Add `In-Reply-To` and `References` MIME headers using the `gmailMessageId` from the received touch
3. The Gmail API's `drafts.create` accepts a `threadId` field in the request body — set it so the draft appears in the correct thread

Update `createGmailDraft()` in `lib/gmail.ts`:

1. **Return type change**: Return `{ draftId: string; threadId: string } | null` instead of `string | null`. The `threadId` comes from `res.data.message.threadId` in the Gmail API response (already available, currently discarded).

2. **Accept optional threading parameters**:

```typescript
createGmailDraft(
  userId: string,
  to: string,
  subject: string,
  body: string,
  threadOptions?: {
    threadId: string;       // Gmail thread ID — passed to drafts.create requestBody
    inReplyTo: string;      // Message-ID of the message being replied to
  }
)
```

When `threadOptions` is provided:
- Add `In-Reply-To: {inReplyTo}` to the MIME headers
- Build the `References` header by fetching the thread from Gmail (`gmail.users.threads.get`) and extracting the `Message-ID` headers from all messages in the thread, ordered chronologically. This avoids storing the full References chain on the touch record — it is constructed at draft-creation time from the live thread state.
- Pass `threadId` in the Gmail API `requestBody` alongside the raw message

### DraftPanel changes

When the most recent touch is `state = "received"`:

- Lock channel toggle to email (disable LinkedIn option)
- Pass reply context (received touch's `gmailThreadId`, `gmailMessageId`, subject) through to the draft creation flow
- When calling `POST /api/gmail/create-draft`, include `threadId` and `inReplyTo` (the `References` header is built server-side from the thread)

**Thread ID writeback (all draft paths)**: After `POST /api/gmail/create-draft` returns `{ draftId, threadId }`, update the touch record with the returned `gmailThreadId` via `PATCH /api/touches/{id}`. This applies to both normal outreach drafts (where the thread is new) and reply drafts (where the thread already exists). Without this writeback, the sent touch will lack the `gmailThreadId` needed for future reply detection.

### Prompt structure for replies

The existing prompt already includes correspondence history and previous touches. For reply mode, add an explicit instruction block:

```
The contact has replied to your outreach. Their most recent message is below.
Write a reply to this email. Do not write a subject line — this will be sent
as a reply in the existing thread. Keep it conversational and responsive to
what they said.

--- Their reply ---
Subject: {received.subject}
Body: {received.body}
---
```

The rest of the context (contact profile, campaign details, voice examples, correspondence history) remains the same.

## Edge Cases

- **Multiple replies before sync**: If the contact sent multiple emails in the thread since our last touch, record only the most recent one. Claude will see the full thread via Gmail history anyway.
- **Reply to a contact we haven't emailed**: Skip — `sync-replies` only checks contacts with at least one `state = "sent"` touch that has a `gmailThreadId`.
- **Sent touches without `gmailThreadId`**: Touches created before this feature won't have thread IDs. These are skipped during reply sync. To backfill, users can re-draft and re-send, or we can add a backfill script later (out of scope for v1).
- **Contact already has a drafted touch**: The `sync-replies` endpoint deletes any existing `state = "drafted"` touch for the contact+campaign when a reply is detected. This prevents the queue from showing a stale "Mark Sent" action. The next draft generation run will create a reply-mode draft instead.
- **Contact was at maxTouches / no_response**: `sync-replies` only scans `in_progress` contacts. If someone replies after being marked `no_response`, it won't be detected. This could be expanded later but is out of scope for now.
- **Reply from a contact in multiple campaigns**: Replies are matched by `gmailThreadId`, not just sender email. Each campaign's outbound lives in its own thread, so replies are attributed to the correct campaign. See "Multi-Campaign Contacts" above.

## Files to Modify

| File | Change |
|------|--------|
| `lib/schema.ts` | Add `received` to `touchState` enum; add `gmailThreadId` and `gmailMessageId` columns to `outreachTouches` |
| `lib/gmail.ts` | Update `createGmailDraft()`: return `{ draftId, threadId }`, accept optional `threadOptions`, add `In-Reply-To` MIME header, build `References` from thread, pass `threadId` to Gmail API |
| `app/api/queue/sync-replies/route.ts` | New endpoint (thread-scoped Gmail scan using `createdBy` as mailbox owner, Message-ID dedup, stale draft cleanup) |
| `app/api/queue/route.ts` | Include reply indicator in queue response data |
| `app/api/touches/[id]/route.ts` | Update sent-count query to count since last reply; accept `gmailThreadId` in PATCH for thread ID writeback |
| `app/api/touches/route.ts` | Update sent-count query for interactive draft touchNumber assignment |
| `app/api/batch-draft/route.ts` | Update sent-count query; detect reply mode; adjust draft generation; write `gmailThreadId` back to touch after `createGmailDraft()` returns |
| `app/api/draft/route.ts` | Detect reply mode; pass reply context to `generateDraft` |
| `app/api/gmail/create-draft/route.ts` | Accept optional `threadId` and `inReplyTo`; pass to `createGmailDraft()`; return `{ draftId, threadId }` |
| `lib/claude.ts` | Add reply-mode prompt logic |
| `app/queue/page.tsx` | Add "Check for Replies" button + toast |
| `components/QueueCard.tsx` | Add reply badge visual indicator |
| `components/DraftPanel.tsx` | Lock channel to email in reply mode; pass threading context to Gmail draft creation; write `gmailThreadId` back to touch after draft creation |
| Database migration | Add `received` to `touch_state` enum; add `gmail_thread_id` and `gmail_message_id` columns |
