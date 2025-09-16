import { WebClient } from "@slack/web-api";

const enabled = /^true$/i.test(process.env.SLACK_NOTIFICATIONS_ENABLED || "");
const token = process.env.SLACK_BOT_TOKEN || "";
const defaultChannel = process.env.SLACK_CHANNEL_ID || "";
const client = token ? new WebClient(token) : null;

export async function postToSlack({ text, channel, blocks }) {
  if (!enabled) throw new Error("SLACK_NOTIFICATIONS_DISABLED");
  if (!client || !token) throw new Error("SLACK_TOKEN_MISSING");
  const chan = channel || defaultChannel;
  if (!chan) throw new Error("SLACK_CHANNEL_MISSING");
  const res = await client.chat.postMessage({ channel: chan, text: text || "(no text)", blocks });
  return { ts: res.ts, channel: res.channel };
}
