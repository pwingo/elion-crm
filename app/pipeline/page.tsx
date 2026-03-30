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

type SortKey = "name" | "staleness" | "nextTouch";

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
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("");
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [ownerFilter, setOwnerFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [sortKey, setSortKey] = useState<SortKey>("name");

  // Edit modal
  const [editingRow, setEditingRow] = useState<ContactRow | null>(null);

  // Fetch campaigns on mount
  useEffect(() => {
    setLoadingCampaigns(true);
    fetch("/api/campaigns")
      .then((r) => r.json())
      .then((data: Campaign[]) => {
        setCampaigns(data);
        if (data.length > 0) setSelectedCampaignId(data[0].id);
      })
      .catch(() => setError("Failed to load campaigns"))
      .finally(() => setLoadingCampaigns(false));
  }, []);

  const fetchContacts = useCallback(async () => {
    if (!selectedCampaignId) return;
    setLoadingContacts(true);
    setError(null);
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
  }, [selectedCampaignId]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  // Derived: unique owners
  const owners = [...new Set(contacts.map((c) => c.owner))].sort();

  // Filtered + sorted rows
  const filtered = contacts
    .filter((c) => !ownerFilter || c.owner === ownerFilter)
    .filter((c) => !statusFilter || c.status === statusFilter)
    .sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name);
      if (sortKey === "staleness") {
        const da = a.daysSinceContact ?? -1;
        const db_ = b.daysSinceContact ?? -1;
        return db_ - da; // descending — stalest first
      }
      if (sortKey === "nextTouch") {
        const na = a.nextTouchDate ?? "9999-99-99";
        const nb = b.nextTouchDate ?? "9999-99-99";
        return na.localeCompare(nb);
      }
      return 0;
    });

  if (loadingCampaigns) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Pipeline Overview</h1>
        <p className="mt-4 text-[var(--muted-foreground)]">Loading campaigns…</p>
      </div>
    );
  }

  if (campaigns.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Pipeline Overview</h1>
        <p className="mt-4 text-[var(--muted-foreground)]">
          No campaigns yet.{" "}
          <Link href="/settings/campaigns/new" className="text-[var(--primary)] hover:underline">
            Create your first campaign
          </Link>{" "}
          to get started.
        </p>
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
          <label className="block text-xs font-medium text-gray-500 mb-1">Campaign</label>
          <select
            value={selectedCampaignId}
            onChange={(e) => setSelectedCampaignId(e.target.value)}
            className="rounded border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
          >
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

        {/* Sort */}
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

        {/* Count */}
        {!loadingContacts && (
          <p className="ml-auto text-sm text-gray-500 self-end pb-2">
            {filtered.length} contact{filtered.length !== 1 ? "s" : ""}
          </p>
        )}
      </div>

      {/* ── Error ──────────────────────────────────────────────────────── */}
      {error && (
        <p className="mt-4 text-red-500 text-sm">Error: {error}</p>
      )}

      {/* ── Loading ────────────────────────────────────────────────────── */}
      {loadingContacts && (
        <p className="mt-6 text-[var(--muted-foreground)]">Loading contacts…</p>
      )}

      {/* ── Empty ──────────────────────────────────────────────────────── */}
      {!loadingContacts && !error && filtered.length === 0 && (
        <p className="mt-6 text-center text-gray-500 py-12 border border-dashed border-[var(--border)] rounded">
          No contacts found for this campaign and filter combination.
        </p>
      )}

      {/* ── Table ──────────────────────────────────────────────────────── */}
      {!loadingContacts && filtered.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
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

                return (
                  <tr
                    key={`${row.id}:${row.campaignId}`}
                    className="hover:bg-gray-50 transition-colors"
                  >
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
