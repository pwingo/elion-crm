import Anthropic from "@anthropic-ai/sdk";
import type { GmailThread } from "@/lib/gmail";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DraftInput {
  contact: {
    name: string;
    organization: string;
    title: string | null;
    notes: string;
  };
  campaign: {
    name: string;
    type: string;
    date: string | null;
    location: string | null;
    description: string;
    sellingPoints: string;
  };
  gmailThreads: GmailThread[];
  touches: Array<{
    touchNumber: number | null;
    channel: string;
    state: string;
    sentAt: Date | null;
    subject: string | null;
    body: string | null;
  }>;
  voiceExamples: Array<{
    subject: string | null;
    body: string;
    archetype: string | null;
    notes: string | null;
  }>;
  channel: "email" | "linkedin";
  steering?: string;
  replyTouch?: {
    subject: string | null;
    body: string | null;
  };
}

// ─── Prompt helpers ───────────────────────────────────────────────────────────

function formatGmailThreads(threads: GmailThread[]): string {
  if (threads.length === 0) return "No previous email correspondence found.";
  return threads
    .map((thread, i) => {
      const msgs = thread.messages
        .map(
          (m) =>
            `  [${m.date}] From: ${m.from}\n  To: ${m.to}\n  ${m.body.trim()}`,
        )
        .join("\n\n");
      return `Thread ${i + 1}: ${thread.subject}\n${msgs}`;
    })
    .join("\n\n---\n\n");
}

function formatOutreachHistory(
  touches: DraftInput["touches"],
  channel: "email" | "linkedin",
): string {
  const sent = touches.filter((t) => t.state === "sent");
  if (sent.length === 0) return "No previous outreach sent.";
  return sent
    .map((t) => {
      const date = t.sentAt ? new Date(t.sentAt).toLocaleDateString() : "unknown date";
      const touch = t.touchNumber !== null ? `Touch #${t.touchNumber}` : "Touch";
      let line = `${touch} — ${date} — ${t.channel}`;
      if (t.subject) line += ` — Subject: "${t.subject}"`;
      // Include body for LinkedIn, NOT for email
      if (t.channel === "linkedin" && t.body) {
        line += `\n${t.body.trim()}`;
      }
      return line;
    })
    .join("\n\n");
}

function formatVoiceExamples(examples: DraftInput["voiceExamples"]): string {
  if (examples.length === 0) return "";
  return examples
    .map((ex) => {
      const archetype = ex.archetype ? `[${ex.archetype}]` : "";
      const notes = ex.notes ? ` (${ex.notes})` : "";
      const subjectLine = ex.subject ? `Subject: ${ex.subject}\n` : "";
      return `${archetype}${notes}\n${subjectLine}${ex.body.trim()}`;
    })
    .join("\n\n---\n\n");
}

// ─── Main function ────────────────────────────────────────────────────────────

export async function generateDraft(
  input: DraftInput,
): Promise<{ subject: string | null; body: string }> {
  const client = new Anthropic();

  const { contact, campaign, gmailThreads, touches, voiceExamples, channel, steering, replyTouch } =
    input;

  // System prompt
  const systemPrompt =
    `You are a skilled outreach writer for the Elion team. ` +
    `You write personalized, professional outreach messages on behalf of the Elion team.\n\n` +
    `Campaign context:\n` +
    `- Name: ${campaign.name}\n` +
    `- Type: ${campaign.type}\n` +
    (campaign.date ? `- Date: ${campaign.date}\n` : "") +
    (campaign.location ? `- Location: ${campaign.location}\n` : "") +
    `- Description: ${campaign.description}\n` +
    `- Selling points: ${campaign.sellingPoints}`;

  // User message sections
  const sections: string[] = [];

  // Contact profile
  sections.push(
    `## Contact Profile\n` +
      `Name: ${contact.name}\n` +
      `Organization: ${contact.organization}\n` +
      `Title: ${contact.title ?? "Unknown"}\n` +
      `Notes: ${contact.notes || "None"}`,
  );

  // Voice examples
  const voiceStr = formatVoiceExamples(voiceExamples);
  if (voiceStr) {
    sections.push(`## Voice Examples\n${voiceStr}`);
  }

  // Correspondence history
  sections.push(
    `## Correspondence History\n${formatGmailThreads(gmailThreads)}`,
  );

  // Outreach history
  sections.push(
    `## Outreach History\n${formatOutreachHistory(touches, channel)}`,
  );

  // Archetype guidance
  sections.push(
    `## Archetype Guidance\n` +
      `Based on the correspondence history and context above, determine the appropriate ` +
      `tone and approach for this outreach.`,
  );

  // Channel instruction
  // Reply mode: if the contact replied, shift to reply prompt
  if (replyTouch) {
    sections.push(
      `## Task\n` +
        `The contact has replied to your outreach. Their most recent message is below.\n` +
        `Write a reply to this email using lightweight HTML. Do not write a subject line — this will be sent\n` +
        `as a reply in the existing thread. Keep it conversational and responsive to\n` +
        `what they said.\n\n` +
        `Use simple HTML tags: <p> for paragraphs, <ul>/<li> for bullet lists, ` +
        `<a href="..."> for links, <strong> for bold, <em> for italic. ` +
        `Do NOT include <html>, <head>, <body>, or any CSS/style tags.\n\n` +
        `--- Their reply ---\n` +
        `Subject: ${replyTouch.subject ?? "(no subject)"}\n` +
        `Body: ${replyTouch.body ?? ""}\n` +
        `---\n\n` +
        `IMPORTANT: Only reference facts explicitly provided above. Never fabricate details ` +
        `about the contact's location, background, interests, or prior conversations that ` +
        `are not in the correspondence history or contact profile.\n\n` +
        `Respond with just the reply body as HTML, no prefix or subject line.`,
    );
  } else if (channel === "email") {
    sections.push(
      `## Task\n` +
        `Draft a personalized email with subject line using lightweight HTML. ` +
        `Match the voice of the examples. Account for the full relationship context.\n\n` +
        `Use simple HTML tags for formatting: <p> for paragraphs, <ul>/<li> for bullet lists, ` +
        `<a href="..."> for links, <strong> for bold, <em> for italic. ` +
        `Do NOT include <html>, <head>, <body>, or any CSS/style tags — just the inner content.\n\n` +
        `IMPORTANT: Only reference facts explicitly provided above. Never fabricate details ` +
        `about the contact's location, background, interests, or prior conversations that ` +
        `are not in the correspondence history or contact profile.\n\n` +
        `Respond in this exact format:\n` +
        `SUBJECT: <subject line>\n` +
        `BODY:\n` +
        `<email body as HTML>`,
    );
  } else {
    sections.push(
      `## Task\n` +
        `Draft a LinkedIn message. Keep it concise (2-4 short paragraphs, under 300 words). ` +
        `No subject line. More conversational and direct than email. ` +
        `Match the voice of the examples.\n\n` +
        `IMPORTANT: Only reference facts explicitly provided above. Never fabricate details ` +
        `about the contact's location, background, interests, or prior conversations that ` +
        `are not in the correspondence history or contact profile.\n\n` +
        `Respond with just the message body, no prefix.`,
    );
  }

  // Steering
  if (steering) {
    sections.push(`## Additional Guidance\n${steering}`);
  }

  const userMessage = sections.join("\n\n");

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  // Parse response
  if (replyTouch) {
    // Reply mode: body only, no subject
    return { subject: null, body: text.trim() };
  } else if (channel === "email") {
    const subjectMatch = text.match(/^SUBJECT:\s*(.+)/m);
    const bodyMatch = text.match(/^BODY:\s*\n([\s\S]+)/m);
    const subject = subjectMatch ? subjectMatch[1].trim() : null;
    const body = bodyMatch ? bodyMatch[1].trim() : text.trim();
    return { subject, body };
  } else {
    return { subject: null, body: text.trim() };
  }
}
