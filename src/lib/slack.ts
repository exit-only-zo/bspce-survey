import "server-only";

// Fire-and-forget Slack notification via an Incoming Webhook.
// Gated by SLACK_WEBHOOK_URL — if unset, this is a no-op (e.g. local dev).
// NEVER throws: a Slack outage must never break a survey submission. Kept short
// (3s timeout) so the user's response isn't held up.
export async function notifySlack(text: string): Promise<void> {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return;
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 3000);
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: ctrl.signal,
    });
    clearTimeout(tid);
  } catch {
    // swallow — notifications are best-effort.
  }
}
