"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ContactDetail } from "@/components/ContactDetail";
import { DraftPanel } from "@/components/DraftPanel";

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
  body: string | null;
  sentAt: string | null;
  draftCreatedAt: string | null;
  createdAt: string | null;
  createdBy: string;
  gmailThreadId: string | null;
  gmailMessageId: string | null;
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

interface CampaignStatus {
  id: string;
  nextTouchDate: string | null;
  status: string;
}

interface ContextData {
  contact: Contact;
  touches: Touch[];
  gmailThreads: GmailThread[];
  campaignStatus: CampaignStatus | null;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ContactDetailPage({
  params,
}: {
  params: Promise<{ contactId: string; campaignId: string }>;
}) {
  const { contactId, campaignId } = use(params);
  const router = useRouter();

  const [data, setData] = useState<ContextData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [additionalEmails, setAdditionalEmails] = useState<Array<{ id: string; email: string }>>([]);

  const fetchContext = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/context?contactId=${encodeURIComponent(contactId)}&campaignId=${encodeURIComponent(campaignId)}`,
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to load context");
      }
      const json = await res.json();
      setData({
        contact: json.contact,
        touches: json.touches,
        gmailThreads: json.gmailThreads,
        campaignStatus: json.status ?? null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [contactId, campaignId]);

  useEffect(() => {
    fetchContext();
    fetch(`/api/contacts/${contactId}/emails`)
      .then((r) => r.json())
      .then(setAdditionalEmails)
      .catch(console.error);
  }, [fetchContext, contactId]);

  async function handleUpdateContact(field: Partial<Contact>) {
    if (!data) return;
    try {
      const res = await fetch(`/api/contacts/${contactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(field),
      });
      if (!res.ok) {
        console.error("Failed to update contact:", await res.json().catch(() => ({})));
        return;
      }
      await fetchContext();
    } catch (err) {
      console.error("Error updating contact:", err);
    }
  }

  async function handleAddEmail(email: string) {
    const res = await fetch(`/api/contacts/${contactId}/emails`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? "Failed to add email");
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

  const refreshTouches = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/touches?contactId=${encodeURIComponent(contactId)}&campaignId=${encodeURIComponent(campaignId)}`,
      );
      if (!res.ok) return;
      const touches: Touch[] = await res.json();
      setData((prev) => prev ? { ...prev, touches } : prev);
    } catch (err) {
      console.error("Error refreshing touches:", err);
    }
  }, [contactId, campaignId]);

  async function handleUndoSent(touchId: string) {
    const res = await fetch(`/api/touches/${touchId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: "drafted" }),
    });
    if (!res.ok) return;
    await fetchContext();
  }

  function handleDraftAction(actionType: "drafted" | "sent" | "skipped") {
    if (actionType === "sent" || actionType === "skipped") {
      router.push("/queue");
    } else {
      refreshTouches();
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ height: "calc(100vh - 120px)" }}>
        <p className="text-[var(--muted-foreground)]">Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center" style={{ height: "calc(100vh - 120px)" }}>
        <div className="text-center">
          <p className="text-red-500 font-medium">Error: {error}</p>
          <button
            onClick={fetchContext}
            className="mt-3 text-sm text-[var(--primary)] hover:underline"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { contact, touches, gmailThreads = [], campaignStatus } = data;

  const draftTouch = touches.find((t) => t.state === "drafted") ?? null;
  const hasDraft = draftTouch !== null;

  // Detect reply mode: most recent touch is "received"
  const sortedTouches = [...touches].sort(
    (a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime(),
  );
  const mostRecentTouch = sortedTouches[0];
  const replyContext =
    mostRecentTouch?.state === "received" &&
    mostRecentTouch.gmailThreadId &&
    mostRecentTouch.gmailMessageId
      ? {
          gmailThreadId: mostRecentTouch.gmailThreadId,
          gmailMessageId: mostRecentTouch.gmailMessageId,
          subject: mostRecentTouch.subject,
        }
      : null;

  async function handleUpdateNextTouchDate(date: string | null) {
    if (!campaignStatus) return;
    try {
      const res = await fetch(`/api/campaign-status/${campaignStatus.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nextTouchDate: date }),
      });
      if (!res.ok) {
        console.error("Failed to update next touch date:", await res.json().catch(() => ({})));
        return;
      }
      await fetchContext();
    } catch (err) {
      console.error("Error updating next touch date:", err);
    }
  }

  return (
    <div
      className="grid grid-cols-2 gap-6"
      style={{ height: "calc(100vh - 120px)" }}
    >
      {/* ── Left panel: Contact context ───────────────────────────────── */}
      <div className="overflow-y-auto pr-2 border-r border-[var(--border)]">
        <div className="flex items-center gap-3 mb-4">
          <button
            type="button"
            onClick={() => router.back()}
            className="text-sm text-[var(--primary)] hover:underline"
          >
            Back
          </button>
          <span className="text-gray-300">/</span>
          <h1 className="text-base font-semibold text-gray-800 truncate">
            {contact.name}
          </h1>
        </div>
        <ContactDetail
          contact={contact}
          touches={touches}
          gmailThreads={gmailThreads}
          nextTouchDate={campaignStatus?.nextTouchDate ?? null}
          onUpdateContact={handleUpdateContact}
          onUpdateNextTouchDate={handleUpdateNextTouchDate}
          additionalEmails={additionalEmails}
          onAddEmail={handleAddEmail}
          onRemoveEmail={handleRemoveEmail}
          onUndoSent={handleUndoSent}
        />
      </div>

      {/* ── Right panel: Drafting ─────────────────────────────────────── */}
      <div className="overflow-y-auto pl-2">
        <DraftPanel
          contactId={contactId}
          campaignId={campaignId}
          contactEmail={contact.email}
          contactLinkedinUrl={contact.linkedinUrl}
          hasDraft={hasDraft}
          existingDraftTouchId={draftTouch?.id ?? null}
          existingDraftSubject={draftTouch?.subject ?? null}
          existingDraftBody={draftTouch?.body ?? null}
          existingDraftChannel={draftTouch?.channel ?? null}
          replyContext={replyContext}
          onAction={handleDraftAction}
        />
      </div>
    </div>
  );
}
