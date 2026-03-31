# Contacts & Campaigns Page Split

**Date:** 2026-03-31
**Status:** Draft

## Problem

The `/pipeline` page currently serves dual purposes: a master contacts list ("All Contacts" mode) and a campaign drill-down (when a specific campaign is selected via dropdown). These are conceptually distinct workflows — contact management vs. campaign execution — and should be separate pages.

## Solution

Replace `/pipeline` with three new pages and update the nav bar.

### New Routes

| Route | Purpose |
|---|---|
| `/contacts` | Master contact list with bulk actions |
| `/campaigns` | Campaign index with summary stats |
| `/campaigns/[id]` | Campaign drill-down (status, touches, staleness) |

**Deleted:** `/pipeline` (removed entirely, no redirect)

### Navigation

Update `Nav.tsx` from `Queue | Pipeline | Settings` to `Queue | Contacts | Campaigns | Settings`.

The root redirect (`/` → `/queue`) stays unchanged.

---

## Page Specifications

### 1. `/contacts` — Master Contact List

**Source:** Extracted from the "All Contacts" branch of `/pipeline/page.tsx`.

**Data:** Fetches from existing `GET /api/contacts/all`.

**Columns:** Checkbox, Name, Org, Title, Email, LinkedIn, Owner, Campaigns (badge chips).

**Filters:** Owner dropdown.

**Bulk actions (on selection):**
- Add to Campaign (dropdown of existing campaigns)
- Change Owner (dropdown: Patrick, Bobby, Jeremy)
- Clear selection

**No changes to:** API routes, data model, or bulk action endpoints.

### 2. `/campaigns` — Campaign Index

**New page.** Lists all campaigns as cards.

**Data:** New `GET /api/campaigns/summary` endpoint that returns each campaign with:
- `id`, `name`, `type`, `isActive`
- `contactCount` — total contacts assigned
- `statusBreakdown` — object with counts per status (e.g. `{ in_progress: 12, responded: 8, not_started: 14 }`)

**Card display per campaign:**
- Campaign name
- Type + contact count subtitle
- Status breakdown as colored pills (in progress / responded / not started — only show non-zero)
- Clickable → navigates to `/campaigns/[id]`

**Query:** Joins `campaigns` → `contact_campaign_status`, groups by campaign, counts by status. Only show active campaigns (or all — follow existing `/api/campaigns` behavior).

### 3. `/campaigns/[id]` — Campaign Drill-Down

**Source:** Extracted from the campaign-specific branch of `/pipeline/page.tsx`.

**Data:** Fetches from existing `GET /api/contacts?campaignId=[id]`. Also fetches campaign name from `GET /api/campaigns` (or include it in the contacts response).

**Header:** "Back to Campaigns" link + campaign name + contact count.

**Columns:** Checkbox, Name (linked to `/contacts/[contactId]/[campaignId]`), Org, Owner, Status, Touches, Last Touch, Next Touch, Days Stale, Edit button.

**Filters:** Owner, Status, Sort (Name / Staleness / Next Touch).

**Features carried over:**
- "Show contacts not in this campaign" toggle (fetches from `GET /api/contacts/unassigned?campaignId=[id]`)
- Unassigned contacts table with bulk selection
- Bulk actions: Add to Campaign, Change Owner
- Edit modal (`EditStatusModal`) for status/nextTouchDate/DNC
- Staleness highlighting (>14 days = red bold)
- DNC and "Needs Contact Info" badges on name

---

## API Changes

### New Endpoint

**`GET /api/campaigns/summary`**

Returns:
```json
[
  {
    "id": "uuid",
    "name": "AI Summit 2026",
    "type": "event",
    "isActive": true,
    "contactCount": 34,
    "statusBreakdown": {
      "not_started": 14,
      "in_progress": 12,
      "responded": 8
    }
  }
]
```

Implementation: Query `campaigns` left-joined with `contact_campaign_status`, group by campaign, count statuses.

### Existing Endpoints (No Changes)

- `GET /api/contacts/all` — used by `/contacts`
- `GET /api/contacts?campaignId=X` — used by `/campaigns/[id]`
- `GET /api/contacts/unassigned?campaignId=X` — used by `/campaigns/[id]`
- `POST /api/contacts/bulk-assign` — used by both `/contacts` and `/campaigns/[id]`
- `POST /api/contacts/bulk-owner` — used by both `/contacts` and `/campaigns/[id]`
- `GET /api/campaigns` — still used by bulk action dropdowns

---

## Component Changes

| Component | Change |
|---|---|
| `Nav.tsx` | Update `navLinks` array: replace Pipeline with Contacts + Campaigns |
| `EditStatusModal.tsx` | No changes — used as-is by `/campaigns/[id]` |
| `app/pipeline/page.tsx` | Delete |
| `app/contacts/page.tsx` | New — extracted "All Contacts" logic |
| `app/campaigns/page.tsx` | New — campaign index |
| `app/campaigns/[id]/page.tsx` | New — extracted campaign-specific logic |
| `app/api/campaigns/summary/route.ts` | New endpoint |

---

## Shared Code

The bulk action logic (handleBulkAssign, handleBulkOwner, checkbox helpers) is duplicated between `/contacts` and `/campaigns/[id]`. For now, duplicate it in both pages — it's straightforward state management and extracting a shared hook would be premature given there are only two consumers. If a third page needs it later, extract then.

---

## Out of Scope

- Campaign creation (stays in Settings)
- Changes to the Queue page
- Changes to the contact detail page (`/contacts/[contactId]/[campaignId]`)
- Changes to CSV import flow
- Campaign badges on the Contacts page linking to campaign drill-down (could add later, not needed now)
