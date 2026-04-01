# Undo "Mark Sent" for Outreach Touches

## Problem

Users sometimes accidentally mark a touch as sent when they haven't actually sent the email. There's no way to undo this in the UI, requiring a manual database fix.

## Design

### API Change

Extend `PATCH /api/touches/[id]` to accept `state: "drafted"` in addition to `state: "sent"`.

When `state: "drafted"` is received:
1. Validate the touch is currently in `sent` state (409 if not)
2. Set `state` back to `drafted` and clear `sentAt` to `null`
3. Call `scheduleNextTouch` to recalculate — the decreased sent count will naturally produce the correct next touch date or revert a `no_response` status

### UI Change

In the outreach history section of `ContactDetail.tsx`, add an "Undo" button next to any touch with `state === "sent"`. The component needs:
- A new prop `onUndoSent: (touchId: string) => Promise<void>`
- The button calls the PATCH endpoint, then the parent refreshes touch data

### No changes to

- The "Mark Sent" flow in DraftPanel
- Other touch states (skipped, received, drafted)
- Any other components or pages
