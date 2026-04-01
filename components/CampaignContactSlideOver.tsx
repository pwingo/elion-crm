"use client";

import { useCallback, useEffect, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ContactRow {
  id: string;
  name: string;
  organization: string;
  title: string | null;
  email: string | null;
  linkedinUrl: string | null;
  owner: string;
  statusId: string;
  campaignId: string;
  campaignName: string;
  status: string;
  nextTouchDate: string | null;
  doNotContact: boolean;
  touchCount: number;
  draftsPending: number;
  lastChannel: string | null;
  lastTouch: string | null;
  daysSinceContact: number | null;
}

interface Touch {
  id: string;
  touchNumber: number | null;
  channel: "email" | "linkedin";
  state: "drafted" | "sent" | "skipped";
  subject: string | null;
  body: string | null;
  sentAt: string | null;
  draftCreatedAt: string | null;
  createdAt: string | null;
  createdBy: string;
}

interface GmailMessage {
  messageId: string;
  from: string;
  to: string;
  date: string;
  subject: string;
  body: string;
}

interface GmailThread {
  subject: string;
  messages: GmailMessage[];
}

interface CampaignContactSlideOverProps {
  contact: ContactRow;
  allContacts?: ContactRow[];
  onClose: () => void;
  onSaved: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onNavigate?: (contact: any) => void;
}

const STATUS_OPTIONS = [
  { value: "not_started", label: "Not Started" },
  { value: "in_progress", label: "In Progress" },
  { value: "responded", label: "Responded" },
  { value: "confirmed", label: "Confirmed" },
  { value: "declined", label: "Declined" },
  { value: "no_response", label: "No Response" },
  { value: "on_hold", label: "On Hold" },
  { value: "not_a_fit", label: "Not a Fit" },
] as const;

const OWNERS = ["Patrick", "Bobby", "Jeremy"];

const stateBadgeClass: Record<string, string> = {
  sent: "bg-green-100 text-green-700",
  drafted: "bg-yellow-100 text-yellow-700",
  skipped: "bg-gray-100 text-gray-500",
};

// ─── Component ────────────────────────────────────────────────────────────────

export function CampaignContactSlideOver({ contact, allContacts, onClose, onSaved, onNavigate }: CampaignContactSlideOverProps) {
  const [visible, setVisible] = useState(false);

  // Prev/next navigation
  const currentIndex = allContacts?.findIndex((c) => c.id === contact.id) ?? -1;
  const prevContact = allContacts && currentIndex > 0 ? allContacts[currentIndex - 1] : null;
  const nextContact = allContacts && currentIndex >= 0 && currentIndex < allContacts.length - 1 ? allContacts[currentIndex + 1] : null;

  // Campaign status fields
  const [status, setStatus] = useState(contact.status);
  const [nextTouchDate, setNextTouchDate] = useState(contact.nextTouchDate ?? "");
  const [doNotContact, setDoNotContact] = useState(contact.doNotContact);

  // Contact fields
  const [email, setEmail] = useState(contact.email ?? "");
  const [linkedinUrl, setLinkedinUrl] = useState(contact.linkedinUrl ?? "");
  const [owner, setOwner] = useState(contact.owner);
  const [notes, setNotes] = useState("");

  // Context data (loaded async)
  const [touches, setTouches] = useState<Touch[]>([]);
  const [gmailThreads, setGmailThreads] = useState<GmailThread[]>([]);
  const [loadingContext, setLoadingContext] = useState(true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Animate in
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  // Load context (touches, gmail, notes)
  const fetchContext = useCallback(async () => {
    setLoadingContext(true);
    try {
      const res = await fetch(
        `/api/context?contactId=${encodeURIComponent(contact.id)}&campaignId=${encodeURIComponent(contact.campaignId)}`,
      );
      if (res.ok) {
        const json = await res.json();
        setTouches(json.touches ?? []);
        setGmailThreads(json.gmailThreads ?? []);
        setNotes(json.contact?.notes ?? "");
      }
    } catch {
      // non-critical
    } finally {
      setLoadingContext(false);
    }
  }, [contact.id, contact.campaignId]);

  useEffect(() => {
    fetchContext();
  }, [fetchContext]);

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 200);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      // Save campaign status
      const statusRes = await fetch(`/api/campaign-status/${contact.statusId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          nextTouchDate: nextTouchDate || null,
          doNotContact,
        }),
      });
      if (!statusRes.ok) {
        const body = await statusRes.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to save status");
      }

      // Save contact fields
      const contactRes = await fetch(`/api/contacts/${contact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim() || null,
          linkedinUrl: linkedinUrl.trim() || null,
          owner,
          notes: notes.trim() || null,
        }),
      });
      if (!contactRes.ok) {
        const body = await contactRes.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to save contact");
      }

      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const sortedTouches = [...touches]
    .filter((t) => t.createdBy !== "import")
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black transition-opacity duration-200 z-40 ${visible ? "opacity-30" : "opacity-0"}`}
        onClick={handleClose}
      />

      {/* Panel */}
      <div
        className={`fixed inset-y-0 right-0 w-full max-w-lg bg-white shadow-xl z-50 flex flex-col transition-transform duration-200 ${visible ? "translate-x-0" : "translate-x-full"}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">{contact.name}</h2>
            <p className="text-sm text-gray-500">
              {contact.organization}
              {contact.title ? ` · ${contact.title}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Prev/Next navigation */}
            {onNavigate && allContacts && allContacts.length > 1 && (
              <div className="flex items-center gap-1 mr-2">
                <button
                  type="button"
                  onClick={() => prevContact && onNavigate(prevContact)}
                  disabled={!prevContact}
                  className="px-2 py-1 rounded text-xs font-medium text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                  title="Previous contact"
                >
                  &larr; Prev
                </button>
                <span className="text-xs text-gray-400">
                  {currentIndex + 1}/{allContacts.length}
                </span>
                <button
                  type="button"
                  onClick={() => nextContact && onNavigate(nextContact)}
                  disabled={!nextContact}
                  className="px-2 py-1 rounded text-xs font-medium text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                  title="Next contact"
                >
                  Next &rarr;
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            >
              &times;
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* ── Campaign Status ─────────────────────────────────────────── */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
              Campaign Status
            </h3>
            <div className="space-y-3">
              <div>
                <label htmlFor="ccs-status" className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  id="ccs-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="ccs-next-touch" className="block text-sm font-medium text-gray-700 mb-1">Next Touch Date</label>
                <input
                  id="ccs-next-touch"
                  type="date"
                  value={nextTouchDate}
                  onChange={(e) => setNextTouchDate(e.target.value)}
                  className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={doNotContact}
                  onChange={(e) => setDoNotContact(e.target.checked)}
                  className="rounded border-gray-300 accent-[var(--primary)]"
                />
                Do Not Contact
              </label>
            </div>
          </section>

          {/* ── Contact Info ────────────────────────────────────────────── */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
              Contact Info
            </h3>
            <div className="space-y-3">
              <div>
                <label htmlFor="ccs-email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  id="ccs-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Add email…"
                  className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                />
              </div>
              <div>
                <label htmlFor="ccs-linkedin" className="block text-sm font-medium text-gray-700 mb-1">LinkedIn URL</label>
                <input
                  id="ccs-linkedin"
                  type="url"
                  value={linkedinUrl}
                  onChange={(e) => setLinkedinUrl(e.target.value)}
                  placeholder="Add LinkedIn URL…"
                  className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                />
              </div>
              <div>
                <label htmlFor="ccs-owner" className="block text-sm font-medium text-gray-700 mb-1">Owner</label>
                <select
                  id="ccs-owner"
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                  className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                >
                  {OWNERS.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* ── Notes ──────────────────────────────────────────────────── */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-1.5">
              Notes
            </h3>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Add notes…"
              className="w-full text-sm border border-[var(--border)] rounded px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-[var(--primary)] placeholder:text-gray-400"
            />
          </section>

          {/* ── Gmail Correspondence ───────────────────────────────────── */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-1.5">
              Gmail Correspondence
            </h3>
            {loadingContext ? (
              <p className="text-sm text-gray-400">Loading…</p>
            ) : !contact.email ? (
              <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                No email — add one to view correspondence.
              </p>
            ) : gmailThreads.length === 0 ? (
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
                        {thread.messages.length} {thread.messages.length === 1 ? "msg" : "msgs"}
                      </span>
                    </summary>
                    <div className="divide-y divide-[var(--border)]">
                      {[...thread.messages].reverse().map((msg) => (
                        <div key={msg.messageId} className="px-3 py-2">
                          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                            <span className="font-medium text-gray-700 truncate">{msg.from}</span>
                            <span className="ml-2 shrink-0">{msg.date}</span>
                          </div>
                          <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{msg.body}</p>
                        </div>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            )}
          </section>

          {/* ── Outreach History ───────────────────────────────────────── */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-1.5">
              Outreach History
            </h3>
            {loadingContext ? (
              <p className="text-sm text-gray-400">Loading…</p>
            ) : sortedTouches.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No outreach yet.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {sortedTouches.map((touch) => {
                  const dateStr = touch.sentAt ?? touch.draftCreatedAt ?? touch.createdAt;
                  const displayDate = dateStr
                    ? new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
                    : "—";
                  const badgeClass = stateBadgeClass[touch.state] ?? "bg-gray-100 text-gray-500";
                  const stateLabel = touch.state.charAt(0).toUpperCase() + touch.state.slice(1);

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
                      <span className="shrink-0 capitalize text-xs text-gray-600 font-medium">{touch.channel}</span>
                      {touch.subject && (
                        <span className="truncate text-gray-700 flex-1">{touch.subject}</span>
                      )}
                      <span className={`shrink-0 ml-auto inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${badgeClass}`}>
                        {stateLabel}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--border)]">
          <button
            type="button"
            onClick={async () => {
              if (!confirm("Remove this contact from the campaign? This will also delete all associated touches.")) return;
              try {
                const res = await fetch(`/api/campaign-status/${contact.statusId}`, { method: "DELETE" });
                if (!res.ok) {
                  const body = await res.json().catch(() => ({}));
                  throw new Error(body.error ?? "Failed to remove");
                }
                onSaved();
              } catch (err) {
                alert(err instanceof Error ? err.message : "Failed to remove");
              }
            }}
            className="text-sm text-red-500 hover:text-red-700 hover:underline"
          >
            Remove from campaign
          </button>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-[var(--primary)] text-white text-sm font-medium rounded hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
