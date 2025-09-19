import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { PrismaClient } from "@prisma/client";
import { postToSlack } from "./slack.js"; // safe no-op if SDK missing
import { checkConflicts, checkCoPresence } from "./lib/conflicts.js";

const prisma = new PrismaClient();
const app = express();
app.use(cors());
app.use(express.json());

// ---- demo in-memory
const patients = [
  { id: 1, name: "Ada Lovelace", dob: "1815-12-10", mrn: "A001" },
  { id: 2, name: "Alan Turing",  dob: "1912-06-23", mrn: "A002" },
  { id: 3, name: "Grace Hopper", dob: "1906-09-12", mrn: "A003" },
];
const clinicians = [
  { id: 1, role: "RBT",  name: "RBT Alice",  availability: { start: "08:00", end: "16:00" }, authorizedHours: 120 },
  { id: 2, role: "RBT",  name: "RBT Bob",    availability: { start: "09:00", end: "17:00" }, authorizedHours: 120 },
  { id: 3, role: "RBT",  name: "RBT Chen",   availability: { start: "08:30", end: "16:30" }, authorizedHours: 120 },
  { id: 10, role: "BCBA",name: "BCBA Bianca",availability: { start: "09:00", end: "18:00" }, authorizedHours: 160 },
  { id: 101, role: "SLP", name: "SLP Sarah", availability: { start: "09:00", end: "15:00" }, authorizedHours: 80 },
  { id: 201, role: "OT",  name: "OT Omar",   availability: { start: "08:00", end: "14:00" }, authorizedHours: 80 },
  { id: 301, role: "PT",  name: "PT Priya",  availability: { start: "10:00", end: "18:00" }, authorizedHours: 80 },
];

// ---- utils
const normalizeRow = (row) => ({
  id: row.id,
  date: row.date,
  start: row.start,
  end: row.end,
  status: (row.status || "SCHEDULED").toLowerCase(),
  providerRole: row.providerRole,
  providerId: row.providerId,
  patientId: row.patientId,
  roomId: row.roomId ?? null
});
const toUpperStatus = (s) => {
  const t = String(s || "").toUpperCase();
  const allow = ["SCHEDULED","IN_SESSION","CANCELED","NO_SHOW","NAP","SPEECH"];
  return allow.includes(t) ? t : "SCHEDULED";
};

// ---- health / ref data
app.get("/api/health", (_req, res) => {
  const slackEnabled = /^true$/i.test(process.env.SLACK_NOTIFICATIONS_ENABLED || "");
  res.json({ ok: true, slackEnabled });
});
app.get("/api/patients", (req, res) => {
  const q = (req.query.q || "").toString().toLowerCase();
  res.json(q ? patients.filter(p => p.name.toLowerCase().includes(q)) : patients);
});
app.get("/api/clinicians", (req, res) => {
  const role = (req.query.role || "").toString().toUpperCase();
  res.json(role ? clinicians.filter(c => c.role === role) : clinicians);
});

// ---- schedule
app.get("/api/schedule", async (req, res) => {
  try {
    const date = (req.query.date || "").toString();
    if (!date) return res.status(400).json({ error: "date required YYYY-MM-DD" });
    const rows = await prisma.scheduleBlock.findMany({
      where: { date },
      orderBy: [{ start: "asc" }, { providerRole: "asc" }, { providerId: "asc" }]
    });
    res.json(rows.map(normalizeRow));
  } catch (e) {
    console.error("GET /api/schedule failed:", e);
    res.status(500).json({ error: "server_error" });
  }
});

app.post("/api/schedule", async (req, res) => {
  try {
    const { date, start, end, status = "SCHEDULED", providerRole, providerId, patientId, roomId } = req.body || {};
    if (!date || !start || !end || !providerRole || providerId == null || patientId == null) {
      return res.status(400).json({ error: "date, start, end, providerRole, providerId, patientId required" });
    }

    const sameDay = (await prisma.scheduleBlock.findMany({ where: { date } })).map(normalizeRow);

    const cand = {
      id: -1,
      date,
      start,
      end,
      status: toUpperStatus(status),
      providerRole: String(providerRole).toUpperCase(),
      providerId: Number(providerId),
      patientId: Number(patientId),
      roomId: roomId ? Number(roomId) : null
    };

    // DEBUG: log candidate + overlap
    console.log("[conflict-check][POST] cand", cand);

    const { conflicts } = checkConflicts(cand, sameDay, { buffers: { provider: 0, patient: 0, room: 0 } });
    const { violations } = checkCoPresence(cand, sameDay, [
      { require: "BCBA", with: "RBT", minMinutes: 15 }
    ]);

    console.log("[conflict-check][POST] conflicts", conflicts, "copresence", violations);

    if (conflicts.length || violations.length) {
      return res.status(409).json({ error: "conflict", conflicts, copresence: violations });
    }

    const row = await prisma.scheduleBlock.create({
      data: {
        date, start, end,
        status: cand.status,
        providerRole: cand.providerRole,
        providerId: cand.providerId,
        patientId: cand.patientId,
        roomId: cand.roomId
      }
    });
    res.status(201).json(normalizeRow(row));
  } catch (e) {
    console.error("POST /api/schedule failed:", e);
    res.status(500).json({ error: "server_error" });
  }
});

app.put("/api/schedule/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const current = await prisma.scheduleBlock.findUnique({ where: { id } });
    if (!current) return res.status(404).json({ error: "not_found" });

    const date = current.date;
    const cand = normalizeRow(current);
    if (req.body.start) cand.start = String(req.body.start);
    if (req.body.end)   cand.end   = String(req.body.end);
    if (req.body.status) cand.status = toUpperStatus(req.body.status);
    if (req.body.patientId != null)  cand.patientId = Number(req.body.patientId);
    if (req.body.providerId != null) cand.providerId = Number(req.body.providerId);

    const sameDay = (await prisma.scheduleBlock.findMany({ where: { date } }))
      .filter(b => b.id !== id)
      .map(normalizeRow);

    // DEBUG
    console.log("[conflict-check][PUT] cand", cand);
    const { conflicts } = checkConflicts(cand, sameDay, { buffers: { provider: 0, patient: 0, room: 0 } });
    const { violations } = checkCoPresence(cand, sameDay, [
      { require: "BCBA", with: "RBT", minMinutes: 15 }
    ]);
    console.log("[conflict-check][PUT] conflicts", conflicts, "copresence", violations);

    if (conflicts.length || violations.length) {
      return res.status(409).json({ error: "conflict", conflicts, copresence: violations });
    }

    const data = {};
    if (req.body.start) data.start = cand.start;
    if (req.body.end)   data.end   = cand.end;
    if (req.body.status) data.status = cand.status;
    if (req.body.patientId != null)  data.patientId = cand.patientId;
    if (req.body.providerId != null) data.providerId = cand.providerId;

    const row = await prisma.scheduleBlock.update({ where: { id }, data });
    res.json(normalizeRow(row));
  } catch (e) {
    console.error("PUT /api/schedule/:id failed:", e);
    res.status(500).json({ error: "server_error" });
  }
});

app.post("/api/schedule/:id/cancel", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const row = await prisma.scheduleBlock.update({ where: { id }, data: { status: "CANCELED" } });
    res.json(normalizeRow(row));
  } catch (e) {
    console.error("POST /api/schedule/:id/cancel failed:", e);
    res.status(500).json({ error: "server_error" });
  }
});

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`API listening on :${port}`));
