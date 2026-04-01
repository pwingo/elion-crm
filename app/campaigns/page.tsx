"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CampaignSummary {
  id: string;
  name: string;
  type: string;
  isActive: boolean | null;
  date: string | null;
  location: string | null;
  contactCount: number;
  statusBreakdown: Record<string, number>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function pillColor(status: string): string {
  if (status === "in_progress") return "bg-amber-100 text-amber-800";
  if (status === "responded" || status === "confirmed")
    return "bg-green-100 text-green-800";
  return "bg-gray-100 text-gray-600";
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch("/api/campaigns/summary")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load campaigns");
        return res.json();
      })
      .then((data: CampaignSummary[]) => setCampaigns(data))
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Unknown error"),
      )
      .finally(() => setLoading(false));
  }, []);

  // ── Loading state ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Campaigns</h1>
        <p className="mt-4 text-[var(--muted-foreground)]">Loading...</p>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <div>
      <h1 className="text-2xl font-semibold">Campaigns</h1>

      {/* Error */}
      {error && <p className="mt-4 text-red-500 text-sm">Error: {error}</p>}

      {/* Empty state */}
      {!error && campaigns.length === 0 && (
        <div className="mt-6 text-center text-gray-500 py-12 border border-dashed border-[var(--border)] rounded">
          <p>No campaigns found.</p>
          <Link href="/settings/campaigns/new" className="text-[var(--primary)] hover:underline text-sm">
            Create a campaign
          </Link>
        </div>
      )}

      {/* Campaign cards */}
      {campaigns.length > 0 && (
        <div className="mt-4 grid gap-3">
          {campaigns.map((campaign) => {
            const nonZeroStatuses = Object.entries(campaign.statusBreakdown)
              .filter(([, count]) => count > 0);

            return (
              <Link
                key={campaign.id}
                href={`/campaigns/${campaign.id}`}
                className="block rounded-lg border border-[var(--border)] px-5 py-4 hover:bg-gray-50 transition-colors"
              >
                {/* Name + subtitle */}
                <div className="flex items-baseline justify-between gap-4">
                  <div>
                    <span className="font-semibold text-gray-900">
                      {campaign.name}
                    </span>
                    <span className="ml-2 text-sm text-[var(--muted-foreground)]">
                      {[
                        campaign.type,
                        campaign.date,
                        campaign.location,
                        `${campaign.contactCount} contact${campaign.contactCount !== 1 ? "s" : ""}`,
                      ]
                        .filter(Boolean)
                        .join(" \u00b7 ")}
                    </span>
                  </div>
                </div>

                {/* Status pills */}
                {nonZeroStatuses.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {nonZeroStatuses.map(([status, count]) => (
                      <span
                        key={status}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${pillColor(status)}`}
                      >
                        {STATUS_LABELS[status] ?? status}
                        <span className="font-bold">{count}</span>
                      </span>
                    ))}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
