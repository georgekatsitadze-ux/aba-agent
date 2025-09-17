// server/server.js
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { postToSlack } from "./slack.js"; // optional: if not present, it's fine (we use optional calls)

const app = express();
app.use(cors());
app.use(express.json());

// ---------------- In-memory demo data ----------------
const patients = [
  { id: 1, name: "Ada Lovelace", dob: "1815-12-10", mrn: "A001" },
  { id: 2, name: "Alan Turing",  dob: "1912-06-23", mrn: "A002" },
  { id: 3, name: "Grace Hopper", dob: "1906-09-12", mrn: "A003" },
];

// role: RBT | SLP | OT | PT
const clinicians = [
  { id: 1, role: "RBT", name: "RBT Alice", availability: { start: "08:00", end: "16:00" }, authorizedHours: 120 },
  { id: 2, role: "RBT", name: "RBT Bob",   availability: { start: "09:00", end: "17:00" }, authorizedHours: 120 },
  { id: 3, role: "RBT", name: "RBT Chen",  availability: { start: "08:30", end: "16:30" }, authorizedHours: 120 },
  { id: 101, role: "SLP", name: "SLP Sarah", availability: { start: "09:00", end: "15:00" }, authorizedHours: 80 },
  { id: 201, role: "OT",  name: "OT Omar",   availability: { start: "08:00", end: "14:00" }, authorizedHours: 80 },
  { id: 301, role: "PT",  name: "PT Priya",  availability: { start: "10:00", end: "18:00" }, authorizedHours: 80 },
];

const invoices = [
  { id: 1001, patientName: "Ada Lovelace", amount: 250.0, status: "Submitted" },
  { id: 1002, patientName: "Alan Turing",  amount: 180.0, status: "Draft" },
];

// Clinical sample entities (kept from earlier)
const goals = [{ id: 1, patientId: 1, title: "Transition calmly", target: "80% compliance", baseline: 20 }];
const sessions = [{ id: 1, goalId: 1, date: today(), value: 3 }];
const notes = [{ id: 1, sessionId: 1, text: "Good progress.", createdAt: new Date().toISOString() }];

// Scheduling (unified provider)
// status: scheduled | canceled | nap | speech
const schedule = [
  { id: 1, date: today(), start: "09:00", end: "11:00", providerRole: "RBT", providerId: 1, patientId: 1, status: "scheduled" },
  { id: 2, date: today(), start: "10:00", end: "12:00", providerRole: "RBT", providerId: 2, patientId: 2, status: "scheduled" },
];

const interruptRequests = []; // therapist->RBT approvals
const alertsSent = new Map(); // utilization thresholds sent

// -------------- SSE (Server-Sent Events) --------------
/** Very small SSE hub to notify clients immediately about changes */
const sseClients = new Set();
function sseBroadcast(type, payload) {
  const data = JSON.stringify({ type, payload, ts: Date.now() });
  for (const res of sseClients) {
    try {
      res.write(`event: ${type}\n`);
      res.write(`data: ${data}\n\n`);
    } catch {}
  }
}

app.get("/api/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  res.write(`event: ping\ndata: "ok"\n\n`);
  sseClients.add(res);
  req.on("close", () => sseClients.delete(res));
});

// -------------- Helpers --------------
function today() {
  const d = new Date(); const mm = String(d.getMonth()+1).padStart(2,"0"); const dd = String(d.getDate()).padStart(2,"0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}
const nextId = (arr) => (arr.length ? Math.max(...arr.map(x => x.id)) + 1 : 1);
function minutesBetween(a, b) { const [ah, am] = a.split(":").map(Number); const [bh, bm] = b.split(":").map(Number); return (bh*60+bm) - (ah*60+am); }
function compareTimes(a, b) { // returns >0 if a > b
  const [ah, am] = a.split(":").map(Number); const [bh, bm] = b.split(":").map(Number);
  return (ah*60+am) - (bh*60+bm);
}
function addMinutes(hhmm, mins) {
  const [h,m] = hhmm.split(":").map(Number); const d = new Date(); d.setHours(h, m + Number(mins), 0, 0);
  const hh = String(d.getHours()).padStart(2,"0"); const mm = String(d.getMinutes()).padStart(2,"0"); return `${hh}:${mm}`;
}
function inRange(date, from, to) { return date >= from && date <= to; }
function startOfMonth(d) { return d.slice(0,7) + "-01"; }
function endOfMonth(d) { const [y,m] = d.split("-").map(Number); const last = new Date(y, m, 0).getDate(); return `${y}-${String(m).padStart(2,"0")}-${String(last).padStart(2,"0")}`; }
function nameOfPatient(id) { return patients.find(p => p.id === id)?.name || `Patient#${id}`; }
function clinicianBy(role, id) { return clinicians.find(c => c.role === role && c.id === id); }
function keyOf(role, id) { return `${role}:${id}`; }

// -------------- Health --------------
app.get("/api/health", (_req, res) => {
  const slackEnabled = /^true$/i.test(process.env.SLACK_NOTIFICATIONS_ENABLED || "");
  res.json({ ok: true, slackEnabled });
});

// -------------- Patients / Clinicians / Invoices --------------
app.get("/api/patients", (req, res) => {
  const q = (req.query.q || "").toString().toLowerCase();
  res.json(q ? patients.filter(p => p.name.toLowerCase().includes(q)) : patients);
});

app.get("/api/clinicians", (req, res) => {
  const role = (req.query.role || "").toString().toUpperCase();
  const dateFrom = (req.query.dateFrom || startOfMonth(today())).toString();
  const dateTo   = (req.query.dateTo   || endOfMonth(today())).toString();
  const list = role ? clinicians.filter(c => c.role === role) : clinicians.slice();
  const withUsage = list.map(c => {
    const usedMins = schedule
      .filter(b => b.providerRole === c.role && b.providerId === c.id && inRange(b.date, dateFrom, dateTo) && b.status !== "canceled")
      .map(b => Math.max(0, minutesBetween(b.start, b.end)))
      .reduce((a,v)=>a+v,0);
    const usedHours = +(usedMins/60).toFixed(2);
    const auth = c.authorizedHours || 0;
    const util = auth ? +(usedHours/auth*100).toFixed(1) : 0;
    return { ...c, usedHours, utilizationPercent: util, window: { dateFrom, dateTo } };
  });
  res.json(withUsage);
});
app.get("/api/rbts", (_req, res) => res.json(clinicians.filter(c=>c.role==="RBT")));

app.get("/api/invoices", (_req, res) => res.json(invoices));
app.post("/api/invoices/:id/submit", async (req, res) => {
  const id = Number(req.params.id); const inv = invoices.find(i => i.id === id);
  if (!inv) return res.status(404).json({ error: "not found" });
  inv.status = "Submitted";
  try { await postToSlack?.({ text: `Invoice ${inv.id} submitted for ${inv.patientName} ($${inv.amount.toFixed(2)}).` }); } catch {}
  res.json(inv);
});

// -------------- Clinical basics --------------
app.get("/api/goals", (req, res) => {
  const pid = req.query.patientId ? Number(req.query.patientId) : null;
  res.json(pid ? goals.filter(g => g.patientId === pid) : goals);
});
app.post("/api/goals", (req, res) => {
  const { patientId, title, target = "", baseline = 0 } = req.body || {};
  if (!patientId || !title) return res.status(400).json({ error: "patientId and title are required" });
  const item = { id: nextId(goals), patientId: Number(patientId), title, target, baseline: Number(baseline || 0) };
  goals.push(item); res.status(201).json(item);
});
app.get("/api/sessions", (req, res) => {
  const gid = req.query.goalId ? Number(req.query.goalId) : null;
  let list = gid ? sessions.filter(s => s.goalId === gid) : sessions;
  list = list.sort((a,b)=>a.date.localeCompare(b.date)); res.json(list);
});
app.post("/api/sessions", (req, res) => {
  let { goalId, date, value } = req.body || {};
  if (!goalId) return res.status(400).json({ error: "goalId required" });
  if (!date) date = today();
  const item = { id: nextId(sessions), goalId: Number(goalId), date: String(date), value: Number(value || 0) };
  sessions.push(item); res.status(201).json(item);
});
app.get("/api/notes", (req, res) => {
  const sid = req.query.sessionId ? Number(req.query.sessionId) : null;
  res.json(sid ? notes.filter(n => n.sessionId === sid) : notes);
});
app.post("/api/notes", (req, res) => {
  const { sessionId, text } = req.body || {};
  if (!sessionId || !text) return res.status(400).json({ error: "sessionId and text required" });
  const item = { id: nextId(notes), sessionId: Number(sessionId), text: String(text), createdAt: new Date().toISOString() };
  notes.push(item); res.status(201).json(item);
});

// -------------- Scheduling --------------
app.get("/api/schedule", (req, res) => {
  const date = (req.query.date || today()).toString();
  res.json(schedule.filter(b => b.date === date));
});

app.post("/api/schedule", async (req, res) => {
  const { date = today(), start, end, providerRole, providerId, patientId, status = "scheduled" } = req.body || {};
  if (!start || !end || !providerRole || !providerId || !patientId)
    return res.status(400).json({ error: "start, end, providerRole, providerId, patientId required" });
  const item = { id: nextId(schedule), date: String(date), start, end, providerRole, providerId: Number(providerId), patientId: Number(patientId), status };
  schedule.push(item);
  await maybeAlertUtilization(providerRole, Number(providerId));
  sseBroadcast("schedule", { date: item.date });
  res.status(201).json(item);
});

app.put("/api/schedule/:id", async (req, res) => {
  const id = Number(req.params.id);
  const idx = schedule.findIndex(x => x.id === id);
  if (idx === -1) return res.status(404).json({ error: "not found" });
  const before = schedule[idx];
  schedule[idx] = { ...before, ...req.body, id };
  await maybeAlertUtilization(schedule[idx].providerRole, schedule[idx].providerId);
  sseBroadcast("schedule", { date: schedule[idx].date });
  res.json(schedule[idx]);
});

app.post("/api/schedule/:id/cancel", async (req, res) => {
  const id = Number(req.params.id);
  const block = schedule.find(x => x.id === id);
  if (!block) return res.status(404).json({ error: "not found" });
  block.status = "canceled";
  await maybeAlertUtilization(block.providerRole, block.providerId);
  sseBroadcast("schedule", { date: block.date });
  res.json(block);
});

// -------------- Interrupt Requests (therapist → RBT approval) --------------
app.get("/api/interruptRequests", (req, res) => {
  const rbtId = req.query.forRbtId ? Number(req.query.forRbtId) : null;
  const date  = (req.query.date || today()).toString();
  const status = (req.query.status || "pending").toString();
  let list = interruptRequests.slice();
  if (rbtId) list = list.filter(x => x.rbtId === rbtId);
  if (date)  list = list.filter(x => x.date === date);
  if (status) list = list.filter(x => x.status === status);
  list.sort((a,b)=> b.createdAt.localeCompare(a.createdAt));
  res.json(list);
});

app.post("/api/interruptRequests", async (req, res) => {
  const { patientId, rbtId, requesterRole, requesterId, date = today(), start, durationMinutes } = req.body || {};
  if (!patientId || !rbtId || !requesterRole || !requesterId || !start || !durationMinutes)
    return res.status(400).json({ error: "patientId, rbtId, requesterRole, requesterId, start, durationMinutes required" });
  const role = String(requesterRole).toUpperCase();
  if (!["SLP","OT","PT"].includes(role)) return res.status(400).json({ error: "requesterRole must be SLP|OT|PT" });
  const reqObj = {
    id: nextId(interruptRequests),
    patientId: Number(patientId),
    rbtId: Number(rbtId),
    requesterRole: role,
    requesterId: Number(requesterId),
    date: String(date),
    start: String(start),
    durationMinutes: Number(durationMinutes),
    status: "pending",
    createdAt: new Date().toISOString()
  };
  interruptRequests.push(reqObj);
  try { await postToSlack?.({ text: `Request: ${role} ${clinicianBy(role, reqObj.requesterId)?.name || reqObj.requesterId} requests ${reqObj.durationMinutes}m with ${nameOfPatient(reqObj.patientId)} at ${reqObj.start}. RBT ${clinicianBy("RBT", reqObj.rbtId)?.name || reqObj.rbtId} to approve.` }); } catch {}
  sseBroadcast("interrupt", { action: "created", request: reqObj });
  res.status(201).json(reqObj);
});

app.post("/api/interruptRequests/:id/approve", async (req, res) => {
  const id = Number(req.params.id);
  const r = interruptRequests.find(x => x.id === id);
  if (!r) return res.status(404).json({ error: "not found" });
  if (r.status !== "pending") return res.status(400).json({ error: "not pending" });

  const requestedEnd = addMinutes(r.start, r.durationMinutes);
  const block = schedule.find(b =>
    b.date === r.date &&
    b.providerRole === "RBT" && b.providerId === r.rbtId &&
    b.patientId === r.patientId &&
    b.status !== "canceled" &&
    compareTimes(b.start, r.start) <= 0 && compareTimes(b.end, requestedEnd) >= 0
  );
  if (!block) return res.status(409).json({ error: "No covering ABA block for requested window" });

  const originalEnd = block.end;
  if (compareTimes(r.start, block.start) > 0) {
    block.end = r.start; // keep first part
  } else {
    // starts at same time: remove this block
    schedule.splice(schedule.indexOf(block), 1);
  }

  const therapistBlock = {
    id: nextId(schedule),
    date: r.date,
    start: r.start,
    end: requestedEnd,
    providerRole: r.requesterRole,
    providerId: r.requesterId,
    patientId: r.patientId,
    status: r.requesterRole === "SLP" ? "speech" : "scheduled",
  };
  schedule.push(therapistBlock);

  if (compareTimes(originalEnd, requestedEnd) > 0) {
    schedule.push({
      id: nextId(schedule),
      date: r.date,
      start: requestedEnd,
      end: originalEnd,
      providerRole: "RBT",
      providerId: r.rbtId,
      patientId: r.patientId,
      status: "scheduled",
    });
  }

  r.status = "applied";
  try { await postToSlack?.({ text: `Approved: ${r.requesterRole} session for ${nameOfPatient(r.patientId)} at ${r.start} (${r.durationMinutes}m). ABA auto-resumes afterwards.` }); } catch {}

  await maybeAlertUtilization("RBT", r.rbtId);
  await maybeAlertUtilization(r.requesterRole, r.requesterId);

  sseBroadcast("interrupt", { action: "approved", requestId: r.id });
  sseBroadcast("schedule", { date: r.date });
  res.json({ ok: true, request: r });
});

app.post("/api/interruptRequests/:id/deny", async (req, res) => {
  const id = Number(req.params.id);
  const r = interruptRequests.find(x => x.id === id);
  if (!r) return res.status(404).json({ error: "not found" });
  if (r.status !== "pending") return res.status(400).json({ error: "not pending" });
  r.status = "denied";
  try { await postToSlack?.({ text: `Denied: ${r.requesterRole} request for ${nameOfPatient(r.patientId)} at ${r.start}.` }); } catch {}
  sseBroadcast("interrupt", { action: "denied", requestId: r.id });
  res.json({ ok: true, request: r });
});

// -------------- Utilization alerts 80/90/95 --------------
async function maybeAlertUtilization(role, id) {
  try {
    const c = clinicianBy(role, id); if (!c || !c.authorizedHours) return;
    const df = startOfMonth(today()), dt = endOfMonth(today());
    const usedMins = schedule
      .filter(b => b.providerRole === role && b.providerId === id && inRange(b.date, df, dt) && b.status !== "canceled")
      .map(b => Math.max(0, minutesBetween(b.start, b.end)))
      .reduce((a,v)=>a+v,0);
    const usedHours = usedMins / 60;
    const util = c.authorizedHours ? (usedHours / c.authorizedHours) : 0;
    const thresholds = [0.80, 0.90, 0.95];
    const sent = alertsSent.get(keyOf(role, id)) || {};
    for (const t of thresholds) {
      const mark = Math.round(t*100);
      if (util >= t && !sent[mark]) {
        sent[mark] = true; alertsSent.set(keyOf(role, id), sent);
        const pct = Math.round(util*100);
        try { await postToSlack?.({ text: `Utilization alert: ${role} ${c.name} is at ${pct}% of authorized hours this month.` }); } catch {}
      }
    }
  } catch (e) { console.warn("utilization alert error:", e?.message || e); }
}

// -------------- Listen --------------
const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`API listening on :${port}`));
