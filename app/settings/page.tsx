import Link from "next/link";
import { db } from "@/lib/db";
import { campaigns } from "@/lib/schema";
import { requireUser } from "@/lib/auth";
import { desc } from "drizzle-orm";
import { redirect } from "next/navigation";
import type { CampaignType } from "@/lib/schema";

const typeLabels: Record<CampaignType, string> = {
  provider_recruiting: "Provider Recruiting",
  vendor_recruiting: "Vendor Recruiting",
  sales: "Sales",
  content: "Content",
  conference: "Conference",
  other: "Other",
};

export default async function SettingsPage() {
  let user;
  try {
    user = await requireUser();
  } catch {
    redirect("/login");
  }

  const campaignRows = await db
    .select()
    .from(campaigns)
    .orderBy(desc(campaigns.createdAt));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Manage campaigns and account configuration.
        </p>
      </div>

      {/* Quick links */}
      <div className="flex gap-3 flex-wrap">
        <Link
          href="/settings/import"
          className="px-4 py-2 rounded border border-[var(--border)] text-sm hover:bg-gray-50 transition-colors"
        >
          Import Contacts
        </Link>
        <Link
          href="/settings/voice-examples"
          className="px-4 py-2 rounded border border-[var(--border)] text-sm hover:bg-gray-50 transition-colors"
        >
          Voice Examples
        </Link>
        <Link
          href="/settings/export"
          className="px-4 py-2 rounded border border-[var(--border)] text-sm hover:bg-gray-50 transition-colors"
        >
          Export Data
        </Link>
      </div>

      {/* Campaigns section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium">Campaigns</h2>
          <Link
            href="/settings/campaigns/new"
            className="px-4 py-2 rounded bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
          >
            New Campaign
          </Link>
        </div>

        {campaignRows.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)] py-8 text-center border border-dashed border-[var(--border)] rounded">
            No campaigns yet. Create your first campaign to get started.
          </p>
        ) : (
          <div className="grid gap-3">
            {campaignRows.map((campaign) => (
              <Link
                key={campaign.id}
                href={`/settings/campaigns/${campaign.id}`}
                className="block p-4 rounded-lg border border-[var(--border)] hover:border-[var(--primary)] hover:bg-blue-50/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{campaign.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-[var(--muted-foreground)]">
                        {typeLabels[campaign.type as CampaignType] ?? campaign.type}
                      </span>
                      {campaign.campaignGroup && (
                        <>
                          <span className="text-xs text-[var(--muted-foreground)]">·</span>
                          <span className="text-xs text-[var(--muted-foreground)]">
                            {campaign.campaignGroup}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <span
                    className={[
                      "shrink-0 text-xs font-medium px-2 py-0.5 rounded-full",
                      campaign.isActive
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-500",
                    ].join(" ")}
                  >
                    {campaign.isActive ? "Active" : "Inactive"}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
