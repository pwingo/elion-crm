"use client";

import { useState } from "react";

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

interface EditStatusModalProps {
  statusId: string;
  contactName: string;
  currentStatus: string;
  currentNextTouchDate: string | null;
  currentDoNotContact: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function EditStatusModal({
  statusId,
  contactName,
  currentStatus,
  currentNextTouchDate,
  currentDoNotContact,
  onClose,
  onSaved,
}: EditStatusModalProps) {
  const [status, setStatus] = useState(currentStatus);
  const [nextTouchDate, setNextTouchDate] = useState(currentNextTouchDate ?? "");
  const [doNotContact, setDoNotContact] = useState(currentDoNotContact);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaign-status/${statusId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          nextTouchDate: nextTouchDate || null,
          doNotContact,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to save");
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Edit Status</h2>
        <p className="text-sm text-gray-500 mb-5">{contactName}</p>

        {error && (
          <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </p>
        )}

        <div className="space-y-4">
          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Next Touch Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Next Touch Date
            </label>
            <input
              type="date"
              value={nextTouchDate}
              onChange={(e) => setNextTouchDate(e.target.value)}
              className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
          </div>

          {/* Do Not Contact */}
          <div className="flex items-center gap-2">
            <input
              id="dnc-checkbox"
              type="checkbox"
              checked={doNotContact}
              onChange={(e) => setDoNotContact(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-[var(--primary)] focus:ring-[var(--primary)]"
            />
            <label htmlFor="dnc-checkbox" className="text-sm font-medium text-gray-700">
              Do Not Contact
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded border border-[var(--border)] text-sm text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
