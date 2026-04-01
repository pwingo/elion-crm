# Multi-Email Support for Contacts

## Problem

Contacts often have multiple email addresses (e.g., personal Gmail and work email). The platform currently stores a single `email` field per contact, so Gmail history search only finds threads matching that one address. Emails sent to or from other addresses are invisible to the system.

## Design

### Data Model

New table `contact_emails`:

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | text (UUID) | PK |
| `contact_id` | text | FK → contacts.id, cascade delete, not null |
| `email` | text | not null |

Constraints:
- `UNIQUE(contact_id, email)` — no duplicate emails per contact
- `UNIQUE(email)` — no two contacts share the same additional email

The existing `contacts.email` field is unchanged. It remains the **primary** email used for outreach and draft creation. The `contact_emails` table holds only additional emails used for Gmail history matching.

### API

New endpoint at `app/api/contacts/[id]/emails/route.ts`:

- **GET** — returns all additional emails for a contact
- **POST** `{ email: string }` — adds an additional email. Validates:
  - Contains "@"
  - Not longer than 254 characters
  - Not a blocked domain (uses existing `isBlockedEmail`)
  - Not a duplicate of the primary email or an existing additional email
  - Not claimed by another contact
- **DELETE** `{ emailId: string }` — removes an additional email by id

### Helper Function

New utility `getAllContactEmails(contactId: string): Promise<string[]>` that returns the primary email plus all additional emails as a flat array. Lives in a new `lib/contact-emails.ts` file to avoid bloating `lib/gmail.ts`.

### Gmail Search Changes

**`searchUserMailbox`** (`lib/gmail.ts`):
- Signature changes from `(userId, contactEmail: string)` to `(userId, contactEmails: string[])`
- Builds query: `from:a@x.com OR to:a@x.com OR from:b@y.com OR to:b@y.com` across all emails

**`getCorrespondenceHistory`** (`lib/gmail.ts`):
- Signature changes from `(contactEmail: string)` to `(contactEmails: string[])`
- Passes full array to `searchUserMailbox`

**Callers** (`app/api/context/route.ts`, `app/api/draft/route.ts`):
- Use `getAllContactEmails(contactId)` to get the full email list before calling `getCorrespondenceHistory`

**`sync-replies/route.ts`**:
- The `from:${contact.email} after:${afterEpoch}` query expands to include all additional emails
- The `from` header matching in `findLatestReplyInMessages` checks against all emails (lowercased set)

### UI Changes

**Contact Detail page** (`components/ContactDetail.tsx`):
- Below the primary email field, add an "Additional Emails" section
- Each additional email displays as a row with email text and an "x" remove button
- "Add email" link at the bottom expands an inline text input + save button
- Validation matches the API rules (format, blocked domains, uniqueness)

**No changes to:**
- Campaign contact list views (show primary email only)
- CSV import/export (primary email only)
- `EditContactSlideOver` or `CampaignContactSlideOver`
- Contact list/search pages
- Draft creation or outreach sending (uses primary email only)

## Out of Scope

- Auto-discovering additional emails from Gmail thread headers
- Choosing which email to send outreach to per campaign/draft
- Migrating any existing data (users add additional emails manually)
