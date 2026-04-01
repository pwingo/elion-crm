"use client";

import { useCallback, useEffect, useState } from "react";
import { EditContactSlideOver } from "@/components/EditContactSlideOver";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Campaign {
  id: string;
  name: string;
  isActive: boolean | null;
}

/** Row returned from the all-contacts endpoint */
interface AllContactRow {
  id: string;
  name: string;
  organization: string;
  title: string | null;
  email: string | null;
  linkedinUrl: string | null;
  owner: string;
  isProspect: boolean | null;
  isPoc: boolean | null;
  notes: string | null;
  campaigns: { id: string; name: string }[];
}

const OWNERS = ["Patrick", "Bobby", "Jeremy"];

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function ContactsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [allContacts, setAllContacts] = useState<AllContactRow[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [ownerFilter, setOwnerFilter] = useState<string>("");
  const [search, setSearch] = useState("");

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkActionError, setBulkActionError] = useState<string | null>(null);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);

  // Edit/create slide-over: AllContactRow for edit, "new" for create, null for closed
  const [editingContact, setEditingContact] = useState<AllContactRow | "new" | null>(null);

  // Fetch campaigns on mount (needed for bulk assign dropdown)
  useEffect(() => {
    setLoadingCampaigns(true);
    fetch("/api/campaigns")
      .then((r) => r.json())
      .then((data: Campaign[]) => {
        setCampaigns(data);
      })
      .catch(() => setError("Failed to load campaigns"))
      .finally(() => setLoadingCampaigns(false));
  }, []);

  // Fetch all contacts
  const fetchAllContacts = useCallback(async () => {
    setLoadingContacts(true);
    setError(null);
    setSelectedIds(new Set());
    try {
      const res = await fetch("/api/contacts/all");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to load contacts");
      }
      const json = await res.json();
      setAllContacts(json.contacts ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoadingContacts(false);
    }
  }, []);

  // Load contacts on mount
  useEffect(() => {
    fetchAllContacts();
  }, [fetchAllContacts]);

  // ── Derived: owners for filter dropdown ──────────────────────────────────
  const owners = [...new Set(allContacts.map((c) => c.owner))].sort();

  // ── Filtered + sorted rows ────────────────────────────────────────────────
  const searchLower = search.toLowerCase();
  const filteredAll = allContacts
    .filter((c) => !ownerFilter || c.owner === ownerFilter)
    .filter((c) => !search || c.name.toLowerCase().includes(searchLower) || c.organization.toLowerCase().includes(searchLower) || (c.email ?? "").toLowerCase().includes(searchLower))
    .sort((a, b) => a.name.localeCompare(b.name));

  // ── Checkbox helpers ──────────────────────────────────────────────────────
  const allVisibleSelected =
    filteredAll.length > 0 && filteredAll.every((c) => selectedIds.has(c.id));
  const someSelected = selectedIds.size > 0;

  function toggleSelectAll() {
    if (allVisibleSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const c of filteredAll) next.delete(c.id);
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const c of filteredAll) next.add(c.id);
        return next;
      });
    }
  }

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ── Bulk actions ──────────────────────────────────────────────────────────

  async function handleBulkAssign(campaignId: string) {
    if (selectedIds.size === 0 || !campaignId) return;
    setBulkActionLoading(true);
    setBulkActionError(null);
    try {
      const res = await fetch("/api/contacts/bulk-assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds: [...selectedIds], campaignId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Bulk assign failed");
      }
      setSelectedIds(new Set());
      fetchAllContacts();
    } catch (err) {
      setBulkActionError(err instanceof Error ? err.message : "Bulk assign failed");
    } finally {
      setBulkActionLoading(false);
    }
  }

  async function handleBulkOwner(owner: string) {
    if (selectedIds.size === 0 || !owner) return;
    setBulkActionLoading(true);
    setBulkActionError(null);
    try {
      const res = await fetch("/api/contacts/bulk-owner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds: [...selectedIds], owner }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Owner update failed");
      }
      setSelectedIds(new Set());
      fetchAllContacts();
    } catch (err) {
      setBulkActionError(err instanceof Error ? err.message : "Owner update failed");
    } finally {
      setBulkActionLoading(false);
    }
  }

  // ─── Early returns ──────────────────────────────────────────────────────────

  if (loadingCampaigns) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Contacts</h1>
        <p className="mt-4 text-[var(--muted-foreground)]">Loading…</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Contacts</h1>

      {/* ── Controls ──────────────────────────────────────────────────── */}
      <div className="mt-4 flex flex-wrap gap-3 items-end">
        {/* Owner filter */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Owner</label>
          <select
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
            className="rounded border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
          >
            <option value="">All Owners</option>
            {owners.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>

        {/* Search */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Search</label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, org, or email…"
            className="rounded border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] w-56"
          />
        </div>

        {/* Add Contact */}
        <button
          type="button"
          onClick={() => setEditingContact("new")}
          className="px-3 py-2 bg-[var(--primary)] text-white text-sm font-medium rounded hover:opacity-90 transition-opacity"
        >
          + Add Contact
        </button>

        {/* Count */}
        {!loadingContacts && (
          <p className="ml-auto text-sm text-gray-500 self-end pb-2">
            {filteredAll.length}{" "}
            contact{filteredAll.length !== 1 ? "s" : ""}
          </p>
        )}
      </div>

      {/* ── Error ──────────────────────────────────────────────────────── */}
      {error && (
        <p className="mt-4 text-red-500 text-sm">Error: {error}</p>
      )}

      {/* ── Bulk action bar ────────────────────────────────────────────── */}
      {someSelected && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border)] bg-gray-50 px-4 py-2.5">
          <span className="text-sm font-medium text-gray-700">
            {selectedIds.size} selected
          </span>

          {/* Add to Campaign */}
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-gray-500 font-medium">Add to Campaign:</label>
            <select
              disabled={bulkActionLoading}
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) {
                  handleBulkAssign(e.target.value);
                  e.target.value = "";
                }
              }}
              className="rounded border border-[var(--border)] px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] disabled:opacity-50"
            >
              <option value="" disabled>
                Choose campaign…
              </option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Change Owner */}
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-gray-500 font-medium">Change Owner:</label>
            <select
              disabled={bulkActionLoading}
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) {
                  handleBulkOwner(e.target.value);
                  e.target.value = "";
                }
              }}
              className="rounded border border-[var(--border)] px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] disabled:opacity-50"
            >
              <option value="" disabled>
                Choose owner…
              </option>
              {OWNERS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>

          {/* Clear selection */}
          <button
            type="button"
            disabled={bulkActionLoading}
            onClick={() => setSelectedIds(new Set())}
            className="ml-auto text-xs text-gray-500 hover:text-gray-800 disabled:opacity-50"
          >
            Clear selection
          </button>

          {bulkActionLoading && (
            <span className="text-xs text-gray-500">Saving…</span>
          )}
          {bulkActionError && (
            <span className="text-xs text-red-500">{bulkActionError}</span>
          )}
        </div>
      )}

      {/* ── Loading ────────────────────────────────────────────────────── */}
      {loadingContacts && (
        <p className="mt-6 text-[var(--muted-foreground)]">Loading contacts…</p>
      )}

      {/* ── Empty ──────────────────────────────────────────────────────── */}
      {!loadingContacts && !error && filteredAll.length === 0 && (
        <p className="mt-6 text-center text-gray-500 py-12 border border-dashed border-[var(--border)] rounded">
          No contacts found.
        </p>
      )}

      {/* ── All Contacts Table ─────────────────────────────────────────── */}
      {!loadingContacts && filteredAll.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAll}
                    className="rounded border-gray-300 accent-[var(--primary)]"
                    aria-label="Select all contacts"
                  />
                </th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Org</th>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">LinkedIn</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Campaigns</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {filteredAll.map((row) => {
                const isSelected = selectedIds.has(row.id);
                return (
                  <tr
                    key={row.id}
                    className={`hover:bg-gray-50 transition-colors ${isSelected ? "bg-blue-50" : ""}`}
                  >
                    {/* Checkbox */}
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleRow(row.id)}
                        className="rounded border-gray-300 accent-[var(--primary)]"
                        aria-label={`Select ${row.name}`}
                      />
                    </td>
                    {/* Name */}
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setEditingContact(row)}
                        className="font-medium text-[var(--primary)] hover:underline text-left"
                      >
                        {row.name}
                      </button>
                    </td>
                    {/* Org */}
                    <td className="px-4 py-3 text-gray-700 max-w-[160px] truncate">
                      {row.organization}
                    </td>
                    {/* Title */}
                    <td className="px-4 py-3 text-gray-600">{row.title ?? "—"}</td>
                    {/* Email */}
                    <td className="px-4 py-3 text-gray-600">{row.email ?? "—"}</td>
                    {/* LinkedIn */}
                    <td className="px-4 py-3 text-gray-600">
                      {row.linkedinUrl ? (
                        <a
                          href={row.linkedinUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[var(--primary)] hover:underline truncate max-w-[120px] block"
                        >
                          Profile
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    {/* Owner */}
                    <td className="px-4 py-3 text-gray-600">{row.owner}</td>
                    {/* Campaign badges */}
                    <td className="px-4 py-3">
                      {row.campaigns.length === 0 ? (
                        <span className="text-gray-400 text-xs">None</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {row.campaigns.map((camp) => (
                            <span
                              key={camp.id}
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700"
                            >
                              {camp.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Edit/Create Slide-over ────────────────────────────────────── */}
      {editingContact !== null && (
        <EditContactSlideOver
          contact={editingContact === "new" ? null : editingContact}
          onClose={() => setEditingContact(null)}
          onSaved={() => {
            setEditingContact(null);
            fetchAllContacts();
          }}
        />
      )}
    </div>
  );
}
