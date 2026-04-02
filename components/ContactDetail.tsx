"use client";

import { useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Contact {
  id: string;
  name: string;
  organization: string;
  title: string | null;
  email: string | null;
  linkedinUrl: string | null;
  notes: string | null;
}

interface Touch {
  id: string;
  touchNumber: number | null;
  channel: "email" | "linkedin";
  state: "drafted" | "sent" | "skipped" | "received";
  subject: string | null;
  sentAt: string | null;
  draftCreatedAt: string | null;
  createdAt: string | null;
  createdBy: string;
}

interface GmailMessage {
  messageId: string;
  from: string;
  to: string;
  cc: string;
  date: string;
  subject: string;
  body: string;
}

interface GmailThread {
  subject: string;
  messages: GmailMessage[];
}

interface ContactDetailProps {
  contact: Contact;
  touches: Touch[];
  gmailThreads: GmailThread[];
  nextTouchDate: string | null;
  onUpdateContact: (field: Partial<Contact>) => Promise<void>;
  onUpdateNextTouchDate: (date: string | null) => Promise<void>;
  additionalEmails: Array<{ id: string; email: string }>;
  onAddEmail: (email: string) => Promise<string | void>;
  onRemoveEmail: (emailId: string) => Promise<void>;
  onUndoSent: (touchId: string) => Promise<void>;
}

// ─── State badge ──────────────────────────────────────────────────────────────

const stateBadgeClass: Record<string, string> = {
  sent: "bg-green-100 text-green-700",
  drafted: "bg-yellow-100 text-yellow-700",
  skipped: "bg-gray-100 text-gray-500",
  received: "bg-purple-100 text-purple-700",
};

function StateBadge({ state }: { state: string }) {
  const colorClass = stateBadgeClass[state] ?? "bg-gray-100 text-gray-500";
  const label = state.charAt(0).toUpperCase() + state.slice(1);
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colorClass}`}
    >
      {label}
    </span>
  );
}

// ─── Editable inline field ────────────────────────────────────────────────────

function EditableField({
  label,
  value,
  placeholder,
  onSave,
  type = "text",
}: {
  label: string;
  value: string | null;
  placeholder: string;
  onSave: (val: string) => void;
  type?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  function handleBlur() {
    setEditing(false);
    if (draft !== (value ?? "")) {
      onSave(draft);
    }
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-gray-400">{label}</span>
        <input
          autoFocus
          type={type}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleBlur}
          className="text-sm border border-[var(--primary)] rounded px-2 py-1 focus:outline-none w-full"
        />
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-0.5 cursor-pointer group"
      onClick={() => setEditing(true)}
    >
      <span className="text-xs text-gray-400">{label}</span>
      {value ? (
        <span className="text-sm text-gray-800 group-hover:text-[var(--primary)] transition-colors">
          {value}
        </span>
      ) : (
        <span className="text-sm text-amber-600 italic group-hover:text-amber-700 transition-colors">
          {placeholder}
        </span>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ContactDetail({
  contact,
  touches,
  gmailThreads,
  nextTouchDate,
  onUpdateContact,
  onUpdateNextTouchDate,
  additionalEmails,
  onAddEmail,
  onRemoveEmail,
  onUndoSent,
}: ContactDetailProps) {
  const [notes, setNotes] = useState(contact.notes ?? "");
  const [notesTimeout, setNotesTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [addingEmail, setAddingEmail] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [recentlyAddedId, setRecentlyAddedId] = useState<string | null>(null);

  async function handleAddEmail() {
    const trimmed = newEmail.trim().toLowerCase();
    if (!trimmed || !trimmed.includes("@")) {
      setEmailError("Enter a valid email address");
      return;
    }
    setSavingEmail(true);
    try {
      const addedId = await onAddEmail(trimmed);
      setNewEmail("");
      setAddingEmail(false);
      setEmailError("");
      if (addedId) {
        setRecentlyAddedId(addedId);
        setTimeout(() => setRecentlyAddedId(null), 2000);
      }
    } catch (err: unknown) {
      setEmailError(err instanceof Error ? err.message : "Failed to add email");
    } finally {
      setSavingEmail(false);
    }
  }

  function handleNotesSave() {
    if (notes !== (contact.notes ?? "")) {
      onUpdateContact({ notes });
    }
  }

  function handleNotesChange(val: string) {
    setNotes(val);
    if (notesTimeout) clearTimeout(notesTimeout);
    const t = setTimeout(() => {
      if (val !== (contact.notes ?? "")) {
        onUpdateContact({ notes: val });
      }
    }, 1500);
    setNotesTimeout(t);
  }

  const sortedTouches = [...touches].sort((a, b) => {
    const aDate = a.createdAt ?? "";
    const bDate = b.createdAt ?? "";
    return bDate.localeCompare(aDate);
  });

  return (
    <div className="flex flex-col gap-6">
      {/* ── Contact metadata ─────────────────────────────────────────────── */}
      <section>
        <div className="grid grid-cols-1 gap-2">
          <EditableField
            label="Name"
            value={contact.name}
            placeholder="Contact name"
            onSave={(val) => { if (val.trim()) onUpdateContact({ name: val.trim() }); }}
          />
          <EditableField
            label="Organization"
            value={contact.organization}
            placeholder="Organization"
            onSave={(val) => { if (val.trim()) onUpdateContact({ organization: val.trim() }); }}
          />
          <EditableField
            label="Title"
            value={contact.title}
            placeholder="Click to add title"
            onSave={(val) => onUpdateContact({ title: val || null })}
          />
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3">
          <EditableField
            label="Email"
            value={contact.email}
            placeholder="Click to add email"
            type="email"
            onSave={(val) => onUpdateContact({ email: val || null })}
          />
          {/* Additional emails */}
          <div className="ml-0">
            {additionalEmails.map((ae) => (
              <div key={ae.id} className={`flex items-center gap-2 mt-1 transition-colors duration-500 ${recentlyAddedId === ae.id ? "bg-green-50 rounded px-1 -mx-1" : ""}`}>
                {recentlyAddedId === ae.id && (
                  <span className="text-green-600 text-xs">&#10003;</span>
                )}
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
                  disabled={savingEmail}
                  className="text-xs text-[var(--primary)] font-medium hover:underline disabled:opacity-50"
                >
                  {savingEmail ? "Saving…" : "Save"}
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
          <EditableField
            label="LinkedIn"
            value={contact.linkedinUrl}
            placeholder="Click to add LinkedIn URL"
            onSave={(val) => onUpdateContact({ linkedinUrl: val || null })}
          />
          {contact.linkedinUrl && (
            <a
              href={contact.linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[var(--primary)] hover:underline w-fit"
            >
              Open LinkedIn profile
            </a>
          )}
        </div>
      </section>

      {/* ── Next touch date ───────────────────────────────────────────────── */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-1.5">
          Next Touch
        </h3>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={nextTouchDate ?? ""}
            onChange={(e) => onUpdateNextTouchDate(e.target.value || null)}
            className="text-sm border border-[var(--border)] rounded px-3 py-1.5 focus:outline-none focus:border-[var(--primary)] text-gray-800"
          />
          {nextTouchDate && (
            <button
              type="button"
              onClick={() => onUpdateNextTouchDate(null)}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Clear
            </button>
          )}
        </div>
      </section>

      {/* ── Notes ────────────────────────────────────────────────────────── */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-1.5">
          Notes
        </h3>
        <textarea
          value={notes}
          onChange={(e) => handleNotesChange(e.target.value)}
          onBlur={handleNotesSave}
          rows={4}
          placeholder="Add notes about this contact…"
          className="w-full text-sm border border-[var(--border)] rounded px-3 py-2 resize-none focus:outline-none focus:border-[var(--primary)] text-gray-800 placeholder:text-gray-400"
        />
      </section>

      {/* ── Gmail correspondence ─────────────────────────────────────────── */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-1.5">
          Gmail Correspondence
        </h3>
        {!contact.email ? (
          <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            No email correspondence available — add an email to view history.
          </p>
        ) : !gmailThreads || gmailThreads.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No Gmail threads found.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {gmailThreads.map((thread, idx) => (
              <details
                key={idx}
                className="border border-[var(--border)] rounded overflow-hidden"
              >
                <summary className="px-3 py-2 bg-gray-50 cursor-pointer text-sm font-medium text-gray-800 hover:bg-gray-100 transition-colors select-none flex items-center justify-between">
                  <span className="truncate">{thread.subject || "(no subject)"}</span>
                  <span className="ml-2 shrink-0 text-xs text-gray-400 font-normal">
                    {thread.messages.length}{" "}
                    {thread.messages.length === 1 ? "message" : "messages"}
                    {(() => {
                      const latest = thread.messages[thread.messages.length - 1]?.date;
                      if (!latest) return null;
                      const d = new Date(latest);
                      if (isNaN(d.getTime())) return <> · {latest}</>;
                      return <> · {d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</>;
                    })()}
                  </span>
                </summary>
                <div className="divide-y divide-[var(--border)]">
                  {[...thread.messages].reverse().map((msg) => (
                    <div key={msg.messageId} className="px-3 py-2">
                      <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                        <span className="font-medium text-gray-700 truncate">
                          {msg.from}
                        </span>
                        <span className="ml-2 shrink-0">{msg.date}</span>
                      </div>
                      <div className="text-xs text-gray-400 mb-1 space-y-0.5">
                        <div className="truncate"><span className="text-gray-500">To:</span> {msg.to}</div>
                        {msg.cc && <div className="truncate"><span className="text-gray-500">Cc:</span> {msg.cc}</div>}
                      </div>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">
                        {msg.body}
                      </p>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        )}
      </section>

      {/* ── Outreach history ─────────────────────────────────────────────── */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-1.5">
          Outreach History
        </h3>
        {sortedTouches.filter((t) => t.createdBy !== "import").length === 0 ? (
          <p className="text-sm text-gray-400 italic">No outreach yet.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {sortedTouches.filter((t) => t.createdBy !== "import").map((touch) => {
              const dateStr = touch.sentAt ?? touch.draftCreatedAt ?? touch.createdAt;
              const displayDate = dateStr
                ? new Date(dateStr).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : "—";

              return (
                <div
                  key={touch.id}
                  className="flex items-center gap-3 text-sm border border-[var(--border)] rounded px-3 py-2"
                >
                  {touch.touchNumber != null && (
                    <span className="shrink-0 w-6 h-6 rounded-full bg-gray-100 text-gray-600 text-xs font-semibold flex items-center justify-center">
                      {touch.touchNumber}
                    </span>
                  )}
                  <span className="shrink-0 text-xs text-gray-400">{displayDate}</span>
                  <span className="shrink-0 capitalize text-xs text-gray-600 font-medium">
                    {touch.channel}
                  </span>
                  {touch.subject && (
                    <span className="truncate text-gray-700 flex-1">{touch.subject}</span>
                  )}
                  <div className="shrink-0 ml-auto flex items-center gap-2">
                    <StateBadge state={touch.state} />
                    {touch.state === "sent" && (
                      <button
                        type="button"
                        onClick={() => onUndoSent(touch.id)}
                        className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                      >
                        Undo
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
