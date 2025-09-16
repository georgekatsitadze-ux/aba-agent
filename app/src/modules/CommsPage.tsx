import React from "react";
import api from "../lib/api";

export default function CommsPage() {
  const [text, setText] = React.useState("Hello from Magellan dev!");
  const [status, setStatus] = React.useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setStatus("Sending...");
    try {
      const res = await api.post("/notify", { text });
      setStatus(res.data?.ok ? "Sent ✅" : `Error: ${res.data?.error || "unknown"}`);
    } catch (err: any) {
      setStatus(`Error: ${err?.response?.data?.error || err.message}`);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12, maxWidth: 600 }}>
      <h2>Comms (Slack)</h2>
      <p style={{ color: "#666" }}>
        Sends a simple ops message to your configured Slack channel.
        Do <b>not</b> put PHI here.
      </p>
      <form onSubmit={send} style={{ display: "grid", gap: 8 }}>
        <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} />
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button type="submit">Send to Slack</button>
          {status && <span>{status}</span>}
        </div>
      </form>
    </div>
  );
}
