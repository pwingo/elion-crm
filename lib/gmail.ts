import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { getGmailClient } from "@/lib/auth";
import { eq, isNotNull } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GmailMessage {
  messageId: string;
  from: string;
  to: string;
  date: string;
  subject: string;
  body: string;
}

export interface GmailThread {
  subject: string;
  messages: GmailMessage[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function extractHeader(
  headers: Array<{ name?: string | null; value?: string | null }> | undefined,
  name: string,
): string {
  if (!headers) return "";
  const lower = name.toLowerCase();
  return headers.find((h) => h.name?.toLowerCase() === lower)?.value ?? "";
}

export function decodeBody(
  payload: {
    mimeType?: string | null;
    body?: { data?: string | null } | null;
    parts?: Array<{
      mimeType?: string | null;
      body?: { data?: string | null } | null;
      parts?: unknown[];
    }> | null;
  } | null | undefined,
): string {
  if (!payload) return "";

  // If there's a direct body with data and mimeType is text/plain
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return Buffer.from(payload.body.data, "base64").toString("utf-8");
  }

  // Recurse into parts
  if (payload.parts && payload.parts.length > 0) {
    for (const part of payload.parts) {
      const text = decodeBody(
        part as Parameters<typeof decodeBody>[0],
      );
      if (text) return text;
    }
  }

  return "";
}

// ─── Core functions ───────────────────────────────────────────────────────────

export async function searchUserMailbox(
  userId: string,
  contactEmail: string,
): Promise<GmailThread[]> {
  const gmail = await getGmailClient(userId);
  if (!gmail) return [];

  const query = `from:${contactEmail} OR to:${contactEmail}`;

  let threadList: Array<{ id?: string | null }> = [];
  try {
    const res = await gmail.users.threads.list({
      userId: "me",
      q: query,
      maxResults: 5,
    });
    threadList = res.data.threads ?? [];
  } catch (err) {
    console.error(`[gmail] searchUserMailbox failed for userId=${userId}:`, err);
    return [];
  }

  const threads: GmailThread[] = [];

  for (const threadRef of threadList) {
    if (!threadRef.id) continue;

    let threadMessages: Array<{
      id?: string | null;
      payload?: {
        headers?: Array<{ name?: string | null; value?: string | null }> | null;
        mimeType?: string | null;
        body?: { data?: string | null } | null;
        parts?: Array<{
          mimeType?: string | null;
          body?: { data?: string | null } | null;
          parts?: unknown[];
        }> | null;
      } | null;
    }>;
    try {
      const threadData = await gmail.users.threads.get({
        userId: "me",
        id: threadRef.id,
        format: "full",
        metadataHeaders: ["Message-ID", "From", "To", "Subject", "Date"],
      });
      threadMessages = threadData.data.messages ?? [];
    } catch (err) {
      console.error(`[gmail] Failed to get thread ${threadRef.id}:`, err);
      continue;
    }

    const allMessages = threadMessages;
    if (allMessages.length === 0) continue;

    // Select: first message + 3 most recent. If ≤4, include all.
    let selectedMessages: typeof allMessages;
    if (allMessages.length <= 4) {
      selectedMessages = allMessages;
    } else {
      const first = allMessages[0];
      const lastThree = allMessages.slice(-3);
      // Deduplicate in case first is also in lastThree
      const ids = new Set<string>();
      selectedMessages = [];
      for (const m of [first, ...lastThree]) {
        if (m.id && !ids.has(m.id)) {
          ids.add(m.id);
          selectedMessages.push(m);
        }
      }
    }

    const messages: GmailMessage[] = [];
    let threadSubject = "";

    for (const msg of selectedMessages) {
      const headers = msg.payload?.headers ?? [];
      const messageId = extractHeader(headers, "Message-ID");
      const from = extractHeader(headers, "From");
      const to = extractHeader(headers, "To");
      const date = extractHeader(headers, "Date");
      const subject = extractHeader(headers, "Subject");

      if (!threadSubject && subject) threadSubject = subject;

      const rawBody = decodeBody(msg.payload);
      const body = rawBody.slice(0, 2000);

      messages.push({ messageId, from, to, date, subject, body });
    }

    threads.push({ subject: threadSubject, messages });
  }

  return threads;
}

export async function getCorrespondenceHistory(
  contactEmail: string,
): Promise<GmailThread[]> {
  // 1. Get all users with a Google access token
  const allUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(isNotNull(users.googleAccessToken));

  // 2. Search each user's mailbox in parallel
  const perUserThreads = await Promise.all(
    allUsers.map((u) => searchUserMailbox(u.id, contactEmail)),
  );

  // 3. Flatten
  const allThreads = perUserThreads.flat();

  // 4. Merge threads by subject — when the same thread appears in multiple
  //    users' mailboxes, combine their messages and deduplicate by Message-ID.
  const threadMap = new Map<string, GmailThread>();
  for (const thread of allThreads) {
    // Normalize subject for matching (strip Re:/Fwd: prefixes, lowercase)
    const normSubject = thread.subject
      .replace(/^(re|fwd|fw)\s*:\s*/gi, "")
      .trim()
      .toLowerCase();
    const key = normSubject || crypto.randomUUID(); // unique key if no subject

    const existing = threadMap.get(key);
    if (existing) {
      // Merge messages, deduplicate by Message-ID
      const seenIds = new Set(existing.messages.map((m) => m.messageId).filter(Boolean));
      for (const msg of thread.messages) {
        if (msg.messageId && seenIds.has(msg.messageId)) continue;
        seenIds.add(msg.messageId);
        existing.messages.push(msg);
      }
      // Re-sort merged messages by date (oldest first for storage; UI reverses)
      existing.messages.sort(
        (a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime(),
      );
    } else {
      threadMap.set(key, { subject: thread.subject, messages: [...thread.messages] });
    }
  }
  const deduped = [...threadMap.values()];

  // 5. Sort threads by most recent message date (newest thread first)
  deduped.sort((a, b) => {
    const dateA = new Date(a.messages[a.messages.length - 1]?.date ?? 0).getTime();
    const dateB = new Date(b.messages[b.messages.length - 1]?.date ?? 0).getTime();
    return dateB - dateA;
  });

  // 6. Enforce ~20,000 char budget — drop older threads if over budget
  const CHAR_BUDGET = 20_000;
  let total = 0;
  const budgeted: GmailThread[] = [];
  for (const thread of deduped) {
    const size = thread.messages.reduce((sum, m) => sum + m.body.length, 0);
    if (total + size > CHAR_BUDGET) break;
    total += size;
    budgeted.push(thread);
  }

  return budgeted;
}

function mimeEncodeSubject(subject: string): string {
  // RFC 2047: encode non-ASCII subjects as =?UTF-8?B?<base64>?=
  if (/^[\x20-\x7E]*$/.test(subject)) return subject;
  const b64 = Buffer.from(subject, "utf-8").toString("base64");
  return `=?UTF-8?B?${b64}?=`;
}

export async function createGmailDraft(
  userId: string,
  to: string,
  subject: string,
  body: string,
): Promise<string | null> {
  const gmail = await getGmailClient(userId);
  if (!gmail) return null;

  // Look up the user's email for the From header
  const [user] = await db
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const from = user?.name
    ? `${user.name} <${user.email}>`
    : user?.email ?? "me";

  const raw =
    `MIME-Version: 1.0\r\n` +
    `From: ${from}\r\n` +
    `To: ${to}\r\n` +
    `Subject: ${mimeEncodeSubject(subject)}\r\n` +
    `Content-Type: text/plain; charset=utf-8\r\n` +
    `\r\n` +
    body;

  const encoded = Buffer.from(raw)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  try {
    const res = await gmail.users.drafts.create({
      userId: "me",
      requestBody: {
        message: { raw: encoded },
      },
    });
    return res.data.id ?? null;
  } catch (err) {
    console.error(`[gmail] createGmailDraft failed for userId=${userId}:`, err);
    return null;
  }
}
