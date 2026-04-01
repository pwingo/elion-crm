# Multi-Email Contacts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow contacts to have additional email addresses so Gmail history search matches all their emails, not just the primary.

**Architecture:** New `contact_emails` table stores additional emails per contact. A helper function aggregates primary + additional emails. Gmail search, correspondence history, and reply sync all query the full list. UI provides inline add/remove on the contact detail page.

**Tech Stack:** Drizzle ORM, Supabase Postgres, Next.js App Router, React

**Spec:** `docs/superpowers/specs/2026-04-01-multi-email-contacts-design.md`

---

### Task 1: Database Migration + Schema

**Files:**
- Modify: `lib/schema.ts`
- Create: migration via `drizzle-kit generate`

- [ ] **Step 1: Add `contactEmails` table to schema**

In `lib/schema.ts`, add after the `contacts` table definition:

```typescript
export const contactEmails = pgTable(
  "contact_emails",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
  },
  (table) => [
    uniqueIndex("contact_emails_contact_email_idx").on(
      table.contactId,
      table.email,
    ),
    uniqueIndex("contact_emails_email_unique_idx").on(table.email),
  ],
);
```

Add relations:

```typescript
export const contactEmailsRelations = relations(contactEmails, ({ one }) => ({
  contact: one(contacts, {
    fields: [contactEmails.contactId],
    references: [contacts.id],
  }),
}));
```

Update `contactsRelations` to include:

```typescript
contactEmails: many(contactEmails),
```

- [ ] **Step 2: Generate migration**

Run: `npx drizzle-kit generate`

- [ ] **Step 3: Apply migration to Supabase**

Use `mcp__plugin_supabase_supabase__apply_migration` to apply the generated SQL.

- [ ] **Step 4: Commit**

```bash
git add lib/schema.ts drizzle/
git commit -m "feat: add contact_emails table for multi-email support"
```

---

### Task 2: Helper Function

**Files:**
- Create: `lib/contact-emails.ts`

- [ ] **Step 1: Create `getAllContactEmails` helper**

```typescript
import { db } from "@/lib/db";
import { contacts, contactEmails } from "@/lib/schema";
import { eq } from "drizzle-orm";

export async function getAllContactEmails(contactId: string): Promise<string[]> {
  const [contact] = await db
    .select({ email: contacts.email })
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .limit(1);

  const additional = await db
    .select({ email: contactEmails.email })
    .from(contactEmails)
    .where(eq(contactEmails.contactId, contactId));

  const emails: string[] = [];
  if (contact?.email) emails.push(contact.email);
  for (const row of additional) {
    emails.push(row.email);
  }
  return emails;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/contact-emails.ts
git commit -m "feat: add getAllContactEmails helper"
```

---

### Task 3: API Endpoint for Additional Emails

**Files:**
- Create: `app/api/contacts/[id]/emails/route.ts`

- [ ] **Step 1: Create GET, POST, DELETE handlers**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contacts, contactEmails } from "@/lib/schema";
import { requireUser } from "@/lib/auth";
import { eq, and } from "drizzle-orm";
import { isBlockedEmail } from "@/lib/env";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const rows = await db
    .select()
    .from(contactEmails)
    .where(eq(contactEmails.contactId, id));

  return NextResponse.json(rows);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!email || !email.includes("@") || email.length > 254) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  if (isBlockedEmail(email)) {
    return NextResponse.json({ error: "Email domain is not allowed" }, { status: 400 });
  }

  // Check it's not the primary email
  const [contact] = await db
    .select({ email: contacts.email })
    .from(contacts)
    .where(eq(contacts.id, id))
    .limit(1);

  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  if (contact.email?.toLowerCase() === email) {
    return NextResponse.json({ error: "This is already the primary email" }, { status: 400 });
  }

  // Insert (unique constraints handle duplicates)
  try {
    const [row] = await db
      .insert(contactEmails)
      .values({ contactId: id, email })
      .returning();
    return NextResponse.json(row, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("unique") || msg.includes("duplicate")) {
      return NextResponse.json({ error: "Email already exists" }, { status: 409 });
    }
    throw err;
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const emailId = body.emailId;

  if (!emailId) {
    return NextResponse.json({ error: "emailId is required" }, { status: 400 });
  }

  const deleted = await db
    .delete(contactEmails)
    .where(
      and(
        eq(contactEmails.id, emailId),
        eq(contactEmails.contactId, id),
      ),
    )
    .returning({ id: contactEmails.id });

  if (deleted.length === 0) {
    return NextResponse.json({ error: "Email not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/contacts/[id]/emails/route.ts
git commit -m "feat: add API endpoint for contact additional emails"
```

---

### Task 4: Update Gmail Search Functions

**Files:**
- Modify: `lib/gmail.ts`

- [ ] **Step 1: Update `searchUserMailbox` to accept `string[]`**

Change the signature from `(userId: string, contactEmail: string)` to `(userId: string, contactEmails: string[])`.

Build query: instead of `from:${contactEmail} OR to:${contactEmail}`, build a query across all emails:

```typescript
const clauses = contactEmails.flatMap((e) => [`from:${e}`, `to:${e}`]);
const query = clauses.join(" OR ");
```

- [ ] **Step 2: Update `getCorrespondenceHistory` to accept `string[]`**

Change the signature from `(contactEmail: string)` to `(contactEmails: string[])`.

Pass `contactEmails` to `searchUserMailbox` instead of single email.

Early return if `contactEmails.length === 0`.

- [ ] **Step 3: Commit**

```bash
git add lib/gmail.ts
git commit -m "feat: update Gmail search to query multiple emails per contact"
```

---

### Task 5: Update Gmail Callers

**Files:**
- Modify: `app/api/context/route.ts`
- Modify: `app/api/draft/route.ts`
- Modify: `app/api/batch-draft/route.ts`

- [ ] **Step 1: Update `context/route.ts`**

Import `getAllContactEmails` from `@/lib/contact-emails`. Replace:

```typescript
if (contact.email) {
  gmailThreads = await getCorrespondenceHistory(contact.email);
}
```

With:

```typescript
const allEmails = await getAllContactEmails(contactId);
if (allEmails.length > 0) {
  gmailThreads = await getCorrespondenceHistory(allEmails);
}
```

- [ ] **Step 2: Update `draft/route.ts`**

Same pattern — import `getAllContactEmails`, replace the `contact.email` check with `allEmails` lookup.

- [ ] **Step 3: Update `batch-draft/route.ts`**

Import `getAllContactEmails`. In the batch mapping function, replace:

```typescript
if (dc.contactEmail) {
  gmailThreads = await getCorrespondenceHistory(dc.contactEmail);
}
```

With:

```typescript
const allEmails = await getAllContactEmails(dc.contactId);
if (allEmails.length > 0) {
  gmailThreads = await getCorrespondenceHistory(allEmails);
}
```

- [ ] **Step 4: Commit**

```bash
git add app/api/context/route.ts app/api/draft/route.ts app/api/batch-draft/route.ts
git commit -m "feat: pass all contact emails to correspondence history lookups"
```

---

### Task 6: Update sync-replies

**Files:**
- Modify: `app/api/queue/sync-replies/route.ts`

- [ ] **Step 1: Import helper and update email matching**

Import `getAllContactEmails` from `@/lib/contact-emails`.

After loading the contact in the loop, fetch all emails:

```typescript
const allEmails = await getAllContactEmails(contact.id);
const allEmailsLower = new Set(allEmails.map((e) => e.toLowerCase()));
```

Update the Gmail search query (line ~192) from `from:${contact.email}` to build a multi-email query:

```typescript
const fromClauses = allEmails.map((e) => `from:${e}`).join(" OR ");
q: `(${fromClauses}) after:${afterEpoch}`,
```

Update `findLatestReplyInMessages` to accept a `Set<string>` instead of a single `contactEmailLower`:

```typescript
function findLatestReplyInMessages(
  messages: GmailMessageLike[],
  contactEmailsLower: Set<string>,
  afterMs: number,
)
```

And change the `from` check from `from.includes(contactEmailLower)` to:

```typescript
const fromMatch = [...contactEmailsLower].some((e) => from.includes(e));
if (!fromMatch) continue;
```

Update the call site to pass `allEmailsLower` instead of `contactEmailLower`.

- [ ] **Step 2: Commit**

```bash
git add app/api/queue/sync-replies/route.ts
git commit -m "feat: sync-replies matches against all contact emails"
```

---

### Task 7: UI — Additional Emails on Contact Detail

**Files:**
- Modify: `components/ContactDetail.tsx`

- [ ] **Step 1: Add state and handlers for additional emails**

Add to the `ContactDetailProps` interface:

```typescript
additionalEmails: Array<{ id: string; email: string }>;
onAddEmail: (email: string) => Promise<void>;
onRemoveEmail: (emailId: string) => Promise<void>;
```

Add state inside the component:

```typescript
const [newEmail, setNewEmail] = useState("");
const [addingEmail, setAddingEmail] = useState(false);
const [emailError, setEmailError] = useState("");
```

- [ ] **Step 2: Add the additional emails UI section**

After the primary Email `EditableField` and before the LinkedIn field, add:

```tsx
{/* Additional emails */}
<div className="ml-0">
  {additionalEmails.map((ae) => (
    <div key={ae.id} className="flex items-center gap-2 mt-1">
      <span className="text-sm text-gray-600">{ae.email}</span>
      <button
        type="button"
        onClick={() => onRemoveEmail(ae.id)}
        className="text-xs text-gray-400 hover:text-red-500"
      >
        &times;
      </button>
    </div>
  ))}
  {addingEmail ? (
    <div className="flex items-center gap-2 mt-1">
      <input
        autoFocus
        type="email"
        value={newEmail}
        onChange={(e) => { setNewEmail(e.target.value); setEmailError(""); }}
        placeholder="email@example.com"
        className="text-sm border border-[var(--primary)] rounded px-2 py-1 focus:outline-none flex-1"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleAddEmail();
          } else if (e.key === "Escape") {
            setAddingEmail(false);
            setNewEmail("");
            setEmailError("");
          }
        }}
      />
      <button
        type="button"
        onClick={handleAddEmail}
        className="text-xs text-[var(--primary)] font-medium hover:underline"
      >
        Save
      </button>
      <button
        type="button"
        onClick={() => { setAddingEmail(false); setNewEmail(""); setEmailError(""); }}
        className="text-xs text-gray-400 hover:text-gray-600"
      >
        Cancel
      </button>
    </div>
  ) : (
    <button
      type="button"
      onClick={() => setAddingEmail(true)}
      className="text-xs text-[var(--primary)] hover:underline mt-1"
    >
      + Add email
    </button>
  )}
  {emailError && <p className="text-xs text-red-500 mt-0.5">{emailError}</p>}
</div>
```

Add the handler function:

```typescript
async function handleAddEmail() {
  const trimmed = newEmail.trim().toLowerCase();
  if (!trimmed || !trimmed.includes("@")) {
    setEmailError("Enter a valid email address");
    return;
  }
  try {
    await onAddEmail(trimmed);
    setNewEmail("");
    setAddingEmail(false);
    setEmailError("");
  } catch (err: unknown) {
    setEmailError(err instanceof Error ? err.message : "Failed to add email");
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add components/ContactDetail.tsx
git commit -m "feat: add additional emails UI to contact detail"
```

---

### Task 8: Wire Up Parent Page

**Files:**
- Modify: `app/contacts/[contactId]/[campaignId]/page.tsx`

- [ ] **Step 1: Add state and fetch/mutate functions for additional emails**

Add state:

```typescript
const [additionalEmails, setAdditionalEmails] = useState<Array<{ id: string; email: string }>>([]);
```

Fetch on load (in the existing useEffect or after it):

```typescript
fetch(`/api/contacts/${contactId}/emails`)
  .then((r) => r.json())
  .then(setAdditionalEmails)
  .catch(console.error);
```

Add handlers:

```typescript
async function handleAddEmail(email: string) {
  const res = await fetch(`/api/contacts/${contactId}/emails`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error ?? "Failed to add email");
  }
  const row = await res.json();
  setAdditionalEmails((prev) => [...prev, row]);
}

async function handleRemoveEmail(emailId: string) {
  const res = await fetch(`/api/contacts/${contactId}/emails`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ emailId }),
  });
  if (!res.ok) return;
  setAdditionalEmails((prev) => prev.filter((e) => e.id !== emailId));
}
```

Pass to `ContactDetail`:

```tsx
<ContactDetail
  ...existing props
  additionalEmails={additionalEmails}
  onAddEmail={handleAddEmail}
  onRemoveEmail={handleRemoveEmail}
/>
```

- [ ] **Step 2: Commit**

```bash
git add app/contacts/[contactId]/[campaignId]/page.tsx
git commit -m "feat: wire additional emails to contact detail page"
```

---

### Task 9: Verify + Final Commit

- [ ] **Step 1: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Run dev server smoke test**

Run: `npx next build` or start dev server, navigate to a contact, verify additional emails section renders.

- [ ] **Step 3: Manually test with Remi**

Add `RTurley@stanfordhealthcare.org` as an additional email for Remi. Verify Gmail correspondence loads threads from both addresses.
