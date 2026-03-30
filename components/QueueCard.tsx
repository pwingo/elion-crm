"use client";

import Link from "next/link";
import { useState } from "react";

interface Contact {
  id: string;
  name: string;
  organization: string;
  title: string | null;
}

interface Status {
  id: string;
  status: string | null;
  nextTouchDate: string | null;
}

interface QueueCardProps {
  contact: Contact;
  status: Status;
  campaignId: string;
  touchCount: number;
  lastChannel: string | null;
  draftTouchId: string | null;
  onMarkSent?: () => void;
}

const statusColors: Record<string, string> = {
  not_started: "bg-gray-100 text-gray-600",
  in_progress: "bg-blue-100 text-blue-700",
  responded: "bg-green-100 text-green-700",
  confirmed: "bg-emerald-100 text-emerald-700",
  declined: "bg-red-100 text-red-600",
  no_response: "bg-orange-100 text-orange-700",
  on_hold: "bg-yellow-100 text-yellow-700",
  not_a_fit: "bg-gray-200 text-gray-500",
};

function StatusBadge({ status }: { status: string | null }) {
  const label = status
    ? status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "Unknown";
  const colorClass = status ? (statusColors[status] ?? "bg-gray-100 text-gray-600") : "bg-gray-100 text-gray-600";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colorClass}`}>
      {label}
    </span>
  );
}

export function QueueCard({
  contact,
  status,
  campaignId,
  touchCount,
  lastChannel,
  draftTouchId,
  onMarkSent,
}: QueueCardProps) {
  const [marking, setMarking] = useState(false);

  async function handleMarkSent() {
    if (!draftTouchId) return;
    setMarking(true);
    try {
      const res = await fetch(`/api/touches/${draftTouchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: "sent" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error("Failed to mark sent:", err);
        return;
      }
      onMarkSent?.();
    } finally {
      setMarking(false);
    }
  }

  return (
    <div className="flex items-center justify-between bg-white border border-[var(--border)] rounded-lg px-4 py-3 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`/contacts/${contact.id}/${campaignId}`}
            className="font-medium text-[var(--primary)] hover:underline truncate"
          >
            {contact.name}
          </Link>
          <StatusBadge status={status.status} />
        </div>
        <div className="mt-0.5 text-sm text-gray-500 truncate">
          {contact.organization}
          {contact.title ? ` · ${contact.title}` : ""}
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs text-gray-400">
          <span>{touchCount} {touchCount === 1 ? "touch" : "touches"} sent</span>
          {lastChannel && (
            <span className="capitalize">last: {lastChannel}</span>
          )}
          {status.nextTouchDate && (
            <span>next: {status.nextTouchDate}</span>
          )}
        </div>
      </div>
      {draftTouchId && (
        <button
          onClick={handleMarkSent}
          disabled={marking}
          className="ml-4 shrink-0 px-3 py-1.5 bg-[var(--primary)] text-white text-sm font-medium rounded hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {marking ? "Marking…" : "Mark Sent"}
        </button>
      )}
    </div>
  );
}
