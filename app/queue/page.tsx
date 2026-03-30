"use client";

import { useCallback, useEffect, useState } from "react";
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

  const isEmpty =
    !loading && data != null && data.campaigns.length === 0;

  return (
    <div>
      <h1 className="text-2xl font-semibold">My Queue</h1>

      {/* Summary bar */}
      {!loading && !error && data && data.campaigns.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-3">
          <SummaryChip
            count={totalNeedsMarkSent}
            label="awaiting send confirmation"
            color="yellow"
          />
          <SummaryChip count={totalDueToday} label="due today" color="blue" />
          <SummaryChip count={totalUpcoming} label="upcoming (7 days)" color="gray" />
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
            <Link href="/pipeline" className="text-[var(--primary)] hover:underline">
              Pipeline
            </Link>{" "}
            to start outreach.
          </p>
        </div>
      )}

      {/* Campaign groups */}
      {data?.campaigns.map((group) => (
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
            onMarkSent={onMarkSent}
          />
        ))}
      </div>
    </div>
  );
}
