# Batch Draft Design

## Problem

Generating outreach drafts one contact at a time is tedious. Users want to pre-generate drafts for all due contacts so they can review them quickly.

## Scope

- All contacts with `nextTouchDate <= today` across all campaigns
- Contacts that already have a drafted touch are skipped
- Channel: email if the contact has an email address, LinkedIn otherwise

## API: `POST /api/batch-draft`

### Request

```json
{ "contactIds?": "string[]" }
```

If `contactIds` is omitted, drafts all due contacts.

### Behavior

1. Query all due contacts (`nextTouchDate <= today`) without an existing drafted touch
2. If `contactIds` provided, filter to that subset
3. Process in parallel batches of 3 using `Promise.allSettled`
4. For each contact:
   - Determine channel: email if `contact.email` exists, else LinkedIn
   - Call the existing draft generation logic (`lib/claude.ts`)
   - Insert a `state="drafted"` touch record via the same logic as `POST /api/touches`
5. Stream SSE events to the client:
   - `{ type: "progress", contactId, contactName, campaignId, status: "success" | "error", error?, current, total }`
   - `{ type: "done", succeeded, failed, total }`

### Error handling

- Individual failures don't stop the batch; they're reported in progress events and the final summary
- If a contact already has a draft (race condition), skip it gracefully

## UI: Queue Page

### "Draft All Due" button

- Placement: top of the queue page, alongside existing controls
- Disabled when: no due contacts exist, or a batch is already running
- Label: "Draft All Due (N)" showing the count of draftable contacts

### Progress state

- On click: button becomes a progress indicator ("Drafting 3/12...")
- As each draft completes, the corresponding queue card updates inline (shows draft exists)
- On completion: summary toast ("12 drafted, 1 failed")

### Data flow

1. Button click -> `POST /api/batch-draft`
2. Client reads SSE stream, updates local state per progress event
3. On "done" event, refresh queue data to get final state

## Files to create/modify

- **New:** `app/api/batch-draft/route.ts` - batch draft SSE endpoint
- **Modify:** `app/queue/page.tsx` - add button, progress UI, SSE client logic
- **Possibly extract:** shared draft+touch creation logic from existing routes if needed
