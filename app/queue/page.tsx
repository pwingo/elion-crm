"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { QueueCard } from "@/components/QueueCard";

interface Contact {
  id: string;
  name: string;
  organization: string;
  title: string | null;
  email: string | null;
  linkedinUrl: string | null;
  owner: string;
}

interface Status {
  id: string;
  contactId: string;
  campaignId: string;
  status: string | null;
  nextTouchDate: string | null;
  doNotContact: boolean | null;
}

interface QueueItem {
  contact: Contact;
  status: Status;
  touchCount: number;
  lastChannel: string | null;
  draftTouchId: string | null;
  hasReply: boolean;
}

interface Campaign {
  id: string;
  name: string;
}

interface CampaignGroup {
  campaign: Campaign;
  needsMarkSent: QueueItem[];
  dueToday: QueueItem[];
  upcoming: QueueItem[];
}

interface QueueData {
  campaigns: CampaignGroup[];
}

export default function QueuePage() {
  const [data, setData] = useState<QueueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [batchState, setBatchState] = useState<{
    running: boolean;
    current: number;
    total: number;
    succeeded: number;
    failed: number;
    currentContact: string | null;
    done: boolean;
  } | null>(null);

  const [syncState, setSyncState] = useState<{
    loading: boolean;
    message: string | null;
  }>({ loading: false, message: null });

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/queue");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to load queue");
      }
      const json: QueueData = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  const syncReplies = useCallback(async () => {
    setSyncState({ loading: true, message: null });
    try {
      const res = await fetch("/api/queue/sync-replies", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSyncState({ loading: false, message: body.error ?? "Sync failed" });
        return;
      }
      const { found } = await res.json();
      setSyncState({
        loading: false,
        message: found > 0 ? `Found ${found} new ${found === 1 ? "reply" : "replies"}` : "No new replies",
      });
      if (found > 0) fetchQueue();
      setTimeout(() => setSyncState((s) => ({ ...s, message: null })), 4000);
    } catch {
      setSyncState({ loading: false, message: "Sync failed" });
    }
  }, [fetchQueue]);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  // ── Summary counts ──────────────────────────────────────────────────────────
  const totalNeedsMarkSent =
    data?.campaigns.reduce((acc, g) => acc + g.needsMarkSent.length, 0) ?? 0;
  const totalDueToday =
    data?.campaigns.reduce((acc, g) => acc + g.dueToday.length, 0) ?? 0;
  const totalUpcoming =
    data?.campaigns.reduce((acc, g) => acc + g.upcoming.length, 0) ?? 0;

  const draftableCount = totalDueToday;

  const isEmpty =
    !loading && data != null && data.campaigns.length === 0;

  // ── Search filtering ────────────────────────────────────────────────────────
  const filteredCampaigns = useMemo(() => {
    if (!data) return [];
    const term = search.trim().toLowerCase();
    if (!term) return data.campaigns;

    const matchesItem = (item: QueueItem) => {
      const { name, organization, email } = item.contact;
      return (
        name.toLowerCase().includes(term) ||
        organization.toLowerCase().includes(term) ||
        (email && email.toLowerCase().includes(term))
      );
    };

    return data.campaigns
      .map((group) => ({
        ...group,
        needsMarkSent: group.needsMarkSent.filter(matchesItem),
        dueToday: group.dueToday.filter(matchesItem),
        upcoming: group.upcoming.filter(matchesItem),
      }))
      .filter(
        (group) =>
          group.needsMarkSent.length > 0 ||
          group.dueToday.length > 0 ||
          group.upcoming.length > 0,
      );
  }, [data, search]);

  const startBatchDraft = useCallback(async () => {
    setBatchState({
      running: true,
      current: 0,
      total: draftableCount,
      succeeded: 0,
      failed: 0,
      currentContact: null,
      done: false,
    });

    try {
      const res = await fetch("/api/batch-draft", { method: "POST" });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        setBatchState((prev) =>
          prev ? { ...prev, running: false, done: true } : null,
        );
        setError(err.error ?? "Batch draft failed");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const match = line.match(/^data: (.+)$/);
          if (!match) continue;
          const event = JSON.parse(match[1]);

          if (event.type === "progress") {
            setBatchState((prev) =>
              prev
                ? {
                    ...prev,
                    current: event.current,
                    total: event.total,
                    succeeded:
                      event.status === "success"
                        ? prev.succeeded + 1
                        : prev.succeeded,
                    failed:
                      event.status === "error"
                        ? prev.failed + 1
                        : prev.failed,
                    currentContact: event.contactName,
                  }
                : null,
            );
          } else if (event.type === "done") {
            setBatchState((prev) =>
              prev
                ? {
                    ...prev,
                    running: false,
                    done: true,
                    succeeded: event.succeeded,
                    failed: event.failed,
                    total: event.total,
                  }
                : null,
            );
            fetchQueue();
          }
        }
      }
    } catch {
      setBatchState((prev) =>
        prev ? { ...prev, running: false, done: true } : null,
      );
    }
  }, [draftableCount, fetchQueue]);

  return (
    <div>
      <h1 className="text-2xl font-semibold">My Queue</h1>

      {/* Summary bar */}
      {!loading && !error && data && data.campaigns.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-3 items-center">
          <SummaryChip
            count={totalNeedsMarkSent}
            label="awaiting send confirmation"
            color="yellow"
          />
          <SummaryChip count={totalDueToday} label="due today" color="blue" />
          <SummaryChip count={totalUpcoming} label="upcoming (7 days)" color="gray" />
          <button
            onClick={syncReplies}
            disabled={syncState.loading}
            className="ml-auto px-4 py-1.5 text-sm font-medium rounded-lg border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 disabled:opacity-50 transition-colors"
          >
            {syncState.loading ? "Checking…" : "Check for Replies"}
          </button>
        </div>
      )}

      {syncState.message && (
        <div className="mt-2 flex items-center gap-2">
          <span className="px-3 py-1.5 rounded-lg text-sm font-medium bg-purple-50 border border-purple-200 text-purple-700">
            {syncState.message}
          </span>
          <button
            onClick={() => setSyncState((s) => ({ ...s, message: null }))}
            className="text-sm text-gray-500 hover:text-gray-700 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Batch draft button */}
      {!loading && !error && data && draftableCount > 0 && (
        <div className="mt-4">
          {!batchState?.running && !batchState?.done && (
            <button
              onClick={startBatchDraft}
              className="px-4 py-2 bg-[var(--primary)] text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
            >
              Draft All Due ({draftableCount})
            </button>
          )}
          {batchState?.running && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                <svg
                  className="animate-spin h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                <span>
                  Drafting {batchState.current}/{batchState.total}
                  {batchState.currentContact &&
                    ` \u2014 ${batchState.currentContact}`}
                </span>
              </div>
            </div>
          )}
          {batchState?.done && !batchState.running && (
            <div className="flex items-center gap-3">
              <span
                className={`px-4 py-2 rounded-lg text-sm font-medium ${
                  batchState.failed === 0
                    ? "bg-green-50 border border-green-200 text-green-800"
                    : "bg-yellow-50 border border-yellow-200 text-yellow-800"
                }`}
              >
                Done! {batchState.succeeded} drafted
                {batchState.failed > 0 && `, ${batchState.failed} failed`}
              </span>
              <button
                onClick={() => setBatchState(null)}
                className="text-sm text-gray-500 hover:text-gray-700 underline"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      )}

      {/* Search bar */}
      {!loading && !error && data && data.campaigns.length > 0 && (
        <div className="mt-4">
          <input
            type="text"
            placeholder="Search contacts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
          />
        </div>
      )}

      {loading && (
        <p className="mt-6 text-[var(--muted-foreground)]">Loading queue…</p>
      )}

      {error && (
        <p className="mt-6 text-red-500">Error: {error}</p>
      )}

      {isEmpty && (
        <div className="mt-8 text-center text-gray-500">
          <p className="text-lg font-medium">No items in your queue</p>
          <p className="mt-1 text-sm">
            Head to the{" "}
            <Link href="/campaigns" className="text-[var(--primary)] hover:underline">
              Campaigns
            </Link>{" "}
            to start outreach.
          </p>
        </div>
      )}

      {/* No results for search */}
      {!loading && !error && data && data.campaigns.length > 0 && search.trim() && filteredCampaigns.length === 0 && (
        <p className="mt-6 text-[var(--muted-foreground)]">No contacts match &ldquo;{search.trim()}&rdquo;</p>
      )}

      {/* Campaign groups */}
      {filteredCampaigns.map((group) => (
        <section key={group.campaign.id} className="mt-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">
            {group.campaign.name}
          </h2>

          {group.needsMarkSent.length > 0 && (
            <SectionBlock
              title="Awaiting Send Confirmation"
              color="yellow"
              items={group.needsMarkSent}
              campaignId={group.campaign.id}
              onMarkSent={fetchQueue}
            />
          )}

          {group.dueToday.length > 0 && (
            <SectionBlock
              title="Due Today"
              color="blue"
              items={group.dueToday}
              campaignId={group.campaign.id}
              onMarkSent={fetchQueue}
            />
          )}

          {group.upcoming.length > 0 && (
            <SectionBlock
              title="Upcoming (Next 7 Days)"
              color="gray"
              items={group.upcoming}
              campaignId={group.campaign.id}
              onMarkSent={fetchQueue}
            />
          )}
        </section>
      ))}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SummaryChip({
  count,
  label,
  color,
}: {
  count: number;
  label: string;
  color: "yellow" | "blue" | "gray";
}) {
  if (count === 0) return null;

  const colorClass =
    color === "yellow"
      ? "bg-yellow-50 border-yellow-200 text-yellow-800"
      : color === "blue"
        ? "bg-blue-50 border-blue-200 text-blue-800"
        : "bg-gray-50 border-gray-200 text-gray-700";

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-sm font-medium ${colorClass}`}
    >
      <span className="font-bold">{count}</span> {label}
    </span>
  );
}

function SectionBlock({
  title,
  color,
  items,
  campaignId,
  onMarkSent,
}: {
  title: string;
  color: "yellow" | "blue" | "gray";
  items: QueueItem[];
  campaignId: string;
  onMarkSent: () => void;
}) {
  const headerClass =
    color === "yellow"
      ? "text-yellow-700"
      : color === "blue"
        ? "text-blue-700"
        : "text-gray-500";

  const dotClass =
    color === "yellow"
      ? "bg-yellow-400"
      : color === "blue"
        ? "bg-blue-400"
        : "bg-gray-400";

  return (
    <div className="mb-5">
      <div className={`flex items-center gap-2 mb-2 text-sm font-semibold uppercase tracking-wide ${headerClass}`}>
        <span className={`w-2 h-2 rounded-full ${dotClass}`} />
        {title}
        <span className="font-normal normal-case tracking-normal text-gray-400">
          ({items.length})
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {items.map((item) => (
          <QueueCard
            key={item.contact.id}
            contact={item.contact}
            status={item.status}
            campaignId={campaignId}
            touchCount={item.touchCount}
            lastChannel={item.lastChannel}
            draftTouchId={item.draftTouchId}
            hasReply={item.hasReply}
            onMarkSent={onMarkSent}
          />
        ))}
      </div>
    </div>
  );
}
