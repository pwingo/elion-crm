"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { EditStatusModal } from "@/components/EditStatusModal";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Campaign {
  id: string;
  name: string;
  isActive: boolean | null;
}

/** Row returned when a specific campaign is selected */
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

/** Row returned when "All Contacts" is selected */
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

interface UnassignedContact {
  id: string;
  name: string;
  organization: string;
  title: string | null;
  email: string | null;
  linkedinUrl: string | null;
  owner: string;
}

type SortKey = "name" | "staleness" | "nextTouch";

const ALL_CONTACTS_VALUE = "__all__";

const OWNERS = ["Patrick", "Bobby", "Jeremy"];

// ─── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  responded: "Responded",
  confirmed: "Confirmed",
  declined: "Declined",
  no_response: "No Response",
  on_hold: "On Hold",
  not_a_fit: "Not a Fit",
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function PipelinePage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  // Default to "All Contacts" sentinel value
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>(ALL_CONTACTS_VALUE);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [allContacts, setAllContacts] = useState<AllContactRow[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [ownerFilter, setOwnerFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [showUnassigned, setShowUnassigned] = useState(false);

  // Unassigned contacts (only relevant for campaign view)
  const [unassignedContacts, setUnassignedContacts] = useState<UnassignedContact[]>([]);
  const [loadingUnassigned, setLoadingUnassigned] = useState(false);

  // Edit modal (only relevant for campaign view)
  const [editingRow, setEditingRow] = useState<ContactRow | null>(null);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkActionError, setBulkActionError] = useState<string | null>(null);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);

  const isAllContacts = selectedCampaignId === ALL_CONTACTS_VALUE;

  // Fetch campaigns on mount
  useEffect(() => {
    setLoadingCampaigns(true);
    fetch("/api/campaigns")
      .then((r) => r.json())
      .then((data: Campaign[]) => {
        setCampaigns(data);
        // Don't change selectedCampaignId — stays as ALL_CONTACTS_VALUE (default)
      })
      .catch(() => setError("Failed to load campaigns"))
      .finally(() => setLoadingCampaigns(false));
  }, []);

  // Fetch all contacts (for "All Contacts" view)
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

  // Fetch campaign-specific contacts
  const fetchContacts = useCallback(async () => {
    if (!selectedCampaignId || isAllContacts) return;
    setLoadingContacts(true);
    setError(null);
    setSelectedIds(new Set());
    try {
      const res = await fetch(
        `/api/contacts?campaignId=${encodeURIComponent(selectedCampaignId)}`,
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to load contacts");
      }
      const json = await res.json();
      setContacts(json.contacts ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoadingContacts(false);
    }
  }, [selectedCampaignId, isAllContacts]);

  const fetchUnassigned = useCallback(async () => {
    if (!selectedCampaignId || isAllContacts) return;
    setLoadingUnassigned(true);
    try {
      const res = await fetch(
        `/api/contacts/unassigned?campaignId=${encodeURIComponent(selectedCampaignId)}`,
      );
      if (!res.ok) throw new Error("Failed to load unassigned contacts");
      const json = await res.json();
      setUnassignedContacts(json.contacts ?? []);
    } catch {
      setUnassignedContacts([]);
    } finally {
      setLoadingUnassigned(false);
    }
  }, [selectedCampaignId, isAllContacts]);

  // When selection changes, load appropriate data
  useEffect(() => {
    setShowUnassigned(false);
    setUnassignedContacts([]);
    setContacts([]);
    setAllContacts([]);
    if (isAllContacts) {
      fetchAllContacts();
    } else {
      fetchContacts();
    }
  }, [selectedCampaignId, isAllContacts, fetchAllContacts, fetchContacts]);

  // ── Derived: owners for filter dropdown ──────────────────────────────────

  const owners = isAllContacts
    ? [...new Set(allContacts.map((c) => c.owner))].sort()
    : [...new Set(contacts.map((c) => c.owner))].sort();

  // ── Filtered + sorted rows ────────────────────────────────────────────────

  const filteredAll = allContacts
    .filter((c) => !ownerFilter || c.owner === ownerFilter)
    .sort((a, b) => a.name.localeCompare(b.name));

  const filtered = contacts
    .filter((c) => !ownerFilter || c.owner === ownerFilter)
    .filter((c) => !statusFilter || c.status === statusFilter)
    .sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name);
      if (sortKey === "staleness") {
        const da = a.daysSinceContact ?? -1;
        const db_ = b.daysSinceContact ?? -1;
        return db_ - da;
      }
      if (sortKey === "nextTouch") {
        const na = a.nextTouchDate ?? "9999-99-99";
        const nb = b.nextTouchDate ?? "9999-99-99";
        return na.localeCompare(nb);
      }
      return 0;
    });

  // ── Checkbox helpers ──────────────────────────────────────────────────────

  const visibleRows = isAllContacts ? filteredAll : filtered;
  const allVisibleSelected =
    visibleRows.length > 0 && visibleRows.every((c) => selectedIds.has(c.id));
  const someSelected = selectedIds.size > 0;

  function toggleSelectAll() {
    if (allVisibleSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const c of visibleRows) next.delete(c.id);
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const c of visibleRows) next.add(c.id);
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
      if (isAllContacts) {
        fetchAllContacts();
      } else {
        fetchContacts();
      }
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
      if (isAllContacts) {
        fetchAllContacts();
      } else {
        fetchContacts();
      }
    } catch (err) {
      setBulkActionError(err instanceof Error ? err.message : "Owner update failed");
    } finally {
      setBulkActionLoading(false);
    }
  }

  // ── Unassigned: select all helper (campaign view only) ────────────────────

  const allUnassignedSelected =
    unassignedContacts.length > 0 &&
    unassignedContacts.every((c) => selectedIds.has(c.id));

  function toggleSelectAllUnassigned() {
    if (allUnassignedSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const c of unassignedContacts) next.delete(c.id);
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const c of unassignedContacts) next.add(c.id);
        return next;
      });
    }
  }

  // ── Toggle unassigned view ────────────────────────────────────────────────

  function handleToggleUnassigned() {
    if (!showUnassigned) {
      setShowUnassigned(true);
      fetchUnassigned();
    } else {
      setShowUnassigned(false);
    }
    setSelectedIds(new Set());
  }

  // ─── Early returns ──────────────────────────────────────────────────────────

  if (loadingCampaigns) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Pipeline Overview</h1>
        <p className="mt-4 text-[var(--muted-foreground)]">Loading…</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Pipeline Overview</h1>

      {/* ── Controls ──────────────────────────────────────────────────── */}
      <div className="mt-4 flex flex-wrap gap-3 items-end">
        {/* Campaign selector */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">View</label>
          <select
            value={selectedCampaignId}
            onChange={(e) => setSelectedCampaignId(e.target.value)}
            className="rounded border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
          >
            <option value={ALL_CONTACTS_VALUE}>All Contacts</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

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

        {/* Status filter — campaign view only */}
        {!isAllContacts && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            >
              <option value="">All Statuses</option>
              {Object.entries(STATUS_LABELS).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Sort — campaign view only */}
        {!isAllContacts && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Sort By</label>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="rounded border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            >
              <option value="name">Name</option>
              <option value="staleness">Staleness</option>
              <option value="nextTouch">Next Touch</option>
            </select>
          </div>
        )}

        {/* Unassigned toggle — campaign view only */}
        {!isAllContacts && (
          <div className="self-end pb-0.5">
            <button
              type="button"
              onClick={handleToggleUnassigned}
              className={`px-3 py-2 rounded border text-sm font-medium transition-colors ${
                showUnassigned
                  ? "bg-[var(--primary)] text-white border-[var(--primary)]"
                  : "border-[var(--border)] text-gray-600 hover:bg-gray-100"
              }`}
            >
              {showUnassigned ? "Hide unassigned" : "Show contacts not in this campaign"}
            </button>
          </div>
        )}

        {/* Count */}
        {!loadingContacts && !showUnassigned && (
          <p className="ml-auto text-sm text-gray-500 self-end pb-2">
            {isAllContacts ? filteredAll.length : filtered.length}{" "}
            contact{(isAllContacts ? filteredAll.length : filtered.length) !== 1 ? "s" : ""}
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

      {/* ── Unassigned contacts table (campaign view only) ──────────────── */}
      {!isAllContacts && showUnassigned && (
        <div className="mt-4">
          <h2 className="text-base font-semibold text-gray-700 mb-2">
            Contacts not in this campaign
            {!loadingUnassigned && (
              <span className="ml-2 text-sm font-normal text-gray-500">
                ({unassignedContacts.length})
              </span>
            )}
          </h2>

          {loadingUnassigned && (
            <p className="text-sm text-[var(--muted-foreground)]">Loading…</p>
          )}

          {!loadingUnassigned && unassignedContacts.length === 0 && (
            <p className="text-sm text-gray-500 py-6 text-center border border-dashed border-[var(--border)] rounded">
              All contacts are already in this campaign.
            </p>
          )}

          {!loadingUnassigned && unassignedContacts.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={allUnassignedSelected}
                        onChange={toggleSelectAllUnassigned}
                        className="rounded border-gray-300 accent-[var(--primary)]"
                        aria-label="Select all unassigned contacts"
                      />
                    </th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Org</th>
                    <th className="px-4 py-3">Owner</th>
                    <th className="px-4 py-3">Email</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {unassignedContacts.map((c) => (
                    <tr
                      key={c.id}
                      className={`hover:bg-gray-50 transition-colors ${selectedIds.has(c.id) ? "bg-blue-50" : ""}`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(c.id)}
                          onChange={() => toggleRow(c.id)}
                          className="rounded border-gray-300 accent-[var(--primary)]"
                          aria-label={`Select ${c.name}`}
                        />
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-800">{c.name}</td>
                      <td className="px-4 py-3 text-gray-600 max-w-[160px] truncate">
                        {c.organization}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{c.owner}</td>
                      <td className="px-4 py-3 text-gray-600">{c.email ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Loading ────────────────────────────────────────────────────── */}
      {loadingContacts && !showUnassigned && (
        <p className="mt-6 text-[var(--muted-foreground)]">Loading contacts…</p>
      )}

      {/* ── Empty ──────────────────────────────────────────────────────── */}
      {!showUnassigned && !loadingContacts && !error && (
        <>
          {isAllContacts && filteredAll.length === 0 && (
            <p className="mt-6 text-center text-gray-500 py-12 border border-dashed border-[var(--border)] rounded">
              No contacts found.
            </p>
          )}
          {!isAllContacts && filtered.length === 0 && (
            <p className="mt-6 text-center text-gray-500 py-12 border border-dashed border-[var(--border)] rounded">
              No contacts found for this campaign and filter combination.
            </p>
          )}
        </>
      )}

      {/* ── All Contacts Table ─────────────────────────────────────────── */}
      {isAllContacts && !loadingContacts && filteredAll.length > 0 && (
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
                    {/* Name — plain text, no campaign context */}
                    <td className="px-4 py-3 font-medium text-gray-800">
                      {row.name}
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

      {/* ── Campaign-specific Main Table ───────────────────────────────── */}
      {!isAllContacts && !showUnassigned && !loadingContacts && filtered.length > 0 && (
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
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-center">Touches</th>
                <th className="px-4 py-3">Last Touch</th>
                <th className="px-4 py-3">Next Touch</th>
                <th className="px-4 py-3 text-center">Days Stale</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {filtered.map((row) => {
                const isStale = row.daysSinceContact !== null && row.daysSinceContact > 14;
                const missingContactInfo = !row.email && !row.linkedinUrl;
                const isSelected = selectedIds.has(row.id);

                return (
                  <tr
                    key={`${row.id}:${row.campaignId}`}
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
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          href={`/contacts/${row.id}/${row.campaignId}`}
                          className="font-medium text-[var(--primary)] hover:underline"
                        >
                          {row.name}
                        </Link>
                        {row.doNotContact && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                            DNC
                          </span>
                        )}
                        {missingContactInfo && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
                            Needs Contact Info
                          </span>
                        )}
                      </div>
                    </td>
                    {/* Org */}
                    <td className="px-4 py-3 text-gray-700 max-w-[160px] truncate">
                      {row.organization}
                    </td>
                    {/* Owner */}
                    <td className="px-4 py-3 text-gray-600">{row.owner}</td>
                    {/* Status */}
                    <td className="px-4 py-3">
                      <span className="text-gray-700">
                        {STATUS_LABELS[row.status] ?? row.status}
                      </span>
                    </td>
                    {/* Touches */}
                    <td className="px-4 py-3 text-center text-gray-700">{row.touchCount}</td>
                    {/* Last Touch */}
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {formatDate(row.lastTouch)}
                    </td>
                    {/* Next Touch */}
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {formatDate(row.nextTouchDate)}
                    </td>
                    {/* Days Stale */}
                    <td className="px-4 py-3 text-center">
                      {row.daysSinceContact === null ? (
                        <span className="text-gray-400">—</span>
                      ) : (
                        <span
                          className={
                            isStale
                              ? "font-bold text-red-600"
                              : "text-gray-600"
                          }
                        >
                          {row.daysSinceContact}d
                        </span>
                      )}
                    </td>
                    {/* Edit */}
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setEditingRow(row)}
                        className="px-3 py-1 rounded border border-[var(--border)] text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Edit Modal ─────────────────────────────────────────────────── */}
      {editingRow && (
        <EditStatusModal
          statusId={editingRow.statusId}
          contactName={editingRow.name}
          currentStatus={editingRow.status}
          currentNextTouchDate={editingRow.nextTouchDate}
          currentDoNotContact={editingRow.doNotContact}
          onClose={() => setEditingRow(null)}
          onSaved={() => {
            setEditingRow(null);
            fetchContacts();
          }}
        />
      )}
    </div>
  );
}
