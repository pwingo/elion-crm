export default function ExportPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Export Data</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Download a CSV file of all your contacts.
        </p>
      </div>

      <div className="rounded-lg border border-[var(--border)] p-6 flex flex-col gap-3 max-w-sm">
        <h2 className="text-base font-medium text-gray-800">Contacts CSV</h2>
        <p className="text-sm text-gray-500">
          Exports all contacts with columns: Name, Organization, Title, Email,
          LinkedIn, Owner, Prospect, POC, and Notes.
        </p>
        <a
          href="/api/contacts/export"
          download
          className="inline-flex items-center justify-center px-4 py-2 rounded bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Download CSV
        </a>
      </div>
    </div>
  );
}
