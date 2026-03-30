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
  state: "drafted" | "sent" | "skipped";
  subject: string | null;
  sentAt: string | null;
  draftCreatedAt: string | null;
  createdAt: string | null;
}

interface GmailMessage {
  id: string;
  from: string;
  date: string;
  snippet: string;
  body?: string;
}

interface GmailThread {
  threadId: string;
  subject: string;
  messages: GmailMessage[];
}

interface ContextData {
  contact: Contact;
  touches: Touch[];
  gmailThreads: GmailThread[] | null;
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
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [contactId, campaignId]);

  useEffect(() => {
    fetchContext();
  }, [fetchContext]);

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

  function handleDraftAction() {
    fetchContext();
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

  const { contact, touches, gmailThreads } = data;

  const draftTouch = touches.find((t) => t.state === "drafted") ?? null;
  const hasDraft = draftTouch !== null;

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
          onUpdateContact={handleUpdateContact}
        />
      </div>

      {/* ── Right panel: Drafting ─────────────────────────────────────── */}
      <div className="overflow-y-auto pl-2">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Draft Outreach</h2>
        <DraftPanel
          contactId={contactId}
          campaignId={campaignId}
          contactEmail={contact.email}
          contactLinkedinUrl={contact.linkedinUrl}
          hasDraft={hasDraft}
          existingDraftTouchId={draftTouch?.id ?? null}
          onAction={handleDraftAction}
        />
      </div>
    </div>
  );
}
