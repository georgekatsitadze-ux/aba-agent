// server/server.js
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { postToSlack } from "./slack.js"; // requires server/slack.js (from earlier step)

const app = express();
app.use(cors());
app.use(express.json());

// ---------------- Demo data (safe to replace later) ----------------
const patients = [
  { id: 1, name: "Ada Lovelace", dob: "1815-12-10", mrn: "A001" },
  { id: 2, name: "Alan Turing",  dob: "1912-06-23", mrn: "A002" },
  { id: 3, name: "Grace Hopper", dob: "1906-12-09", mrn: "A003" },
];

const invoices = [
  { id: 1001, patientName: "Ada Lovelace", amount: 250.0, status: "Submitted" },
  { id: 1002, patientName: "Alan Turing",  amount: 180.0, status: "Draft" },
];

// ---- Clinical (in-memory) ----
const goals = [
  { id: 1, patientId: 1, title: "Transition calmly", target: "80% compliance", baseline: 20 }
];
const sessions = [
  { id: 1, goalId: 1, date: "2025-09-15", value: 3 }
];
const notes = [
  { id: 1, sessionId: 1, text: "Good progress.", createdAt: new Date().toISOString() }
];

const nextId = (arr) => (arr.length ? Math.max(...arr.map(x => x.id)) + 1 : 1);

// ---------------- Health ----------------
app.get("/api/health", (_req, res) => {
  const slackEnabled = /^true$/i.test(process.env.SLACK_NOTIFICATIONS_ENABLED || "");
  res.json({ ok: true, slackEnabled });
});

// ---------------- Patients & Invoices ----------------
app.get("/api/patients", (req, res) => {
  const q = (req.query.q || "").toString().toLowerCase();
  const result = q ? patients.filter(p => p.name.toLowerCase().includes(q)) : patients;
  res.json(result);
});

app.get("/api/invoices", (_req, res) => {
  res.json(invoices);
});

// ---------------- Clinical: Goals ----------------
app.get("/api/goals", (req, res) => {
  const patientId = req.query.patientId ? Number(req.query.patientId) : null;
  const list = patientId ? goals.filter(g => g.patientId === patientId) : goals;
  res.json(list);
});

app.post("/api/goals", (req, res) => {
  const { patientId, title, target = "", baseline = 0 } = req.body || {};
  if (!patientId || !title) {
    return res.status(400).json({ error: "patientId and title are required" });
  }
  const item = {
    id: nextId(goals),
    patientId: Number(patientId),
    title: String(title),
    target: String(target || ""),
    baseline: Number(baseline || 0),
  };
  goals.push(item);
  res.status(201).json(item);
});

app.put("/api/goals/:id", (req, res) => {
  const id = Number(req.params.id);
  const idx = goals.findIndex(g => g.id === id);
  if (idx === -1) return res.status(404).json({ error: "not found" });
  goals[idx] = { ...goals[idx], ...req.body, id };
  res.json(goals[idx]);
});

app.delete("/api/goals/:id", (req, res) => {
  const id = Number(req.params.id);
  const idx = goals.findIndex(g => g.id === id);
  if (idx === -1) return res.status(404).json({ error: "not found" });
  goals.splice(idx, 1);
  // cascade delete sessions/notes for this goal
  const toDeleteSessionIds = sessions.filter(s => s.goalId === id).map(s => s.id);
  for (let i = sessions.length - 1; i >= 0; i--) if (sessions[i].goalId === id) sessions.splice(i, 1);
  for (let i = notes.length - 1; i >= 0; i--) if (toDeleteSessionIds.includes(notes[i].sessionId)) notes.splice(i, 1);
  res.json({ ok: true });
});

// ---------------- Clinical: Sessions ----------------
app.get("/api/sessions", (req, res) => {
  const goalId = req.query.goalId ? Number(req.query.goalId) : null;
  let list = goalId ? sessions.filter(s => s.goalId === goalId) : sessions;
  list = list.sort((a, b) => a.date.localeCompare(b.date));
  res.json(list);
});

app.post("/api/sessions", (req, res) => {
  let { goalId, date, value } = req.body || {};
  if (!goalId) return res.status(400).json({ error: "goalId required" });
  if (!date) date = new Date().toISOString().slice(0, 10);
  const item = {
    id: nextId(sessions),
    goalId: Number(goalId),
    date: String(date),
    value: Number(value || 0),
  };
  sessions.push(item);
  res.status(201).json(item);
});

// ---------------- Clinical: Notes ----------------
app.get("/api/notes", (req, res) => {
  const sessionId = req.query.sessionId ? Number(req.query.sessionId) : null;
  const list = sessionId ? notes.filter(n => n.sessionId === sessionId) : notes;
  res.json(list);
});

app.post("/api/notes", (req, res) => {
  const { sessionId, text } = req.body || {};
  if (!sessionId || !text) return res.status(400).json({ error: "sessionId and text required" });
  const item = {
    id: nextId(notes),
    sessionId: Number(sessionId),
    text: String(text),
    createdAt: new Date().toISOString(),
  };
  notes.push(item);
  res.status(201).json(item);
});

// ---------------- Slack notify (no PHI) ----------------
app.post("/api/notify", async (req, res) => {
  try {
    const { text, channel, blocks } = req.body || {};
    const info = await postToSlack({ text, channel, blocks });
    res.json({ ok: true, ...info });
  } catch (err) {
    const msg = (err && err.message) || String(err);
    if (msg.includes("DISABLED")) return res.status(503).json({ ok: false, error: "slack_disabled" });
    if (msg.includes("MISSING"))  return res.status(500).json({ ok: false, error: msg });
    console.error("notify error:", err);
    res.status(500).json({ ok: false, error: "slack_error" });
  }
});

// ---------------- Listen ----------------
const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`API listening on :${port}`));

