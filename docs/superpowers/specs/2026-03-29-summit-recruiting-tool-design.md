# Elion Outreach Tool — Design Spec

## Overview

A lightweight Next.js web app that streamlines outreach campaigns for Elion — starting with summit provider and vendor recruiting, but generalized to support any campaign type (sales follow-up, content distribution, conference networking). The tool assembles rich context from Gmail correspondence history and an internal database, uses Claude to draft personalized outreach via email (Gmail drafts) or LinkedIn (copy-paste), and tracks all touches regardless of channel.

**Users:** Patrick, Bobby, Jeremy (all equal — no roles/permissions)
**Timeline:** 1-day hackweek build
**Stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS, PostgreSQL + Drizzle ORM, deployed to Cloud Run

## Problem

Elion runs multiple outreach campaigns — summit provider recruiting, vendor recruiting, sales follow-up, content distribution. Each involves managing a list of contacts, reviewing prior correspondence for context, drafting tailored emails, tracking touches, and cycling through follow-ups. The current process (spreadsheets, manual Gmail lookup, hand-writing every email) works but is slow and doesn't scale, especially with compressed timelines. The pattern is the same across campaign types; only the context and pitch change.

## Core Concepts

### Campaigns

A **campaign** is the primary organizing unit. Examples:
- "Summer 2026 — Provider Recruiting"
- "Summer 2026 — Vendor Recruiting"
- "Q3 2026 — Sales Outreach"

Each campaign has its own contact list, status tracking, cadence settings, queue, and selling points.

### Campaign Groups

An optional **campaignGroup** field ties related campaigns together. "Summer 2026 — Provider Recruiting" and "Summer 2026 — Vendor Recruiting" both have `campaignGroup = "Summer 2026"`. This enables cross-campaign views (e.g., "how is all Summer 2026 outreach going?"). Campaign groups have no schema of their own — they're just a shared text label, presented as a dropdown of existing values in the UI to prevent typos.

## Core Workflow

1. User logs in with Google OAuth
2. Dashboard shows their follow-up queue grouped by active campaign
3. User clicks into a contact — sees a rich context briefing (prior correspondence from Gmail, contact notes, past outreach this cycle) alongside a Claude-drafted message
4. User selects the **outreach channel** — Email or LinkedIn — which controls the draft style and send flow
5. User reviews/edits the draft, optionally regenerates with steering ("make it warmer," "try a different angle")
6. **Email channel:** User clicks "Create Gmail Draft" — the app creates a draft in the user's Gmail; the app records a touch in "drafted" state
7. **LinkedIn channel:** User clicks "Copy to Clipboard" — the app copies the message text and opens the contact's LinkedIn profile in a new tab; user pastes it into LinkedIn manually; the app records a touch in "drafted" state
8. User sends the message (from Gmail or LinkedIn) on their own time
9. User returns to the app and clicks "Mark Sent" — the queue advances and the next follow-up date is calculated
10. Pipeline Overview lets anyone see all contacts across all owners for accountability

### Channel Selection Logic

The channel toggle defaults based on available contact info:
- **Contact has email only** → Email channel, LinkedIn disabled (no URL)
- **Contact has LinkedIn URL only** → LinkedIn channel, Email disabled (no address)
- **Contact has both** → defaults to Email (the richer context channel), user can switch to LinkedIn
- **Contact has neither** → contact cannot enter the queue (see Contact Reachability below)

## Architecture

### Data Flow

```
App DB (contacts, campaigns, touches)
        +
Gmail API — 3 user mailboxes (all correspondence with contact's email)
        ↓
Context Assembly (merge DB metadata + Gmail threads into contact profile)
        ↓
Claude API (generate draft for selected channel — email or LinkedIn)
        ↓
Web UI (user reviews/edits draft, selects channel)
        ↓
Email channel: Gmail API — create draft in user's inbox
LinkedIn channel: Copy to clipboard + open LinkedIn profile — user pastes manually
        ↓
App DB (record touch as "drafted" with channel + draft-time text)
        ↓
User sends (from Gmail or LinkedIn), returns to app, clicks "Mark Sent"
        ↓
App DB (mark touch "sent", calculate next follow-up date)
```

### Integrations

| Service | Auth Method | Usage |
|---------|------------|-------|
| Google OAuth 2.0 | Per-user OAuth tokens (scopes: `gmail.compose`, `gmail.readonly`) | Sign-in, Gmail read + draft creation |
| Gmail API (read — all 3 users) | Per-user OAuth tokens stored in DB | Search each user's mailbox for all correspondence with a contact; merge and dedupe across all 3 |
| Gmail API (write — logged-in user) | Per-user OAuth token | Create drafts in the logged-in user's personal inbox |
| Attio API | Shared API key (server-side) | Optional contact metadata resolution only (name, email, org). Not used for correspondence or notes. |
| Claude API | Shared API key (server-side) | Draft generation (email and LinkedIn) |

### Gmail Architecture: Cross-User Search by Contact Email

Context assembly searches for **all correspondence** with a contact by email address — no Google Group filtering, no CC requirements. The query is simply:

```
from:{contactEmail} OR to:{contactEmail}
```

This is run against each of the 3 recruiters' Gmail mailboxes using their stored OAuth tokens. Results are merged and deduplicated by RFC 2822 `Message-ID` header.

This approach:
- **Captures the full relationship history** — every email any team member has exchanged with this contact, regardless of topic or campaign
- **Requires zero operational discipline** — no CC rules, no Google Group setup, nothing to remember
- **Works retroactively** — correspondence that predates the tool is immediately available
- **All 3 users must have logged in at least once** for full cross-mailbox coverage. If a user hasn't logged in yet, their mailbox is simply skipped.

#### Cross-Mailbox Deduplication

Gmail thread IDs are **not guaranteed stable across different mailboxes** — the same conversation may have different thread IDs in different users' inboxes. The app deduplicates using the RFC 2822 `Message-ID` header, which is globally unique per message and stable across all mailboxes. When fetching messages for context, the app requests the `Message-ID` metadata header (`metadataHeaders: ['Message-ID']`) and uses it as the dedupe key. Messages with the same `Message-ID` are kept only once.

### OAuth Token Management

Google OAuth access tokens expire after ~1 hour. The app stores both `accessToken` and `refreshToken` per user. On any Gmail API call, if the access token is expired, the app refreshes it using the stored refresh token and updates the DB. This is critical for cross-user search — the app reads from all 3 users' mailboxes, not just the logged-in user, so stale tokens for other users would silently degrade context quality.

### What We Read vs. Write

| System | Read | Write |
|--------|------|-------|
| Gmail (all 3 user mailboxes) | All email threads with a contact | Nothing |
| Gmail (logged-in user) | (included in the cross-user read above) | Drafts only (never sends) |
| Attio | Contact metadata only (optional — for resolving email/org when not in app DB) | Nothing (read-only) |
| App DB | Contacts, touches, campaigns | Contacts, touches, campaigns |

### Attio (Reduced Role)

Attio is **not** a core context source. It does not expose email content via its API (only interaction timestamps), and correspondence context comes from Gmail.

Attio is used only for **optional contact metadata resolution** — if a contact is imported from CSV without an email address, we can attempt to look it up in Attio by name + organization. This uses:

| Purpose | Endpoint |
|---------|----------|
| Search/resolve person | `POST /v2/objects/people/records/query` |
| Fuzzy person search | `POST /v2/objects/records/search` |

**Required Attio scopes:** `record_permission:read`, `object_configuration:read`

If Attio integration proves unnecessary during the build, it can be dropped entirely with no impact on core functionality.

### Persistence: PostgreSQL

The app uses **PostgreSQL** as its database, accessed via Drizzle ORM with the `postgres` driver. Drizzle has first-class PostgreSQL support.

- Connection string configured as a `DATABASE_URL` environment variable
- Hosting options: Cloud SQL (GCP-native), Neon (serverless Postgres), Supabase, or any managed Postgres provider
- Enables the unique partial index required by the one-open-draft invariant natively (`CREATE UNIQUE INDEX ... WHERE state = 'drafted'`)

## Data Model (PostgreSQL + Drizzle)

### users

| Column | Type | Notes |
|--------|------|-------|
| id | text (PK) | |
| email | text | Google account email |
| name | text | |
| googleAccessToken | text | Encrypted |
| googleRefreshToken | text | Encrypted |
| ownerName | text | Maps to contacts.owner (e.g., "Patrick", "Bobby", "Jeremy") — set during first login |

### contacts

| Column | Type | Notes |
|--------|------|-------|
| id | text (PK) | |
| name | text | |
| organization | text | |
| title | text | Nullable |
| email | text | Nullable — populated from CSV, Attio, or manually |
| linkedinUrl | text | Nullable |
| owner | text | Team member name (Patrick, Bobby, Jeremy) |
| isProspect | boolean | |
| isPoc | boolean | Point of contact flag |
| notes | text | Free text — global contact-level notes, not campaign-specific |

#### Contact Reachability

A contact needs at least one of `email` or `linkedinUrl` to enter the active outreach queue:

- **Has email** → full workflow (Gmail context + email drafting). LinkedIn drafting also available if LinkedIn URL exists.
- **Has LinkedIn URL but no email** → LinkedIn-only workflow. Gmail context assembly is skipped (no email to search by). Claude drafts based on DB context only (notes, campaign info, outreach history). The context panel shows a prominent note: "No email correspondence available — context based on notes and outreach history only. Add detailed notes to improve draft quality."
- **Has neither** → cannot enter the queue. Excluded from My Queue. Surfaces with a "Needs Contact Info" badge in Pipeline Overview. Contact Detail is accessible but drafting is disabled with a prompt to add email or LinkedIn URL.

Note: `doNotContact` is a per-campaign flag on `contact_campaign_status`. When true, the contact is excluded from that campaign's queue regardless of reachability. Surfaces with a "Do Not Contact" badge in Pipeline Overview for that campaign. Does not affect the contact's participation in other campaigns.

### campaigns

| Column | Type | Notes |
|--------|------|-------|
| id | text (PK) | |
| name | text | e.g., "Summer 2026 — Provider Recruiting" |
| type | text | Enum: `provider_recruiting`, `vendor_recruiting`, `sales`, `content`, `conference`, `other` |
| campaignGroup | text | Nullable — optional label to group related campaigns (e.g., "Summer 2026"). Presented as a dropdown of existing values in the UI to prevent typos. |
| date | text | Event/target date |
| location | text | Nullable |
| description | text | What this campaign is about — key themes, format, context Claude needs for drafting |
| sellingPoints | text | What makes this worth engaging with — confirmed speakers, value props, etc. |
| isActive | boolean | Multiple campaigns can be active simultaneously |
| cadenceDays | text | JSON array of follow-up intervals in business days, e.g. `[5, 7, 10, 14]` — index 0 is delay after touch 1, etc. Defaults to `[5, 7, 10, 14]` if null |
| maxTouches | integer | Max outreach attempts before auto-completing. Defaults to 4 if null |

### contact_campaign_status

| Column | Type | Notes |
|--------|------|-------|
| id | text (PK) | |
| contactId | text (FK → contacts) | |
| campaignId | text (FK → campaigns) | |
| status | text | Enum — see Status Enum below |
| nextTouchDate | text | Nullable — only populated after a touch is marked "sent" or set manually by user |
| doNotContact | boolean | Default false. When true, excludes this contact from this campaign's queue. Does not affect other campaigns. |

#### Status Enum

All status values are drawn from a fixed set. The UI presents these as a dropdown, not free text.

| Value | Meaning |
|-------|---------|
| `not_started` | Contact added but no outreach initiated |
| `in_progress` | Active outreach cycle underway |
| `responded` | Contact has replied (positively or neutrally) |
| `confirmed` | Contact confirmed attendance / engagement |
| `declined` | Contact explicitly declined |
| `no_response` | Max touches reached with no reply — cycle complete |
| `on_hold` | Paused — not in active queue but not closed |
| `not_a_fit` | Contact determined to be wrong fit for this campaign |

### outreach_touches

| Column | Type | Notes |
|--------|------|-------|
| id | text (PK) | |
| contactId | text (FK → contacts) | |
| campaignId | text (FK → campaigns) | |
| touchNumber | integer | Nullable. Null for `skipped` touches. For `drafted`/`sent`: count of "sent" touches for this contact+campaign + 1 at time of draft creation. |
| channel | text | Enum: `email`, `linkedin` — which outreach channel this touch uses |
| state | text | Enum: `drafted`, `sent`, `skipped` |
| createdAt | text | Timestamp when this record was created — used for consistent ordering across all states |
| draftCreatedAt | text | Nullable — timestamp when draft was created (null for skipped) |
| sentAt | text | Nullable — timestamp when user clicks Mark Sent |
| subject | text | Nullable — null for skipped touches and LinkedIn touches (LinkedIn messages have no subject) |
| body | text | Nullable — draft-time text stored at creation. Null for skipped. For email touches, not reconciled with edits made in Gmail before sending. For LinkedIn touches, the exact text copied to clipboard. |
| createdBy | text | Which user created this touch |
| skipReason | text | Nullable — only populated when state is "skipped" (e.g., "Out of office until 4/15") |

#### One-Open-Draft Invariant

A contact may have at most **one** touch in `drafted` state per campaign at any time. Enforced at **both** DB and application layers:

**DB-level:** A unique partial index on `(contactId, campaignId)` where `state = 'drafted'`. This prevents two concurrent users from creating duplicate drafts for the same contact+campaign — the second insert fails.

**Application-level:** Draft creation uses a transaction: delete any existing `drafted` touch for this contact+campaign, then insert the new one. This is an atomic upsert that respects the unique index.

- `touchNumber` is assigned at draft creation: `COUNT(touches WHERE state = 'sent' AND contactId = X AND campaignId = Y) + 1`. If the draft is later replaced, the new draft gets the same touchNumber since no send occurred.
- A `skipped` touch has `touchNumber = null` — it records the skip with a reason and timestamp but does not participate in touch numbering.

#### Skip + Outstanding Draft Interaction

**Skip is disabled in the UI while a `drafted` touch exists** for this contact+campaign. The user must either Mark Sent or create a new draft (which replaces the old one) before skipping. This avoids ambiguity about what happens to the orphaned Gmail draft and keeps the state machine simple.

### voice_examples

| Column | Type | Notes |
|--------|------|-------|
| id | text (PK) | |
| userId | text (FK → users) | Each user seeds their own voice examples |
| channel | text | Enum: `email`, `linkedin` — which channel this example is for |
| archetype | text | Nullable — user-assigned label when saving (e.g., "cold outreach", "warm re-engage", "follow-up", "intro request"). Free text, not an enum — users may create their own categories. |
| subject | text | Nullable — example subject (null for LinkedIn examples) |
| body | text | Example message body |
| notes | text | Nullable — context about when/why this example works |

Voice examples are per-user and per-channel. When drafting, the app loads all examples belonging to the logged-in user for the selected channel (regardless of archetype tag — Claude sees the full range and matches style appropriately). If a user has no examples for that channel, the prompt omits the voice examples section and relies on correspondence history as implicit style reference.

## Views

### 1. My Queue

The primary daily workflow view. Shows contacts assigned to the logged-in user **who are reachable and not marked Do Not Contact for that campaign**, grouped by active campaign.

Within each campaign group, contacts appear in three sections:
1. **Needs "Mark Sent"** — touches in `drafted` state that haven't been confirmed as sent yet
2. **Due today / Overdue** — contacts where nextTouchDate <= today, no outstanding draft, and status is `not_started` or `in_progress`
3. **Upcoming this week** — contacts due in the next 7 days (read-only preview)

Contacts with status `not_started` and no `nextTouchDate` set do **not** appear in My Queue. To initiate first outreach, the user goes to Pipeline Overview, sets a `nextTouchDate` (or clicks into the Contact Detail view directly), which places the contact in the queue.

Each card shows:
- Contact name, org, title
- Touch count this cycle and last channel used
- Current status (from the status enum)
- One-click to open Contact Detail / Drafting view (or "Mark Sent" directly from the card)

Summary bar at top: "2 awaiting send confirmation, 6 follow-ups due today, 3 overdue, 12 upcoming this week"

### 2. Pipeline Overview

The management/accountability view. A filterable, sortable table with two scoping options:

**Campaign selector at top** — view a single campaign's contacts and status. All columns reflect that campaign's data.

**Campaign group selector** — optional. When selected, shows all contacts across all campaigns in that group (e.g., all "Summer 2026" campaigns). Adds a "Campaign" column to the table. Useful for seeing "how is all Summer 2026 outreach going?" across both provider and vendor recruiting.

Columns: Name, Org, Title, Email, LinkedIn (with "Needs Contact Info" badge if both null, "Do Not Contact" badge if flagged for this campaign), Owner, Campaign (if campaign group view), Status (enum), Touch Count (sent touches), Last Channel (email/linkedin), Last Touch, Next Touch, Days Since Last Contact, Drafts Pending (count of `drafted` touches)

Capabilities:
- Filter by owner, status (multi-select from enum values), campaign (if campaign group view)
- Sort by any column (staleness sort to find contacts falling through cracks)
- Reassign owner (click to change)
- Inline edit status (dropdown from enum), next touch date, email, notes
- Toggle Do Not Contact flag
- Click any row to open Contact Detail view

Pipeline Overview is also the entry point for initiating first outreach: find a `not_started` contact, set their `nextTouchDate`, and they appear in the owner's queue.

### 3. Contact Detail / Drafting View

Split-panel layout, accessible from My Queue or Pipeline Overview. Always opened in the context of a specific campaign.

**Left panel — Context Briefing:**
- Contact metadata (name, org, title, LinkedIn link, email — with edit capability if missing)
- Contact notes (free text — editable inline; this is where users capture non-email context like "Attended Spring 2025 summit, presented on panel" or "Met at HLTH, interested in our rev cycle work")
- Recent email threads from Gmail (the full correspondence history with this contact — all emails, not filtered by campaign or topic). Disabled with "Add email to view correspondence" message if email is null.
- Outreach history this cycle (prior touches for this campaign — metadata only: touch number, date, channel, subject, state indicator for drafted/sent/skipped)

**Right panel — Drafting:**
- **Channel toggle** (Email / LinkedIn) — defaults per Channel Selection Logic above. Controls draft style and send action.
- Claude-generated draft informed by all context in the left panel, using the logged-in user's voice examples. Disabled with "Add email or LinkedIn URL to enable drafting" if neither exists.
  - **Email drafts:** Full email format with subject line. Plain text only — no rich text, HTML, or images.
  - **LinkedIn drafts:** Shorter, more conversational, no subject line. Claude is instructed to write for LinkedIn's messaging format (typically 2-4 short paragraphs, under 300 words).
- Editable text area for revisions
- "Regenerate" button with optional steering input (free text guidance)
- **"Save as Voice Example"** button — saves the current draft text as a new voice example for the logged-in user, with the current channel pre-filled. User can optionally tag it with an archetype label (e.g., "cold outreach", "follow-up"). Bridges Bobby's existing workflow of maintaining a reusable message library.
- **Email send action:** "Create Gmail Draft" button — creates draft in user's Gmail, records touch as `drafted` with channel = `email`. If an existing draft touch exists for this contact+campaign, it is replaced via transactional upsert.
- **LinkedIn send action:** "Copy to Clipboard" button — copies the message text to clipboard and opens the contact's LinkedIn profile in a new browser tab, records touch as `drafted` with channel = `linkedin`. User pastes into LinkedIn manually.
- "Mark Sent" button — appears when a `drafted` touch exists; marks touch as `sent`, calculates next follow-up date per campaign cadence settings. **Skip is disabled** while a draft exists — the user must either Mark Sent or create a new draft (which replaces the old one) before skipping.
- "Skip" button — only enabled when no `drafted` touch exists for this contact+campaign. Records a `skipped` touch with a reason (optional free-text input), pushes `nextTouchDate` forward by 2 business days; does not consume a touch number.

After any action (draft, mark sent, skip), advances to the next contact in the queue.

### 4. Settings / Admin

- **Campaigns:** Create new campaign (name, type, campaign group, date, location, description, selling points, cadence intervals, max touches), edit details, toggle active/inactive
- **Import:** CSV upload for bulk contact import (one-time bootstrap + future additions)
- **Voice Examples:** Add/edit/delete example messages per channel per archetype, scoped to the logged-in user
- **CSV Export:** Download current contact data as CSV (escape valve for non-technical users)

## Context Assembly & Drafting

### Context Assembly

When a user opens the Contact Detail view (for a reachable contact), the app assembles a context profile from up to two sources:

**1. App DB:** Read contact metadata (including notes) and prior outreach touch metadata for the current campaign (touch number, date sent, channel, subject — for touches where state = `sent`). Note: `body` from outreach_touches is **not** included in the prompt for email touches — Gmail threads are the canonical source for actual email correspondence content, and draft-time text may diverge from what was actually sent. For LinkedIn touches, `body` IS included since there is no other source for LinkedIn message content.

**2. Gmail API (cross-user search) — only if contact has an email address:** Search all 3 recruiters' mailboxes (using stored OAuth tokens) for all correspondence with this contact. Query:
```
from:{contactEmail} OR to:{contactEmail}
```
Merge and deduplicate results by RFC 2822 `Message-ID` header (see Cross-Mailbox Deduplication above). Cached briefly per session. If a user hasn't logged in yet, their mailbox is skipped.

#### Gmail Context Limits

To keep prompt size manageable and build scope tight:

| Limit | Value |
|-------|-------|
| Max threads retrieved | 5 most recent |
| Max messages per thread | First message in thread (for context) + 3 most recent messages. For threads with 4 or fewer messages, include all. |
| Max characters per message | 2,000 (truncated with "..." if longer) |
| Total Gmail context budget | ~20,000 characters max across all threads |

If the total Gmail context exceeds the budget, older threads are dropped first. No summarization step — raw (truncated) message text is passed to Claude directly.

**3. Merge** both sources into a single structured context object.

### Claude Drafting Prompt Structure

The prompt sent to Claude includes:

1. **System prompt:** Who you are (Elion team), what you're doing (context from the campaign — e.g., "recruiting providers for Summer 2026 summit" or "following up on a sales conversation"), voice/tone guidance
2. **Voice examples:** The logged-in user's examples from the `voice_examples` table, filtered by `userId` and selected `channel`. If no examples exist for that channel, this section is omitted.
3. **Active campaign context:** Name, type, date, location, description, selling points
4. **Contact profile:** Name, org, title, and notes (free text capturing any non-email context — prior event attendance, in-person meetings, relationship context, etc.)
5. **Correspondence history:** Recent email threads from Gmail (truncated per limits above) — the full relationship history, not filtered by campaign. This is the canonical source of what was actually said via email.
6. **Outreach history this cycle (metadata + LinkedIn bodies):** For each sent touch in this campaign: touch number, date sent, channel, subject. For LinkedIn touches only: include `body` (draft-time text) since there is no Gmail record of LinkedIn messages. For email touches: bodies are NOT included — Gmail threads above already contain the actual sent content.
7. **Archetype guidance:** Claude infers the appropriate outreach archetype (cold outreach, warm re-engage, follow-up, introduction request) from the correspondence history, contact notes, and touch number — rather than the app assigning a rigid label. The prompt instructs: "Based on the correspondence history and context above, determine the appropriate tone and approach for this outreach."
8. **Channel instruction:**
   - **Email:** "Draft a personalized email with subject line. Plain text only. Be creative. Match the voice of the examples. Account for the full relationship context."
   - **LinkedIn:** "Draft a LinkedIn message. Keep it concise (2-4 short paragraphs, under 300 words). No subject line. More conversational and direct than email. Match the voice of the examples."

### Regeneration

When a user hits "Regenerate" with steering input, the same prompt is re-sent with the steering appended: "The user wants you to adjust the draft: [user's guidance]". A new draft is generated.

### No Templates

There are no rigid email templates. Claude gets archetype guidance and voice examples but is expected to craft each message based on the full context. This preserves the creativity and personalization that makes these outreach messages effective.

## Queue Progression Rules

### Follow-Up Cadence

When a touch is marked "sent," the app calculates the next follow-up date using the campaign's `cadenceDays` array:

| Touch # just sent | Default next follow-up in | Source |
|-------------------|--------------------------|--------|
| 1 (initial outreach) | 5 business days | `cadenceDays[0]` |
| 2 (first follow-up) | 7 business days | `cadenceDays[1]` |
| 3 (second follow-up) | 10 business days | `cadenceDays[2]` |
| 4+ (subsequent) | 14 business days | `cadenceDays[3]` (last value repeats for overflow) |

The user can override the calculated date inline before confirming. Cadence defaults are configurable per campaign in Settings via the `cadenceDays` field.

### Touch Limit

After the campaign's `maxTouches` (default 4) sent touches with no response, the contact's status is automatically set to `no_response` and they drop out of the active queue. The user can manually set status back to `in_progress` to reactivate.

### State Transitions

- **New contact added** → status `not_started`, no nextTouchDate until user sets one via Pipeline Overview or initiates outreach from Contact Detail
- **First draft created** → touch recorded as `drafted` (state `drafted`), status changes to `in_progress`, nextTouchDate unchanged
- **Mark Sent** → touch state flips to `sent`, nextTouchDate calculated per cadence table, contact remains `in_progress`
- **Skip** (no outstanding draft) → `skipped` touch recorded (touchNumber null) with optional reason, nextTouchDate pushed forward by 2 business days, status unchanged
- **Max touches reached** → status auto-set to `no_response`, nextTouchDate cleared, contact exits queue
- **Contact responds** (manually updated by user) → user sets status to `responded`, `confirmed`, `declined`, or `not_a_fit` as appropriate; nextTouchDate cleared; contact exits automatic queue

## Bootstrap & Setup

### One-Time Setup
1. Provision a PostgreSQL database (Cloud SQL, Neon, Supabase, or other managed provider) and note the connection string
2. Deploy app to Cloud Run with environment variables (DATABASE_URL, Attio API key (optional), Claude API key, Google OAuth client ID/secret)
3. Run Drizzle migrations to create schema
4. All 3 users sign in with Google OAuth (grants `gmail.compose` + `gmail.readonly`; tokens stored for cross-user search)

### Data Bootstrap

Bootstrap steps must run in this order:

1. **Create campaign records first:**
   - Active campaigns: "Summer 2026 — Provider Recruiting" and "Summer 2026 — Vendor Recruiting" (with type, campaignGroup = "Summer 2026", descriptions, selling points, cadence settings)

2. **Upload existing recruitment CSV** via the Import page. The import page includes a **campaign selector** — the user picks which campaign to import contacts into (e.g., "Summer 2026 — Provider Recruiting"). Import script maps columns:
   - Name, Organization, Title, Owner, Prospect?, POC, LinkedIn, Notes → `contacts` (the Notes field captures any context from the CSV — including prior attendance like "Attended Spring 2025, Winter 2025")
   - Spring 2025 Attendee, Winter 2025 Attendee → appended to `contacts.notes` as "Attended: Spring 2025, Winter 2025" (preserving the historical context without a separate table)
   - Status → mapped to nearest status enum value in `contact_campaign_status` for the selected campaign
   - Next Touch → `contact_campaign_status.nextTouchDate` for the selected campaign
   - If a contact already exists in the DB (matched by name + organization), the import updates the existing record rather than creating a duplicate. This allows re-importing for a different campaign.

3. **Create synthetic historical touches** for imported contacts that have a Last Touch date in the CSV. For each such contact:
   - Create one `outreach_touches` record with `campaignId = <selected campaign>`, `channel = 'email'`, `state = 'sent'`, `touchNumber = 1`, `sentAt = <Last Touch date from CSV>`, `createdAt = <import timestamp>`, `subject = '[Imported — no subject]'`, `body = null`, `createdBy = 'import'`
   - **This is an intentional approximation for bootstrap.** The CSV does not contain actual touch count, so all imported contacts with a Last Touch date are assigned `touchNumber = 1`. A contact who was actually at touch 3 will import as touch 1 — cadence and maxTouches behavior will be slightly off until the real touch count catches up. This is acceptable for hackweek; the Gmail correspondence history provides the true context to Claude regardless.
   - Contacts without a Last Touch date get no synthetic touches — their first draft will correctly be `touchNumber = 1`.

4. **Each user seeds their own voice examples** via the Settings page — 3-5 real examples per channel per archetype (email examples and LinkedIn message examples)

### Ongoing
- New contacts added through the app UI or CSV import
- New campaigns created through Settings
- Touch history accumulates as users draft and send messages

## Explicit Scope Cuts (v1)

These are not being built in the hackweek:

- **No auto-send** — drafts only; user sends from Gmail or pastes into LinkedIn
- **No scheduled/automated batch runs** — app fetches live on demand
- **No email notifications** — no "you have overdue follow-ups" alerts
- **No audit trail** — not logging approval history beyond touch records
- **No Attio correspondence** — Attio is optional metadata resolution only; all email context comes from Gmail
- **No Attio write-back** — agreed this is desirable (logging campaign participation), but deferred to post-hackweek
- **No roles/permissions** — all users are equal
- **No reply tracking** — we don't monitor whether the contact replied; status is updated manually by the user
- **No sent-message reconciliation** — the app stores draft-time text only; any edits the user makes in Gmail before sending are not captured back
- **No Gmail context summarization** — older messages are truncated, not summarized; keeps build simple
- **No rich text** — all drafts are plain text; no HTML formatting, images, or attachments
- **No Gmail scoping by campaign** — Gmail search returns all correspondence with the contact regardless of topic; Claude uses campaign context in the prompt to draft appropriately
- **No LinkedIn API integration** — LinkedIn does not offer a messaging API. LinkedIn outreach is draft + copy-to-clipboard + manual paste. The app tracks the touch but cannot create LinkedIn messages programmatically.
- **No LinkedIn correspondence history** — the app cannot read LinkedIn message history. For LinkedIn-only contacts, Claude drafts based on DB context (notes, outreach history) without correspondence history.
- **No A/B testing** — no systematic comparison of messaging approaches; future consideration
- **No contact sourcing** — list building / finding new contacts is outside the tool
- **No campaign prioritization** — if a contact is in multiple campaigns, cross-campaign priority is managed manually via `on_hold` status
