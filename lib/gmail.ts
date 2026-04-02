import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { getGmailClient } from "@/lib/auth";
import { eq, isNotNull } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GmailMessage {
  messageId: string;
  from: string;
  to: string;
  cc: string;
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

/**
 * Strip quoted reply lines and common email delimiters from a plain-text body,
 * keeping only the new content from this specific message.
 */
export function stripQuotedText(body: string): string {
  // Normalize line endings
  let text = body.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const lines = text.split("\n");
  const result: string[] = [];

  for (const line of lines) {
    // Stop at common "On ... wrote:" reply headers
    if (/^On .+ wrote:\s*$/.test(line)) break;
    // Stop at forwarded message markers
    if (/^-{2,}\s*Forwarded message\s*-{2,}/.test(line)) break;
    // Stop at common separator lines (e.g. "From: ..." block in Outlook-style)
    if (/^From:\s+.+@/.test(line) && result.length > 0) break;
    // Skip lines that are quoted replies
    if (/^\s*>/.test(line)) continue;

    result.push(line);
  }

  text = result.join("\n").trim();

  // Fix Gmail plain-text list formatting where bullet and content are on
  // separate lines: "* \n\nItem" or "* \n  \n  Item" → "* Item"
  text = text.replace(/([*•])\s*\n[\s\n]*(?=\S)/g, "$1 ");
  // Collapse 3+ consecutive newlines into 2
  text = text.replace(/\n{3,}/g, "\n\n");

  return text;
}

// ─── Core functions ───────────────────────────────────────────────────────────

export async function searchUserMailbox(
  userId: string,
  contactEmails: string[],
): Promise<GmailThread[]> {
  const gmail = await getGmailClient(userId);
  if (!gmail || contactEmails.length === 0) return [];

  const clauses = contactEmails.flatMap((e) => [`from:${e}`, `to:${e}`]);
  const query = clauses.join(" OR ");

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

  // Fetch all threads in parallel instead of sequentially
  const threadResults = await Promise.all(
    threadList
      .filter((ref): ref is { id: string } => Boolean(ref.id))
      .map(async (threadRef) => {
        try {
          const threadData = await gmail.users.threads.get({
            userId: "me",
            id: threadRef.id,
            format: "full",
            metadataHeaders: ["Message-ID", "From", "To", "Subject", "Date"],
          });
          return threadData.data.messages ?? [];
        } catch (err) {
          console.error(`[gmail] Failed to get thread ${threadRef.id}:`, err);
          return [];
        }
      }),
  );

  const threads: GmailThread[] = [];

  for (const allMessages of threadResults) {
    if (allMessages.length === 0) continue;

    // Select: first message + 3 most recent. If ≤4, include all.
    let selectedMessages: typeof allMessages;
    if (allMessages.length <= 4) {
      selectedMessages = allMessages;
    } else {
      const first = allMessages[0];
      const lastThree = allMessages.slice(-3);
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
      const cc = extractHeader(headers, "Cc");
      const date = extractHeader(headers, "Date");
      const subject = extractHeader(headers, "Subject");

      if (!threadSubject && subject) threadSubject = subject;

      const rawBody = decodeBody(msg.payload);
      const body = stripQuotedText(rawBody).slice(0, 2000);

      messages.push({ messageId, from, to, cc, date, subject, body });
    }

    threads.push({ subject: threadSubject, messages });
  }

  return threads;
}

export async function getCorrespondenceHistory(
  contactEmails: string[],
): Promise<GmailThread[]> {
  if (contactEmails.length === 0) return [];

  // 1. Get all users with a Google access token
  const allUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(isNotNull(users.googleAccessToken));

  // 2. Search each user's mailbox in parallel
  const perUserThreads = await Promise.all(
    allUsers.map((u) => searchUserMailbox(u.id, contactEmails)),
  );

  // 3. Flatten
  const allThreads = perUserThreads.flat();

  // 4. Merge threads by subject — when the same thread appears in multiple
  //    users' mailboxes, combine their messages and deduplicate by Message-ID.
  const threadMap = new Map<string, GmailThread>();
  for (const thread of allThreads) {
    // Normalize subject for matching (strip Re:/Fwd: prefixes, lowercase)
    const normSubject = thread.subject
      .replace(/^((re|fwd|fw)\s*:\s*)+/i, "")
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
  threadOptions?: {
    threadId: string;
    inReplyTo: string;
  },
): Promise<{ draftId: string; threadId: string } | null> {
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

  // Build threading headers when replying in an existing thread
  let threadHeaders = "";
  if (threadOptions) {
    threadHeaders += `In-Reply-To: ${threadOptions.inReplyTo}\r\n`;

    // Build References header from the thread's message history
    try {
      const threadData = await gmail.users.threads.get({
        userId: "me",
        id: threadOptions.threadId,
        format: "metadata",
        metadataHeaders: ["Message-ID"],
      });
      const messageIds = (threadData.data.messages ?? [])
        .map((msg) =>
          extractHeader(
            msg.payload?.headers as Array<{ name?: string | null; value?: string | null }> | undefined,
            "Message-ID",
          ),
        )
        .filter(Boolean);
      if (messageIds.length > 0) {
        threadHeaders += `References: ${messageIds.join(" ")}\r\n`;
      }
    } catch (err) {
      console.error("[gmail] Failed to fetch thread for References header:", err);
      // Fall back to In-Reply-To as the sole References value
      threadHeaders += `References: ${threadOptions.inReplyTo}\r\n`;
    }
  }

  const raw =
    `MIME-Version: 1.0\r\n` +
    `From: ${from}\r\n` +
    `To: ${to}\r\n` +
    `Subject: ${mimeEncodeSubject(subject)}\r\n` +
    threadHeaders +
    `Content-Type: text/html; charset=utf-8\r\n` +
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
        message: {
          raw: encoded,
          threadId: threadOptions?.threadId,
        },
      },
    });
    const draftId = res.data.id;
    const threadId = res.data.message?.threadId;
    if (!draftId || !threadId) return null;
    return { draftId, threadId };
  } catch (err) {
    console.error(`[gmail] createGmailDraft failed for userId=${userId}:`, err);
    return null;
  }
}
