"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const campaignTypeOptions = [
  { value: "provider_recruiting", label: "Provider Recruiting" },
  { value: "vendor_recruiting", label: "Vendor Recruiting" },
  { value: "sales", label: "Sales" },
  { value: "content", label: "Content" },
  { value: "conference", label: "Conference" },
  { value: "other", label: "Other" },
] as const;

interface Campaign {
  id: string;
  name: string;
  type: string;
  campaignGroup: string | null;
  date: string | null;
  location: string | null;
  description: string;
  sellingPoints: string;
  isActive: boolean;
  cadenceDays: string;
  maxTouches: number;
}

export default function EditCampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/campaigns/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then(setCampaign)
      .catch(() => setError("Campaign not found"))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

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
      const res = await fetch(`/api/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? `Request failed (${res.status})`);
      }

      router.push("/settings");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  if (loading) return <div className="text-gray-500">Loading...</div>;
  if (!campaign) return <div className="text-red-500">{error || "Campaign not found"}</div>;

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Edit Campaign</h1>
        <Link
          href={`/settings/import?campaignId=${id}`}
          className="px-4 py-2 rounded border border-[var(--border)] text-sm hover:bg-gray-50 transition-colors"
        >
          Import Contacts
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="name" className="block text-sm font-medium mb-1">
            Campaign Name <span className="text-[var(--destructive)]">*</span>
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            defaultValue={campaign.name}
            className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
          />
        </div>

        <div>
          <label htmlFor="type" className="block text-sm font-medium mb-1">
            Type <span className="text-[var(--destructive)]">*</span>
          </label>
          <select
            id="type"
            name="type"
            required
            defaultValue={campaign.type}
            className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
          >
            {campaignTypeOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="campaignGroup" className="block text-sm font-medium mb-1">
            Campaign Group
          </label>
          <input
            id="campaignGroup"
            name="campaignGroup"
            type="text"
            defaultValue={campaign.campaignGroup ?? ""}
            className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="date" className="block text-sm font-medium mb-1">Date</label>
            <input
              id="date"
              name="date"
              type="text"
              defaultValue={campaign.date ?? ""}
              className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
          </div>
          <div>
            <label htmlFor="location" className="block text-sm font-medium mb-1">Location</label>
            <input
              id="location"
              name="location"
              type="text"
              defaultValue={campaign.location ?? ""}
              className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
          </div>
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-medium mb-1">
            Description <span className="text-[var(--destructive)]">*</span>
          </label>
          <textarea
            id="description"
            name="description"
            required
            rows={4}
            defaultValue={campaign.description}
            className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] resize-y"
          />
        </div>

        <div>
          <label htmlFor="sellingPoints" className="block text-sm font-medium mb-1">
            Selling Points <span className="text-[var(--destructive)]">*</span>
          </label>
          <textarea
            id="sellingPoints"
            name="sellingPoints"
            required
            rows={4}
            defaultValue={campaign.sellingPoints}
            className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] resize-y"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="cadenceDays" className="block text-sm font-medium mb-1">
              Cadence (JSON array of days)
            </label>
            <input
              id="cadenceDays"
              name="cadenceDays"
              type="text"
              defaultValue={campaign.cadenceDays}
              className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
          </div>
          <div>
            <label htmlFor="maxTouches" className="block text-sm font-medium mb-1">
              Max Touches
            </label>
            <input
              id="maxTouches"
              name="maxTouches"
              type="number"
              min={1}
              defaultValue={campaign.maxTouches}
              className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            id="isActive"
            name="isActive"
            type="checkbox"
            defaultChecked={campaign.isActive}
            className="rounded"
          />
          <label htmlFor="isActive" className="text-sm">Active</label>
        </div>

        {error && <p className="text-sm text-[var(--destructive)]">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2 rounded bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Save Changes"}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-5 py-2 rounded border border-[var(--border)] text-sm hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
