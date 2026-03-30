"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const campaignTypeOptions = [
  { value: "provider_recruiting", label: "Provider Recruiting" },
  { value: "vendor_recruiting", label: "Vendor Recruiting" },
  { value: "sales", label: "Sales" },
  { value: "content", label: "Content" },
  { value: "conference", label: "Conference" },
  { value: "other", label: "Other" },
] as const;

export default function NewCampaignPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    };

    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
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

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold mb-6">New Campaign</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Name */}
        <div>
          <label htmlFor="name" className="block text-sm font-medium mb-1">
            Campaign Name <span className="text-[var(--destructive)]">*</span>
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            placeholder="e.g. Q3 Provider Outreach"
          />
        </div>

        {/* Type */}
        <div>
          <label htmlFor="type" className="block text-sm font-medium mb-1">
            Type <span className="text-[var(--destructive)]">*</span>
          </label>
          <select
            id="type"
            name="type"
            required
            defaultValue=""
            className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
          >
            <option value="" disabled>
              Select a type…
            </option>
            {campaignTypeOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Campaign Group */}
        <div>
          <label htmlFor="campaignGroup" className="block text-sm font-medium mb-1">
            Campaign Group
          </label>
          <input
            id="campaignGroup"
            name="campaignGroup"
            type="text"
            className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            placeholder="e.g. Healthcare 2026"
          />
        </div>

        {/* Date */}
        <div>
          <label htmlFor="date" className="block text-sm font-medium mb-1">
            Date
          </label>
          <input
            id="date"
            name="date"
            type="text"
            className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            placeholder="e.g. June 2026"
          />
        </div>

        {/* Location */}
        <div>
          <label htmlFor="location" className="block text-sm font-medium mb-1">
            Location
          </label>
          <input
            id="location"
            name="location"
            type="text"
            className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            placeholder="e.g. Chicago, IL"
          />
        </div>

        {/* Description */}
        <div>
          <label htmlFor="description" className="block text-sm font-medium mb-1">
            Description <span className="text-[var(--destructive)]">*</span>
          </label>
          <textarea
            id="description"
            name="description"
            required
            rows={4}
            className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] resize-y"
            placeholder="What is this campaign about?"
          />
        </div>

        {/* Selling Points */}
        <div>
          <label htmlFor="sellingPoints" className="block text-sm font-medium mb-1">
            Selling Points <span className="text-[var(--destructive)]">*</span>
          </label>
          <textarea
            id="sellingPoints"
            name="sellingPoints"
            required
            rows={4}
            className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] resize-y"
            placeholder="Key value propositions for outreach messaging…"
          />
        </div>

        {error && (
          <p className="text-sm text-[var(--destructive)]">{error}</p>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2 rounded bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create Campaign"}
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
