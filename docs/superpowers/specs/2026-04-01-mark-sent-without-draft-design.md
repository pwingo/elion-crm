# Mark Sent Without Draft

**Date:** 2026-04-01
**Status:** Approved

## Problem

The outreach workflow requires users to "Save Draft" before "Mark Sent" becomes available. With Gmail draft creation removed from the app, the intermediate "drafted" state adds friction without value in the individual flow. Users generate a message, copy/paste it externally, then must click Save Draft *and then* Mark Sent to record it.

## Design

Collapse the two-step individual flow into a single "Mark Sent" action that creates a touch record directly in "sent" state. Keep "Save Draft" as an optional action for users who want to come back later. Batch draft is unchanged.

### 1. Backend: Consolidated POST /api/touches

Expand the POST endpoint to accept `state: "drafted" | "sent" | "skipped"` (adding "sent").

When `state="sent"`:

1. Delete any existing draft for this contact+campaign
2. Count sent touches since last reply
3. Insert touch with `state="sent"`, `sentAt=now()`, `touchNumber=sentCount+1`, plus subject/body/channel
4. Run cadence scheduling: check maxTouches, set `nextTouchDate` or mark `no_response`
5. Update campaign status from `not_started` to `in_progress` if needed

The PATCH endpoint stays for the batch-draft flow (transitioning existing drafts to sent).

### 2. Shared Scheduling Helper: lib/schedule-next-touch.ts

Extract the cadence scheduling logic from the PATCH handler into a shared function so both POST (direct sent) and PATCH (draft-to-sent) use it without duplication.

Signature:

```typescript
async function scheduleNextTouch(
  tx: Transaction,
  contactId: string,
  campaignId: string,
): Promise<void>
```

Internally:

1. Get campaign for cadence settings
2. Count sent touches since last reply (including the one just marked)
3. If `sentCount >= maxTouches`: set status to `no_response`, clear `nextTouchDate`
4. Else: calculate `nextTouchDate` from cadence array, update `contactCampaignStatus`

### 3. Frontend: DraftPanel Button Changes

**Mark Sent** becomes the primary action (green, `bg-[var(--success)]`). Always visible when body has content (`canDraft`), regardless of whether a draft exists.

- If draft exists (`existingDraftTouchId`): PATCH to sent, including current subject/body from the editor so edits made after saving the draft are captured
- If no draft: POST to `/api/touches` with `state="sent"`

**Save Draft** becomes a secondary action (gray styling). Visible when body has content and no draft exists yet. Records a `state="drafted"` touch for "come back later." No Gmail draft creation.

**Button layout:**

1. Mark Sent (primary, green) -- visible when body has content
2. Save Draft (secondary, gray) -- visible when body has content and no draft exists
3. Copy to Clipboard / Copy body -- utility
4. Save as Voice Example -- unchanged
5. Skip -- unchanged (only when no draft exists)

### 4. Cleanup

- `handleCreateGmailDraft` renamed to `handleSaveDraft`, stripped of Gmail API call
- `handleLinkedInAction` simplified to just copy + open LinkedIn (no touch record creation; user clicks Mark Sent or Save Draft separately)
- `handleMarkSent` updated to work with or without existing draft
- `onAction` callback types unchanged (`"drafted" | "sent" | "skipped"`)

### 5. No Changes

- **Queue categorization**: "needsMarkSent" still shows contacts with drafted touches (from batch draft or manual save)
- **Batch draft**: continues creating `state="drafted"` touches
- **Database schema**: no migrations needed; `state` is already a text column

## Files Affected

| File | Change |
|------|--------|
| `lib/schedule-next-touch.ts` | New: shared cadence scheduling helper |
| `app/api/touches/route.ts` | Add `state="sent"` path using shared helper |
| `app/api/touches/[id]/route.ts` | Refactor to use shared scheduling helper |
| `components/DraftPanel.tsx` | Rework buttons, handlers, remove Gmail draft code |
