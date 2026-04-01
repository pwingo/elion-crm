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

### contactCampaignStatus update

When a reply is detected for a contact+campaign:

- Set `nextTouchDate` to today (surfaces in "Due Today" queue section)
- Keep `status` as `in_progress` (still active — we haven't responded yet)

No new columns are added. No existing rows are modified beyond `nextTouchDate`.

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
   - Find the most recent outbound touch (`state = "sent"`) and its `sentAt` timestamp
   - Call Gmail API to search for messages **from** the contact's email address, **after** that timestamp
   - If no sent touch exists, skip (we haven't emailed them yet)
5. For each new inbound message found:
   - Check if a `received` touch already exists with the same `sentAt` timestamp (dedup)
   - If new: insert a `received` touch with the email content
   - Set `nextTouchDate = today` on the `contactCampaignStatus` row
6. Return `{ found: number }` with the count of newly detected replies

### Gmail Query

Use the existing `gmail.ts` infrastructure. For each contact, search with:
- `from:{contactEmail}`
- `after:{lastSentTouchDate}` (epoch seconds)

Extract the most recent message from matching threads. Use the first `text/plain` part for the body.

### Dedup Strategy

Before inserting a `received` touch, check if one already exists for this contact+campaign with a `sentAt` within 1 minute of the inbound message timestamp. This prevents duplicate recording on repeated sync clicks.

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

In `lib/claude.ts` `generateDraft` and in `app/api/batch-draft/route.ts`:

Before generating a draft, check if the most recent touch for this contact+campaign is `state = "received"`.

### Reply mode

When the most recent touch is a received reply:

- **Prompt shift**: Instead of "write outreach touch #N for this campaign," instruct Claude to "write a reply to their email." Include the received email's subject and body as the message being replied to.
- **Channel**: Always email (they emailed us)
- **Output format**: Reply body only. No subject line (we're replying in an existing thread).
- **Touch record**: The drafted reply gets `state: "drafted"` as usual, but `touchNumber = 1` (first outbound in the new post-reply cycle). Subject is set to `null` or `"Re: {original subject}"`.

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

- **Multiple replies before sync**: If the contact sent multiple emails since our last touch, record only the most recent one. Claude will see the full thread via Gmail history anyway.
- **Reply to a contact we haven't emailed**: Skip — `sync-replies` only checks contacts with at least one `state = "sent"` touch.
- **Contact already has a drafted touch**: If a regular outreach draft exists when a reply comes in, the next batch-draft run will overwrite it with a reply draft (existing behavior — drafts are deleted and recreated).
- **Contact was at maxTouches / no_response**: `sync-replies` only scans `in_progress` contacts. If someone replies after being marked `no_response`, it won't be detected. This could be expanded later but is out of scope for now.

## Files to Modify

| File | Change |
|------|--------|
| `lib/schema.ts` | Add `received` to `touchState` enum |
| `app/api/queue/sync-replies/route.ts` | New endpoint (Gmail scan + record replies) |
| `app/api/queue/route.ts` | Include reply indicator in queue response data |
| `app/api/touches/[id]/route.ts` | Update sent-count query to count since last reply |
| `app/api/batch-draft/route.ts` | Detect reply mode, adjust draft generation |
| `lib/claude.ts` | Add reply-mode prompt logic |
| `app/queue/page.tsx` | Add "Check for Replies" button + toast |
| `components/QueueCard.tsx` | Add reply badge visual indicator |
| Database migration | Add `received` to `touch_state` enum |
