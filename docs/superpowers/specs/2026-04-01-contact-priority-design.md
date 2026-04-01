# Contact Priority Levels

**Date:** 2026-04-01
**Status:** Approved

## Summary

Add a priority level (1-3) to the campaign-contact relationship so users can prioritize outreach within a campaign. Remove the legacy `isProspect` and `isPoc` boolean flags from contacts.

## Data Model

### Add: `priority` column on `contact_campaign_status`

- **Type:** `INTEGER`, nullable
- **Values:** `1` (High), `2` (Medium), `3` (Low), `null` (unset)
- **Default:** `null` (unset)
- App-layer label mapping: `{ 1: "High", 2: "Medium", 3: "Low" }`

### Remove: `isProspect` and `isPoc` from `contacts`

- Drop both boolean columns
- No data migration into priority — they are different concepts
- Single Drizzle migration handles both the add and the removes

## UI: Visual Indicator

Priority displays as a colored dot + label wherever contacts appear in a campaign context:

| Priority | Color  | Label  |
|----------|--------|--------|
| 1        | Red    | High   |
| 2        | Yellow | Medium |
| 3        | Green  | Low    |
| null     | —      | (none) |

### Surfaces

- **Campaign detail page** — priority column in the contacts table
- **Outreach queue** — on each queue card, near the contact name
- **EditStatusModal** — new dropdown field alongside status, next touch date, and do-not-contact

## UI: Sort & Filter

- **Campaign detail page:**
  - Add "Priority" as a sort option (P1 first, unset last)
  - Add a priority filter dropdown alongside existing owner/status filters
- **Outreach queue:**
  - Within each section (Due Today, Upcoming, Awaiting Send), sort by priority — P1 first, unset last
  - Secondary sort by existing order (next touch date)
- **Contacts list page:** No priority column (priority is per-campaign, not per-contact)

## Editing Priority

- **EditStatusModal:** Add "Priority" dropdown below status field. Options: "None" (null), "High" (1), "Medium" (2), "Low" (3)
- **Campaign detail page:** Clicking priority badge opens EditStatusModal (same as clicking status today)
- **No bulk priority update** — users set priority one contact at a time

## API Changes

### `PATCH /api/campaign-status/[id]`

Accept new `priority` field:
- `priority: number | null` — must be 1, 2, 3, or null
- Validated alongside existing status/nextTouchDate/doNotContact fields

### `GET /api/queue`

- Include `priority` in queue item data
- Sort items within each section by priority (1 first, null last)

### Campaign detail API

- Include `priority` in the contact rows returned for a campaign

## Cleanup: isProspect / isPoc Removal

Files affected:

| File | Change |
|------|--------|
| `lib/schema.ts` | Remove columns from contacts table |
| `components/EditContactSlideOver.tsx` | Remove checkboxes and state |
| `app/contacts/page.tsx` | Remove from `AllContactRow` type |
| `app/api/contacts/route.ts` | Remove from POST/GET handling |
| `app/api/contacts/[id]/route.ts` | Remove from PATCH validation |
| `app/api/contacts/all/route.ts` | Remove from response |
| `app/api/contacts/export/route.ts` | Remove from CSV export |
| `lib/csv-import.ts` | Remove "Prospect?" and "POC" column parsing |

## Notes

- Other agents are working in this branch — changes should be scoped tightly to avoid merge conflicts
- Priority is purely a user-assigned organizational tool, not derived from any automated logic
