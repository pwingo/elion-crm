"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CampaignContactSlideOver } from "@/components/CampaignContactSlideOver";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Campaign {
  id: string;
  name: string;
  type: string;
  campaignGroup: string | null;
  date: string | null;
  location: string | null;
  description: string;
  sellingPoints: string;
  isActive: boolean | null;
  cadenceDays: string;
  maxTouches: number;
}

/** Row returned for contacts in a specific campaign */
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
  priority: number | null;
  touchCount: number;
  draftsPending: number;
  lastChannel: string | null;
  lastTouch: string | null;
  daysSinceContact: number | null;
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

type SortKey = "name" | "staleness" | "nextTouch" | "priority";

const PRIORITY_LABELS: Record<number, string> = {
  1: "High",
  2: "Medium",
  3: "Low",
};

const PRIORITY_COLORS: Record<number, string> = {
  1: "bg-red-100 text-red-700",
  2: "bg-yellow-100 text-yellow-700",
  3: "bg-green-100 text-green-700",
};

const OWNERS = ["Patrick", "Bobby", "Jeremy"];

const campaignTypeOptions = [
  { value: "provider_recruiting", label: "Provider Recruiting" },
  { value: "vendor_recruiting", label: "Vendor Recruiting" },
  { value: "sales", label: "Sales" },
  { value: "content", label: "Content" },
  { value: "conference", label: "Conference" },
  { value: "other", label: "Other" },
] as const;

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
  if (!dateStr) return "\u2014";
  // Take only the date portion (handles "YYYY-MM-DD HH:MM:SS" timestamps)
  const dateOnly = dateStr.split(" ")[0].split("T")[0];
  const parts = dateOnly.split("-");
  if (parts.length === 3) {
    const d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }
  }
  return "\u2014";
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: campaignId } = use(params);

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Campaign details editing
  const [showDetails, setShowDetails] = useState(false);
  const [savingCampaign, setSavingCampaign] = useState(false);
  const [campaignSaveError, setCampaignSaveError] = useState<string | null>(null);

  // Filters
  const [ownerFilter, setOwnerFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [priorityFilter, setPriorityFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [showUnassigned, setShowUnassigned] = useState(false);

  // Unassigned contacts
  const [unassignedContacts, setUnassignedContacts] = useState<UnassignedContact[]>([]);
  const [loadingUnassigned, setLoadingUnassigned] = useState(false);

  // Edit modal
  const [editingRow, setEditingRow] = useState<ContactRow | null>(null);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkActionError, setBulkActionError] = useState<string | null>(null);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);

  // Fetch campaigns list (for bulk assign dropdown) + this campaign's full details
  useEffect(() => {
    fetch("/api/campaigns")
      .then((r) => r.json())
      .then((data: Campaign[]) => setCampaigns(data))
      .catch(() => setError("Failed to load campaigns"));
    fetch(`/api/campaigns/${campaignId}`)
      .then((r) => r.json())
      .then((data: Campaign) => setCampaign(data))
      .catch(() => {});
  }, [campaignId]);

  async function handleSaveCampaign(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSavingCampaign(true);
    setCampaignSaveError(null);

    const form = e.currentTarget;
    const data = new FormData(form);

    const body = {
      name: data.get("name") as string,
      type: data.get("type") as string,
      campaignGroup: (data.get("campaignGroup") as string) || null,
      date: (data.get("date") as string) || null,
      location: (data.get("location") as string) || null,
      description: data.get("description") as string,
      sellingPoints: data.get("sellingPoints") as string,
      isActive: data.get("isActive") === "on",
      cadenceDays: data.get("cadenceDays") as string,
      maxTouches: parseInt(data.get("maxTouches") as string, 10) || 4,
    };

    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? `Request failed (${res.status})`);
      }

      const updated: Campaign = await res.json();
      setCampaign(updated);
      setShowDetails(false);
    } catch (err) {
      setCampaignSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingCampaign(false);
    }
  }

  // Fetch contacts for this campaign
  const fetchContacts = useCallback(async () => {
    setLoadingContacts(true);
    setError(null);
    setSelectedIds(new Set());
    try {
      const res = await fetch(
        `/api/contacts?campaignId=${encodeURIComponent(campaignId)}`,
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
  }, [campaignId]);

  const fetchUnassigned = useCallback(async () => {
    setLoadingUnassigned(true);
    try {
      const res = await fetch(
        `/api/contacts/unassigned?campaignId=${encodeURIComponent(campaignId)}`,
      );
      if (!res.ok) throw new Error("Failed to load unassigned contacts");
      const json = await res.json();
      setUnassignedContacts(json.contacts ?? []);
    } catch {
      setUnassignedContacts([]);
    } finally {
      setLoadingUnassigned(false);
    }
  }, [campaignId]);

  // Load contacts on mount
  useEffect(() => {
    setShowUnassigned(false);
    setUnassignedContacts([]);
    setContacts([]);
    fetchContacts();
  }, [fetchContacts]);

  // ── Derived: owners for filter dropdown ──────────────────────────────────

  const owners = [...new Set(contacts.map((c) => c.owner))].sort();

  // ── Filtered + sorted rows ────────────────────────────────────────────────

  const searchLower = search.toLowerCase();
  const filtered = contacts
    .filter((c) => !ownerFilter || c.owner === ownerFilter)
    .filter((c) => !statusFilter || c.status === statusFilter)
    .filter((c) => !priorityFilter || (c.priority?.toString() ?? "") === priorityFilter)
    .filter((c) => !search || c.name.toLowerCase().includes(searchLower) || c.organization.toLowerCase().includes(searchLower) || (c.email ?? "").toLowerCase().includes(searchLower))
    .sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name);
      if (sortKey === "priority") {
        const pa = a.priority ?? 999;
        const pb = b.priority ?? 999;
        return pa - pb;
      }
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

  const allVisibleSelected =
    filtered.length > 0 && filtered.every((c) => selectedIds.has(c.id));
  const someSelected = selectedIds.size > 0;

  function toggleSelectAll() {
    if (allVisibleSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const c of filtered) next.delete(c.id);
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const c of filtered) next.add(c.id);
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

  async function handleBulkAssign(targetCampaignId: string) {
    if (selectedIds.size === 0 || !targetCampaignId) return;
    setBulkActionLoading(true);
    setBulkActionError(null);
    try {
      const res = await fetch("/api/contacts/bulk-assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds: [...selectedIds], campaignId: targetCampaignId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Bulk assign failed");
      }
      setSelectedIds(new Set());
      fetchContacts();
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
      fetchContacts();
    } catch (err) {
      setBulkActionError(err instanceof Error ? err.message : "Owner update failed");
    } finally {
      setBulkActionLoading(false);
    }
  }

  // ── Unassigned: select all helper ─────────────────────────────────────────

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

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="mb-4">
        <Link
          href="/campaigns"
          className="text-sm text-[var(--primary)] hover:underline"
        >
          &larr; Back to Campaigns
        </Link>
        <div className="flex items-center gap-3 mt-1">
          <h1 className="text-2xl font-semibold">
            {campaign?.name || "Campaign"}
          </h1>
          <Link
            href={`/settings/campaigns/${campaignId}`}
            className="text-xs text-gray-400 hover:text-[var(--primary)] transition-colors"
          >
            Settings
          </Link>
          {campaign && (
            <button
              type="button"
              onClick={() => setShowDetails((v) => !v)}
              className="px-3 py-1 rounded border border-[var(--border)] text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
            >
              {showDetails ? "Hide Details" : "Edit Details"}
            </button>
          )}
        </div>
        {!loadingContacts && (
          <p className="text-sm text-gray-500 mt-0.5">
            {filtered.length} contact{filtered.length !== 1 ? "s" : ""}
          </p>
        )}
      </div>

      {/* ── Campaign Details Panel ─────────────────────────────────────── */}
      {showDetails && campaign && (
        <div className="mb-6 rounded-lg border border-[var(--border)] bg-gray-50 p-5">
          <form onSubmit={handleSaveCampaign} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="name" className="block text-xs font-medium text-gray-500 mb-1">
                  Campaign Name *
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  defaultValue={campaign.name}
                  key={`name-${campaign.name}`}
                  className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                />
              </div>
              <div>
                <label htmlFor="type" className="block text-xs font-medium text-gray-500 mb-1">
                  Type *
                </label>
                <select
                  id="type"
                  name="type"
                  required
                  defaultValue={campaign.type}
                  key={`type-${campaign.type}`}
                  className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                >
                  {campaignTypeOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label htmlFor="campaignGroup" className="block text-xs font-medium text-gray-500 mb-1">
                  Campaign Group
                </label>
                <input
                  id="campaignGroup"
                  name="campaignGroup"
                  type="text"
                  defaultValue={campaign.campaignGroup ?? ""}
                  key={`group-${campaign.campaignGroup}`}
                  className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                />
              </div>
              <div>
                <label htmlFor="date" className="block text-xs font-medium text-gray-500 mb-1">
                  Date
                </label>
                <input
                  id="date"
                  name="date"
                  type="text"
                  defaultValue={campaign.date ?? ""}
                  key={`date-${campaign.date}`}
                  className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                />
              </div>
              <div>
                <label htmlFor="location" className="block text-xs font-medium text-gray-500 mb-1">
                  Location
                </label>
                <input
                  id="location"
                  name="location"
                  type="text"
                  defaultValue={campaign.location ?? ""}
                  key={`loc-${campaign.location}`}
                  className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                />
              </div>
            </div>

            <div>
              <label htmlFor="description" className="block text-xs font-medium text-gray-500 mb-1">
                Description *
              </label>
              <textarea
                id="description"
                name="description"
                required
                rows={3}
                defaultValue={campaign.description}
                key={`desc-${campaign.id}`}
                className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--primary)] resize-y"
              />
            </div>

            <div>
              <label htmlFor="sellingPoints" className="block text-xs font-medium text-gray-500 mb-1">
                Selling Points *
              </label>
              <textarea
                id="sellingPoints"
                name="sellingPoints"
                required
                rows={3}
                defaultValue={campaign.sellingPoints}
                key={`sp-${campaign.id}`}
                className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--primary)] resize-y"
              />
            </div>

            <div className="grid grid-cols-3 gap-4 items-end">
              <div>
                <label htmlFor="cadenceDays" className="block text-xs font-medium text-gray-500 mb-1">
                  Cadence (days)
                </label>
                <input
                  id="cadenceDays"
                  name="cadenceDays"
                  type="text"
                  defaultValue={campaign.cadenceDays}
                  key={`cad-${campaign.cadenceDays}`}
                  className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                />
              </div>
              <div>
                <label htmlFor="maxTouches" className="block text-xs font-medium text-gray-500 mb-1">
                  Max Touches
                </label>
                <input
                  id="maxTouches"
                  name="maxTouches"
                  type="number"
                  min={1}
                  defaultValue={campaign.maxTouches}
                  key={`mt-${campaign.maxTouches}`}
                  className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                />
              </div>
              <div className="flex items-center gap-2 pb-2">
                <input
                  id="isActive"
                  name="isActive"
                  type="checkbox"
                  defaultChecked={campaign.isActive ?? true}
                  key={`active-${campaign.isActive}`}
                  className="rounded"
                />
                <label htmlFor="isActive" className="text-sm">Active</label>
              </div>
            </div>

            {campaignSaveError && (
              <p className="text-sm text-red-500">{campaignSaveError}</p>
            )}

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={savingCampaign}
                className="px-4 py-2 rounded bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {savingCampaign ? "Saving\u2026" : "Save Changes"}
              </button>
              <button
                type="button"
                onClick={() => setShowDetails(false)}
                className="px-4 py-2 rounded border border-[var(--border)] text-sm hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Controls ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3 items-end">
        {/* Search */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Search</label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, org, or email…"
            className="rounded border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] w-48"
          />
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

        {/* Status filter */}
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

        {/* Priority filter */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Priority</label>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="rounded border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
          >
            <option value="">All Priorities</option>
            <option value="1">High</option>
            <option value="2">Medium</option>
            <option value="3">Low</option>
          </select>
        </div>

        {/* Sort */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Sort By</label>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="rounded border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
          >
            <option value="name">Name</option>
            <option value="priority">Priority</option>
            <option value="staleness">Staleness</option>
            <option value="nextTouch">Next Touch</option>
          </select>
        </div>

        {/* Unassigned toggle */}
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
                Choose campaign...
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
                Choose owner...
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
            <span className="text-xs text-gray-500">Saving...</span>
          )}
          {bulkActionError && (
            <span className="text-xs text-red-500">{bulkActionError}</span>
          )}
        </div>
      )}

      {/* ── Unassigned contacts table ─────────────────────────────────── */}
      {showUnassigned && (
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
            <p className="text-sm text-[var(--muted-foreground)]">Loading...</p>
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
                      <td className="px-4 py-3 text-gray-600">{c.email ?? "\u2014"}</td>
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
        <p className="mt-6 text-[var(--muted-foreground)]">Loading contacts...</p>
      )}

      {/* ── Empty ──────────────────────────────────────────────────────── */}
      {!showUnassigned && !loadingContacts && !error && filtered.length === 0 && (
        <p className="mt-6 text-center text-gray-500 py-12 border border-dashed border-[var(--border)] rounded">
          No contacts found for this campaign and filter combination.
        </p>
      )}

      {/* ── Main contacts table ────────────────────────────────────────── */}
      {!showUnassigned && !loadingContacts && filtered.length > 0 && (
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
                <th className="px-4 py-3">Priority</th>
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
                        <button
                          type="button"
                          onClick={() => setEditingRow(row)}
                          className="font-medium text-[var(--primary)] hover:underline text-left"
                        >
                          {row.name}
                        </button>
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
                    {/* Priority */}
                    <td className="px-4 py-3">
                      {row.priority ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${PRIORITY_COLORS[row.priority]}`}>
                          {PRIORITY_LABELS[row.priority]}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
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
                        <span className="text-gray-400">{"\u2014"}</span>
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
                    {/* Draft */}
                    <td className="px-4 py-3">
                      <Link
                        href={`/contacts/${row.id}/${row.campaignId}`}
                        className="px-3 py-1 rounded border border-[var(--border)] text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                      >
                        Draft
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Contact Slide-over ──────────────────────────────────────────── */}
      {editingRow && (
        <CampaignContactSlideOver
          contact={editingRow}
          allContacts={filtered}
          onClose={() => setEditingRow(null)}
          onSaved={() => {
            setEditingRow(null);
            fetchContacts();
          }}
          onNavigate={(next) => setEditingRow(next)}
        />
      )}
    </div>
  );
}
