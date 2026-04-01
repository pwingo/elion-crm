"use client";

import { useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Channel = "email" | "linkedin";

interface DraftPanelProps {
  contactId: string;
  campaignId: string;
  contactEmail: string | null;
  contactLinkedinUrl: string | null;
  hasDraft: boolean;
  existingDraftTouchId: string | null;
  existingDraftSubject: string | null;
  existingDraftBody: string | null;
  existingDraftChannel: "email" | "linkedin" | null;
  onAction: (actionType: "drafted" | "sent" | "skipped") => void;
}

// ─── Channel toggle logic ─────────────────────────────────────────────────────

function resolveDefaultChannel(
  hasEmail: boolean,
  hasLinkedin: boolean,
): Channel | null {
  if (hasEmail) return "email";
  if (hasLinkedin) return "linkedin";
  return null;
}

function isChannelEnabled(channel: Channel, hasEmail: boolean, hasLinkedin: boolean): boolean {
  if (channel === "email") return hasEmail;
  if (channel === "linkedin") return hasLinkedin;
  return false;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DraftPanel({
  contactId,
  campaignId,
  contactEmail,
  contactLinkedinUrl,
  hasDraft,
  existingDraftTouchId,
  existingDraftSubject,
  existingDraftBody,
  existingDraftChannel,
  onAction,
}: DraftPanelProps) {
  const hasEmail = Boolean(contactEmail);
  const hasLinkedin = Boolean(contactLinkedinUrl);
  const hasAny = hasEmail || hasLinkedin;

  const defaultChannel = existingDraftChannel ?? resolveDefaultChannel(hasEmail, hasLinkedin);

  const [channel, setChannel] = useState<Channel>(defaultChannel ?? "email");
  const [steering, setSteering] = useState("");
  const [subject, setSubject] = useState(existingDraftSubject ?? "");
  const [body, setBody] = useState(existingDraftBody ?? "");
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  // ── Generate draft ──────────────────────────────────────────────────────────

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await fetch("/api/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId, campaignId, channel, steering: steering || undefined }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(`Error generating draft: ${err.error ?? "Unknown error"}`);
        return;
      }

      const data = await res.json();
      setSubject(data.subject ?? "");
      setBody(data.body ?? "");
    } finally {
      setGenerating(false);
    }
  }

  // ── Create Gmail draft ──────────────────────────────────────────────────────

  async function handleCreateGmailDraft() {
    if (!contactEmail) return;
    setSubmitting(true);
    try {
      // 1. Record touch in DB first (source of truth)
      const touchRes = await fetch("/api/touches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId,
          campaignId,
          channel: "email",
          state: "drafted",
          subject,
          messageBody: body,
        }),
      });

      if (!touchRes.ok) {
        const err = await touchRes.json().catch(() => ({}));
        showToast(`Error saving draft: ${err.error ?? "Unknown error"}`);
        return;
      }

      // 2. Create Gmail draft as side effect
      const gmailRes = await fetch("/api/gmail/create-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: contactEmail, subject, body }),
      });

      if (!gmailRes.ok) {
        showToast("Draft saved but Gmail draft creation failed — you can copy the text manually.");
      } else {
        showToast("Gmail draft created.");
      }

      onAction("drafted");
    } finally {
      setSubmitting(false);
    }
  }

  // ── LinkedIn copy + open ────────────────────────────────────────────────────

  async function handleLinkedInAction() {
    if (!contactLinkedinUrl) return;
    setSubmitting(true);
    try {
      await navigator.clipboard.writeText(body);
      window.open(contactLinkedinUrl, "_blank", "noopener,noreferrer");

      const touchRes = await fetch("/api/touches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId,
          campaignId,
          channel: "linkedin",
          state: "drafted",
          messageBody: body,
        }),
      });

      if (!touchRes.ok) {
        const err = await touchRes.json().catch(() => ({}));
        showToast(`Copied to clipboard, but touch record failed: ${err.error ?? "Unknown error"}`);
      } else {
        showToast("Copied to clipboard. LinkedIn opened in new tab.");
        onAction("drafted");
      }
    } finally {
      setSubmitting(false);
    }
  }

  // ── Mark sent ───────────────────────────────────────────────────────────────

  async function handleMarkSent() {
    if (!existingDraftTouchId) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/touches/${existingDraftTouchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: "sent" }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(`Error marking sent: ${err.error ?? "Unknown error"}`);
        return;
      }

      showToast("Marked as sent.");
      onAction("sent");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Save as voice example ───────────────────────────────────────────────────

  async function handleSaveVoiceExample() {
    const archetype = window.prompt("Enter archetype label for this voice example (e.g. 'warm intro', 'follow-up'):");
    if (archetype === null) return; // user cancelled

    setSubmitting(true);
    try {
      const res = await fetch("/api/voice-examples", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          subject: channel === "email" ? subject : undefined,
          body,
          archetype: archetype.trim() || undefined,
          notes: "(AI-generated draft — review before relying on as style reference)",
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(`Error saving voice example: ${err.error ?? "Unknown error"}`);
        return;
      }

      showToast("Saved as voice example.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Skip ────────────────────────────────────────────────────────────────────

  async function handleSkip() {
    const reason = window.prompt("Optional: reason for skipping (leave blank to skip without reason)");
    if (reason === null) return; // user cancelled

    setSubmitting(true);
    try {
      const res = await fetch("/api/touches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId,
          campaignId,
          channel,
          state: "skipped",
          skipReason: reason.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(`Error skipping: ${err.error ?? "Unknown error"}`);
        return;
      }

      showToast("Skipped.");
      onAction("skipped");
    } finally {
      setSubmitting(false);
    }
  }

  // ── No channels available ───────────────────────────────────────────────────

  if (!hasAny) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center text-gray-500 px-6">
          <p className="text-base font-medium">No contact methods available</p>
          <p className="mt-1 text-sm">
            Add an email or LinkedIn URL to enable drafting.
          </p>
        </div>
      </div>
    );
  }

  const canDraft = body.trim().length > 0;

  return (
    <div className="flex flex-col h-full gap-4 relative">
      {/* Toast notification */}
      {toast && (
        <div className="absolute top-0 left-0 right-0 z-10 bg-gray-800 text-white text-sm px-4 py-2 rounded shadow-lg text-center">
          {toast}
        </div>
      )}

      {/* ── Channel toggle ──────────────────────────────────────────────── */}
      <div className="flex gap-2 mt-2">
        <button
          type="button"
          onClick={() => setChannel("email")}
          disabled={!hasEmail}
          className={[
            "px-4 py-1.5 rounded text-sm font-medium transition-colors",
            channel === "email" && hasEmail
              ? "bg-[var(--primary)] text-white"
              : hasEmail
                ? "bg-gray-100 text-gray-700 hover:bg-gray-200"
                : "bg-gray-50 text-gray-300 cursor-not-allowed",
          ].join(" ")}
        >
          Email
        </button>
        <button
          type="button"
          onClick={() => setChannel("linkedin")}
          disabled={!hasLinkedin}
          className={[
            "px-4 py-1.5 rounded text-sm font-medium transition-colors",
            channel === "linkedin" && hasLinkedin
              ? "bg-[var(--primary)] text-white"
              : hasLinkedin
                ? "bg-gray-100 text-gray-700 hover:bg-gray-200"
                : "bg-gray-50 text-gray-300 cursor-not-allowed",
          ].join(" ")}
        >
          LinkedIn
        </button>
      </div>

      {/* ── Steering input + generate button ────────────────────────────── */}
      <div className="flex gap-2">
        <input
          type="text"
          value={steering}
          onChange={(e) => setSteering(e.target.value)}
          placeholder="Optional steering (e.g. 'be more casual', 'mention the conference')"
          className="flex-1 text-sm border border-[var(--border)] rounded px-3 py-2 focus:outline-none focus:border-[var(--primary)] placeholder:text-gray-400"
        />
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating || !isChannelEnabled(channel, hasEmail, hasLinkedin)}
          className="shrink-0 px-4 py-2 bg-[var(--primary)] text-white text-sm font-medium rounded hover:opacity-90 disabled:opacity-50 transition-opacity whitespace-nowrap"
        >
          {generating
            ? "Generating…"
            : canDraft
              ? "Regenerate"
              : "Generate Draft"}
        </button>
      </div>

      {/* ── Subject (email only) ─────────────────────────────────────────── */}
      {channel === "email" && (
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject line"
          className="text-sm border border-[var(--border)] rounded px-3 py-2 focus:outline-none focus:border-[var(--primary)] placeholder:text-gray-400"
        />
      )}

      {/* ── Body textarea ────────────────────────────────────────────────── */}
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={`Draft will appear here after generation…`}
        className="flex-1 text-sm font-mono border border-[var(--border)] rounded px-3 py-2 resize-none focus:outline-none focus:border-[var(--primary)] placeholder:text-gray-400"
        style={{ minHeight: "200px" }}
      />

      {/* ── Action buttons ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 pb-2">
        {/* Primary action: create draft or copy */}
        {channel === "email" ? (
          <button
            type="button"
            onClick={handleCreateGmailDraft}
            disabled={submitting || !canDraft || !contactEmail}
            className="px-4 py-2 bg-[var(--primary)] text-white text-sm font-medium rounded hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {submitting ? "Creating…" : "Create Gmail Draft"}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleLinkedInAction}
            disabled={submitting || !canDraft || !contactLinkedinUrl}
            className="px-4 py-2 bg-[var(--primary)] text-white text-sm font-medium rounded hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {submitting ? "Copying…" : "Copy to Clipboard"}
          </button>
        )}

        {/* Mark sent (only when draft exists) */}
        {hasDraft && existingDraftTouchId && (
          <button
            type="button"
            onClick={handleMarkSent}
            disabled={submitting}
            className="px-4 py-2 bg-[var(--success)] text-white text-sm font-medium rounded hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {submitting ? "Marking…" : "Mark Sent"}
          </button>
        )}

        {/* Save as voice example */}
        <button
          type="button"
          onClick={handleSaveVoiceExample}
          disabled={submitting || !canDraft}
          className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded hover:bg-gray-200 disabled:opacity-50 transition-colors"
        >
          Save as Voice Example
        </button>

        {/* Skip (only when NO draft exists) */}
        {!hasDraft && (
          <button
            type="button"
            onClick={handleSkip}
            disabled={submitting}
            className="px-4 py-2 bg-gray-50 text-gray-500 text-sm font-medium rounded border border-[var(--border)] hover:bg-gray-100 disabled:opacity-50 transition-colors"
          >
            Skip
          </button>
        )}
      </div>
    </div>
  );
}
