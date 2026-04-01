"use client";

import { useCallback, useEffect, useState } from "react";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface VoiceExample {
  id: string;
  channel: "email" | "linkedin";
  archetype: string | null;
  subject: string | null;
  body: string;
  notes: string | null;
  createdAt: string | null;
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function VoiceExamplesPage() {
  const [examples, setExamples] = useState<VoiceExample[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add form state
  const [addChannel, setAddChannel] = useState<"email" | "linkedin">("email");
  const [addArchetype, setAddArchetype] = useState("");
  const [addSubject, setAddSubject] = useState("");
  const [addBody, setAddBody] = useState("");
  const [addNotes, setAddNotes] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const fetchExamples = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/voice-examples");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to load voice examples");
      }
      const data: VoiceExample[] = await res.json();
      setExamples(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchExamples();
  }, [fetchExamples]);

  async function handleAdd() {
    if (!addBody.trim()) {
      setAddError("Body is required");
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      const res = await fetch("/api/voice-examples", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: addChannel,
          archetype: addArchetype.trim() || undefined,
          subject: addChannel === "email" ? (addSubject.trim() || undefined) : undefined,
          body: addBody.trim(),
          notes: addNotes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to add voice example");
      }
      // Reset form
      setAddArchetype("");
      setAddSubject("");
      setAddBody("");
      setAddNotes("");
      await fetchExamples();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setAdding(false);
    }
  }

  async function handleUpdate(id: string, fields: Partial<VoiceExample>) {
    try {
      const res = await fetch("/api/voice-examples", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...fields }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to update");
      }
      await fetchExamples();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update");
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch("/api/voice-examples", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to delete");
      }
      await fetchExamples();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  const emailExamples = examples.filter((e) => e.channel === "email");
  const linkedinExamples = examples.filter((e) => e.channel === "linkedin");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Voice Examples</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Add example messages that teach the AI your writing style.
        </p>
      </div>

      {/* ── Add Form ────────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-[var(--border)] p-5 space-y-4">
        <h2 className="text-base font-semibold">Add Example</h2>

        {addError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            {addError}
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Channel */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Channel</label>
            <select
              value={addChannel}
              onChange={(e) => setAddChannel(e.target.value as "email" | "linkedin")}
              className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            >
              <option value="email">Email</option>
              <option value="linkedin">LinkedIn</option>
            </select>
          </div>

          {/* Archetype */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Archetype <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={addArchetype}
              onChange={(e) => setAddArchetype(e.target.value)}
              placeholder="e.g. warm intro, follow-up"
              className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
          </div>
        </div>

        {/* Subject — email only */}
        {addChannel === "email" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Subject <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={addSubject}
              onChange={(e) => setAddSubject(e.target.value)}
              placeholder="Subject line"
              className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
          </div>
        )}

        {/* Body */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Body</label>
          <textarea
            value={addBody}
            onChange={(e) => setAddBody(e.target.value)}
            rows={5}
            placeholder="Paste the full message body here…"
            className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] resize-y"
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Notes <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <textarea
            value={addNotes}
            onChange={(e) => setAddNotes(e.target.value)}
            rows={2}
            placeholder="Any context about this example…"
            className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] resize-y"
          />
        </div>

        <div>
          <button
            type="button"
            onClick={handleAdd}
            disabled={adding}
            className="px-4 py-2 rounded bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {adding ? "Adding…" : "Add Example"}
          </button>
        </div>
      </div>

      {/* ── List ────────────────────────────────────────────────────────── */}
      {loading && (
        <p className="text-[var(--muted-foreground)]">Loading examples…</p>
      )}

      {error && (
        <p className="text-red-500 text-sm">Error: {error}</p>
      )}

      {!loading && !error && examples.length === 0 && (
        <p className="text-center text-gray-500 py-10 border border-dashed border-[var(--border)] rounded">
          No voice examples yet. Add one above to get started.
        </p>
      )}

      {!loading && emailExamples.length > 0 && (
        <ExampleGroup
          title="Email"
          examples={emailExamples}
          onDelete={handleDelete}
          onUpdate={handleUpdate}
        />
      )}

      {!loading && linkedinExamples.length > 0 && (
        <ExampleGroup
          title="LinkedIn"
          examples={linkedinExamples}
          onDelete={handleDelete}
          onUpdate={handleUpdate}
        />
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function ExampleGroup({
  title,
  examples,
  onDelete,
  onUpdate,
}: {
  title: string;
  examples: VoiceExample[];
  onDelete: (id: string) => void;
  onUpdate: (id: string, fields: Partial<VoiceExample>) => Promise<void>;
}) {
  return (
    <div>
      <h2 className="text-base font-semibold text-gray-800 mb-3">{title}</h2>
      <div className="space-y-3">
        {examples.map((ex) => (
          <ExampleCard key={ex.id} example={ex} onDelete={onDelete} onUpdate={onUpdate} />
        ))}
      </div>
    </div>
  );
}

function ExampleCard({
  example,
  onDelete,
  onUpdate,
}: {
  example: VoiceExample;
  onDelete: (id: string) => void;
  onUpdate: (id: string, fields: Partial<VoiceExample>) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editSubject, setEditSubject] = useState(example.subject ?? "");
  const [editBody, setEditBody] = useState(example.body);
  const [editArchetype, setEditArchetype] = useState(example.archetype ?? "");
  const [editNotes, setEditNotes] = useState(example.notes ?? "");

  const PREVIEW_LENGTH = 200;
  const bodyPreview =
    example.body.length > PREVIEW_LENGTH
      ? example.body.slice(0, PREVIEW_LENGTH) + "…"
      : example.body;

  async function handleSave() {
    setSaving(true);
    try {
      await onUpdate(example.id, {
        subject: example.channel === "email" ? (editSubject.trim() || null) : null,
        body: editBody.trim(),
        archetype: editArchetype.trim() || null,
        notes: editNotes.trim() || null,
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="rounded-lg border border-[var(--primary)] p-4 space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Archetype</label>
            <input
              type="text"
              value={editArchetype}
              onChange={(e) => setEditArchetype(e.target.value)}
              placeholder="e.g. warm intro, follow-up"
              className="w-full rounded border border-[var(--border)] px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
          </div>
          {example.channel === "email" && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Subject</label>
              <input
                type="text"
                value={editSubject}
                onChange={(e) => setEditSubject(e.target.value)}
                className="w-full rounded border border-[var(--border)] px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              />
            </div>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Body</label>
          <textarea
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            rows={6}
            className="w-full rounded border border-[var(--border)] px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] resize-y"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
          <textarea
            value={editNotes}
            onChange={(e) => setEditNotes(e.target.value)}
            rows={2}
            className="w-full rounded border border-[var(--border)] px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] resize-y"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !editBody.trim()}
            className="px-3 py-1.5 rounded bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setEditSubject(example.subject ?? "");
              setEditBody(example.body);
              setEditArchetype(example.archetype ?? "");
              setEditNotes(example.notes ?? "");
            }}
            className="px-3 py-1.5 rounded bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--border)] p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={[
              "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
              example.channel === "email"
                ? "bg-blue-100 text-blue-700"
                : "bg-purple-100 text-purple-700",
            ].join(" ")}
          >
            {example.channel === "email" ? "Email" : "LinkedIn"}
          </span>
          {example.archetype && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
              {example.archetype}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs text-[var(--primary)] hover:underline"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => onDelete(example.id)}
            className="text-xs text-red-500 hover:text-red-700 hover:underline"
          >
            Delete
          </button>
        </div>
      </div>

      {example.subject && (
        <p className="mt-2 text-sm font-medium text-gray-800">
          Subject: {example.subject}
        </p>
      )}

      <div className="mt-2">
        <p className="text-sm text-gray-700 whitespace-pre-wrap">
          {expanded ? example.body : bodyPreview}
        </p>
        {example.body.length > PREVIEW_LENGTH && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="mt-1 text-xs text-[var(--primary)] hover:underline"
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        )}
      </div>

      {example.notes && (
        <p className="mt-2 text-xs text-gray-500 italic">{example.notes}</p>
      )}
    </div>
  );
}
