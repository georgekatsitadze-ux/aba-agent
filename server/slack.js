// slack.js — safe, dependency-free wrapper.
// Tries to lazy-import @slack/web-api if present; otherwise becomes a no-op.

let client = null;
let enabled = false;

function readEnv() {
  try {
    enabled = /^true$/i.test(process.env.SLACK_NOTIFICATIONS_ENABLED || "");
  } catch {
    enabled = false;
  }
}

readEnv();

export async function postToSlack({ text, channel, blocks }) {
  // If disabled, silently skip.
  if (!enabled) return { ok: false, skipped: "disabled" };

  // Try lazy import on first use.
  if (!client) {
    try {
      const { WebClient } = await import("@slack/web-api");
      const token = process.env.SLACK_BOT_TOKEN || "";
      if (!token) return { ok: false, skipped: "missing_token" };
      client = new WebClient(token);
    } catch (e) {
      // Package not installed; skip without throwing.
      return { ok: false, skipped: "no_sdk" };
    }
  }

  const chan = channel || process.env.SLACK_CHANNEL_ID || "";
  if (!chan) return { ok: false, skipped: "missing_channel" };
  const res = await client.chat.postMessage({ channel: chan, text: text || "(no text)", blocks });
  return { ok: true, ts: res.ts, channel: res.channel };
}
