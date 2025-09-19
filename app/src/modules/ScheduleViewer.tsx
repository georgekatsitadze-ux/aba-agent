// app/src/modules/ScheduleViewer.tsx
import React from "react";
import api, { API_BASE } from "../lib/api";

type Patient = { id: number; name: string };
type Clinician = {
  id: number; role: "RBT"|"BCBA"|"SLP"|"OT"|"PT"; name: string;
  availability: { start: string; end: string };
  authorizedHours: number;
};
type Block = {
  id: number; date: string; start: string; end: string;
  providerRole: "RBT"|"BCBA"|"SLP"|"OT"|"PT";
  providerId: number; patientId: number;
  status: "scheduled"|"canceled"|"nap"|"speech";
};

const COLORS: Record<Block["status"], string> = {
  scheduled: "#dcfce7", canceled: "#fee2e2", nap: "#fef9c3", speech: "#ede9fe",
};

const SYNC_CHANNEL = "schedule-sync";
const SYNC_KEY = "schedule-date-sync";

function localYYYYMMDD(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function ScheduleViewer(){
  const qs = new URLSearchParams(location.search);
  const mode = (qs.get("mode") || "clinician").toLowerCase(); // "clinician" | "patient"
  const providerRole = (qs.get("role") || "RBT").toUpperCase() as Clinician["role"];
  const providerId   = qs.get("providerId") ? Number(qs.get("providerId")) : undefined;
  const patientIdQS  = qs.get("patientId") ? Number(qs.get("patientId")) : undefined;

  const [date, setDate] = React.useState<string>(qs.get("date") || localYYYYMMDD());
  const [patients, setPatients] = React.useState<Patient[]>([]);
  const [clinician, setClinician] = React.useState<Clinician | null>(null);
  const [patient, setPatient] = React.useState<Patient | null>(null);
  const [blocks, setBlocks] = React.useState<Block[]>([]);

  React.useEffect(() => {
    api.get<Patient[]>("/patients").then(r => setPatients(r.data));
    const es = new EventSource(`${API_BASE}/api/events`);
    es.addEventListener("schedule", (e) => {
      try { const p = JSON.parse((e as MessageEvent).data).payload; if (p?.date === date) load(date); } catch {}
    });
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => { load(date); }, [mode, providerRole, providerId, patientIdQS]);
  React.useEffect(() => { load(date); }, [date]);

  React.useEffect(() => {
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(SYNC_CHANNEL);
      bc.onmessage = (ev) => {
        const msg = ev.data;
        if (msg?.type === "date" && typeof msg.date === "string" && msg.date !== date) {
          setDate(msg.date);
          updateUrlDate(msg.date);
        }
      };
    } catch { bc = null; }

    const onStorage = (e: StorageEvent) => {
      if (e.key === SYNC_KEY && typeof e.newValue === "string") {
        try {
          const { date: d } = JSON.parse(e.newValue);
          if (d && d !== date) { setDate(d); updateUrlDate(d); }
        } catch {}
      }
    };
    window.addEventListener("storage", onStorage);

    return () => { if (bc) bc.close(); window.removeEventListener("storage", onStorage); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  function updateUrlDate(d: string){
    const url = new URL(location.href);
    url.searchParams.set("date", d);
    history.replaceState({}, "", url.toString());
  }

  async function load(d: string){
    if (mode === "clinician" && providerId){
      const res = await api.get<Clinician[]>("/clinicians", { params: { role: providerRole } });
      setClinician(res.data.find(c => c.id === providerId) || null);
    } else if (mode === "patient" && patientIdQS) {
      const res = await api.get<Patient[]>("/patients");
      setPatient(res.data.find(p => p.id === patientIdQS) || null);
    }
    const b = await api.get<Block[]>("/schedule", { params: { date: d } });
    if (mode === "clinician" && providerId){
      setBlocks(b.data.filter(x => x.providerRole === providerRole && x.providerId === providerId));
    } else if (mode === "patient" && patientIdQS){
      setBlocks(b.data.filter(x => x.patientId === patientIdQS));
    } else {
      setBlocks([]);
    }
  }

  function headerLabel(){
    if (mode === "clinician" && clinician) return `${clinician.role}: ${clinician.name} — ${date}`;
    if (mode === "patient" && patient)     return `Patient: ${patient.name} — ${date}`;
    return `Schedule Viewer — ${date}`;
  }

  function otherName(b: Block){
    if (mode === "clinician"){
      const p = patients.find(p => p.id === b.patientId);
      return p?.name || `Patient#${b.patientId}`;
    } else {
      return `${b.providerRole}#${b.providerId}`;
    }
  }

  return (
    <div style={{ padding: 16, display: "grid", gap: 12 }}>
      <div className="card" style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <strong>{headerLabel()}</strong>
        <span style={{ marginLeft: "auto" }}>
          <label style={{ fontSize: 12, color: "var(--muted)" }}>
            Date&nbsp;
            <input type="date" value={date} onChange={e=>{ setDate(e.target.value); updateUrlDate(e.target.value); }} />
          </label>
        </span>
      </div>

      <div className="card" style={{ display: "grid", gap: 8 }}>
        {blocks.length === 0 && <div style={{ color:"#64748b" }}>No blocks.</div>}
        {blocks.sort((a,b)=>a.start.localeCompare(b.start)).map(b => (
          <div key={b.id}
               style={{
                 display:"flex", gap:8, alignItems:"center", padding:8, borderRadius:8,
                 background: COLORS[b.status], border:"1px solid #e5e7eb"
               }}>
            <div style={{ minWidth: 120, fontWeight: 600 }}>{b.start}–{b.end}</div>
            <div>{otherName(b)}</div>
            <span style={{ marginLeft: "auto", fontSize: 12, color:"#475569" }}>{b.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
