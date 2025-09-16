import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

const patients = [
  { id: 1, name: "Ada Lovelace", dob: "1815-12-10", mrn: "A001" },
  { id: 2, name: "Alan Turing", dob: "1912-06-23", mrn: "A002" },
  { id: 3, name: "Grace Hopper", dob: "1906-12-09", mrn: "A003" },
];

const invoices = [
  { id: 1001, patientName: "Ada Lovelace", amount: 250.0, status: "Submitted" },
  { id: 1002, patientName: "Alan Turing", amount: 180.0, status: "Draft" },
];

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.get("/api/patients", (req, res) => {
  const q = (req.query.q || "").toString().toLowerCase();
  const result = q ? patients.filter(p => p.name.toLowerCase().includes(q)) : patients;
  res.json(result);
});

app.get("/api/invoices", (_req, res) => {
  res.json(invoices);
});

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`API listening on :${port}`));
