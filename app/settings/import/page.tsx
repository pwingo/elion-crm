"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Papa from "papaparse";

interface Campaign {
  id: string;
  name: string;
}

interface ImportResult {
  created: number;
  updated: number;
  errors: number;
  emailsResolved: number;
}

export default function ImportPage() {
  const searchParams = useSearchParams();
  const preselectedCampaignId = searchParams.get("campaignId");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/campaigns")
      .then((r) => r.json())
      .then((data: Campaign[]) => {
        setCampaigns(data);
        if (preselectedCampaignId && data.some((c) => c.id === preselectedCampaignId)) {
          setCampaignId(preselectedCampaignId);
        } else if (data.length > 0) {
          setCampaignId(data[0].id);
        }
      })
      .catch(() => setErrorMsg("Failed to load campaigns."));
  }, [preselectedCampaignId]);

  async function handleImport() {
    setErrorMsg(null);
    setResult(null);

    const file = fileRef.current?.files?.[0];
    if (!file) {
      setErrorMsg("Please select a CSV file.");
      return;
    }
    if (!campaignId) {
      setErrorMsg("Please select a campaign.");
      return;
    }

    const text = await file.text();
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
    });

    if (parsed.errors.length > 0) {
      const firstError = parsed.errors[0];
      setErrorMsg(`CSV parse error: ${firstError.message} (row ${firstError.row})`);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/contacts/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: parsed.data, campaignId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        setErrorMsg(err.error ?? "Import failed.");
        return;
      }

      const data: ImportResult = await res.json();
      setResult(data);
    } catch (err) {
      setErrorMsg("Network error — import failed.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="text-2xl font-semibold">Import Contacts</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Upload a CSV file to import contacts into a campaign.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="campaign" className="block text-sm font-medium mb-1">
            Campaign
          </label>
          <select
            id="campaign"
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
            className="w-full border border-[var(--border)] rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
          >
            {campaigns.length === 0 && (
              <option value="">No campaigns available</option>
            )}
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="csv-file" className="block text-sm font-medium mb-1">
            CSV File
          </label>
          <input
            id="csv-file"
            ref={fileRef}
            type="file"
            accept=".csv"
            className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-[var(--primary)] file:text-white hover:file:opacity-90"
          />
        </div>

        <button
          type="button"
          onClick={handleImport}
          disabled={loading || campaigns.length === 0}
          className="px-4 py-2 rounded bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Importing…" : "Import"}
        </button>
      </div>

      {errorMsg && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      {result && (
        <div className="rounded border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 space-y-1">
          <p className="font-medium">Import complete</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>{result.created} contact{result.created !== 1 ? "s" : ""} created</li>
            <li>{result.updated} contact{result.updated !== 1 ? "s" : ""} updated</li>
            {result.emailsResolved > 0 && (
              <li>{result.emailsResolved} email{result.emailsResolved !== 1 ? "s" : ""} resolved from Attio</li>
            )}
            {result.errors > 0 && (
              <li className="text-red-700">{result.errors} row{result.errors !== 1 ? "s" : ""} had errors (see server logs)</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
