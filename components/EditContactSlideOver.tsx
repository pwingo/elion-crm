"use client";

import { useEffect, useState } from "react";

interface ContactData {
  id: string;
  name: string;
  organization: string;
  title: string | null;
  email: string | null;
  linkedinUrl: string | null;
  owner: string;
  notes: string | null;
}

interface CampaignAssignment {
  statusId: string;
  id: string;
  name: string;
}

interface EditContactSlideOverProps {
  contact: (ContactData & { campaigns?: CampaignAssignment[] }) | null; // null = create mode
  onClose: () => void;
  onSaved: () => void;
}

const OWNERS = ["Patrick", "Bobby", "Jeremy"];

export function EditContactSlideOver({ contact, onClose, onSaved }: EditContactSlideOverProps) {
  const isCreate = contact === null;
  const [name, setName] = useState(contact?.name ?? "");
  const [organization, setOrganization] = useState(contact?.organization ?? "");
  const [title, setTitle] = useState(contact?.title ?? "");
  const [email, setEmail] = useState(contact?.email ?? "");
  const [linkedinUrl, setLinkedinUrl] = useState(contact?.linkedinUrl ?? "");
  const [owner, setOwner] = useState(contact?.owner ?? OWNERS[0]);
  const [notes, setNotes] = useState(contact?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  // Animate in
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 200);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        organization: organization.trim(),
        title: title.trim() || null,
        email: email.trim() || null,
        linkedinUrl: linkedinUrl.trim() || null,
        owner,
        notes: notes.trim() || null,
      };

      const url = contact ? `/api/contacts/${contact.id}` : "/api/contacts";
      const method = contact ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to save");
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black transition-opacity duration-200 z-40 ${visible ? "opacity-30" : "opacity-0"}`}
        onClick={handleClose}
      />

      {/* Slide-over panel */}
      <div
        className={`fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-xl z-50 flex flex-col transition-transform duration-200 ${visible ? "translate-x-0" : "translate-x-full"}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <h2 className="text-lg font-semibold text-gray-800">{contact ? "Edit Contact" : "New Contact"}</h2>
          <button
            type="button"
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Name */}
          <div>
            <label htmlFor="ec-name" className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              id="ec-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
          </div>

          {/* Organization */}
          <div>
            <label htmlFor="ec-org" className="block text-sm font-medium text-gray-700 mb-1">Organization</label>
            <input
              id="ec-org"
              type="text"
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
          </div>

          {/* Title */}
          <div>
            <label htmlFor="ec-title" className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              id="ec-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
          </div>

          {/* Email */}
          <div>
            <label htmlFor="ec-email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              id="ec-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
          </div>

          {/* LinkedIn URL */}
          <div>
            <label htmlFor="ec-linkedin" className="block text-sm font-medium text-gray-700 mb-1">LinkedIn URL</label>
            <input
              id="ec-linkedin"
              type="url"
              value={linkedinUrl}
              onChange={(e) => setLinkedinUrl(e.target.value)}
              className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
          </div>

          {/* Owner */}
          <div>
            <label htmlFor="ec-owner" className="block text-sm font-medium text-gray-700 mb-1">Owner</label>
            <select
              id="ec-owner"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            >
              {OWNERS.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>

          {/* Campaigns */}
          {!isCreate && contact?.campaigns && contact.campaigns.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Campaigns</label>
              <div className="flex flex-wrap gap-2">
                {contact.campaigns.map((camp) => (
                  <span
                    key={camp.statusId}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700"
                  >
                    {camp.name}
                    <button
                      type="button"
                      onClick={async () => {
                        if (!confirm(`Remove from "${camp.name}"? This will delete all touches for this campaign.`)) return;
                        try {
                          const res = await fetch(`/api/campaign-status/${camp.statusId}`, { method: "DELETE" });
                          if (!res.ok) {
                            const body = await res.json().catch(() => ({}));
                            throw new Error(body.error ?? "Failed to remove");
                          }
                          onSaved();
                        } catch (err) {
                          alert(err instanceof Error ? err.message : "Failed to remove");
                        }
                      }}
                      className="text-blue-400 hover:text-red-500 transition-colors leading-none"
                      title={`Remove from ${camp.name}`}
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label htmlFor="ec-notes" className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              id="ec-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] resize-none"
            />
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--border)]">
          {!isCreate ? (
            <button
              type="button"
              onClick={async () => {
                if (!confirm("Delete this contact? This will also remove them from all campaigns and delete all outreach history.")) return;
                try {
                  const res = await fetch(`/api/contacts/${contact!.id}`, { method: "DELETE" });
                  if (!res.ok) {
                    const body = await res.json().catch(() => ({}));
                    throw new Error(body.error ?? "Failed to delete");
                  }
                  onSaved();
                } catch (err) {
                  alert(err instanceof Error ? err.message : "Failed to delete");
                }
              }}
              className="text-sm text-red-500 hover:text-red-700 hover:underline"
            >
              Delete contact
            </button>
          ) : <div />}
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
              disabled={saving || !name.trim() || !organization.trim()}
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
