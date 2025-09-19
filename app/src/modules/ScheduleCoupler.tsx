import React from "react";
import api, { API_BASE } from "../lib/api";

type Clinician = { id: number; role: "RBT"|"BCBA"|"SLP"|"OT"|"PT"; name: string };
type Patient = { id: number; name: string };

export default function ScheduleCoupler(){
  const [sessionId, setSessionId] = React.useState<string>(() => new URLSearchParams(location.search).get("session") || "");
  const defaultRole = (new URLSearchParams(location.search).get("role") || "PATIENT") as "RBT"|"BCBA"|"PATIENT";
  const [roleView, setRoleView] = React.useState<"RBT"|"BCBA"|"PATIENT">(defaultRole);
  const [rbts, setRbts]   = React.useState<Clinician[]>([]);
  const [bcbas, setBcbas] = React.useState<Clinician[]>([]);
  const [patients, setPatients] = React.useState<Patient[]>([]);
  const [armed, setArmed] = React.useState<{role:string, providerId:number} | null>(null);

  const [date, setDate] = React.useState<string>(new Date().toISOString().slice(0,10));
  const [start, setStart] = React.useState("10:00");
  const [end, setEnd] = React.useState("11:00");
  const [selectedPatientId, setSelectedPatientId] = React.useState<number | "">("");

  React.useEffect(() => {
    api.get<Clinician[]>("/clinicians", { params: { role: "RBT" } }).then(r => setRbts(r.data));
    api.get<Clinician[]>("/clinicians", { params: { role: "BCBA" } }).then(r => setBcbas(r.data));
    api.get<Patient[]>("/patients").then(r => setPatients(r.data));

    const es = new EventSource(`${API_BASE}/api/events`);
    es.addEventListener("pairing", (e) => {
      try {
        const ev = JSON.parse((e as MessageEvent).data);
        if (!sessionId || ev.payload?.sessionId !== sessionId) return;
        if (ev.payload?.action === "armed") setArmed(ev.payload.armed || null);
        if (ev.payload?.action === "coupled") setArmed(null);
      } catch {}
    });
    return () => es.close();
  }, [sessionId]);

  async function ensureSession(){
    if (sessionId) return sessionId;
    const res = await api.post("/pairing/session");
    const id = res.data.sessionId as string;
    setSessionId(id);
    const url = new URL(location.href);
    url.searchParams.set("session", id);
    history.replaceState({}, "", url.toString());
    return id;
  }

  async function armProvider(role:"RBT"|"BCBA", providerId:number){
    const id = await ensureSession();
    await api.post("/pairing/arm", { sessionId: id, providerRole: role, providerId });
    const s = await api.get("/pairing/state", { params: { sessionId: id } });
    setArmed(s.data.armed || null);
  }

  async function couple(){
    if (!sessionId || !selectedPatientId || !start || !end) {
      alert("Select a patient + start/end"); return;
    }
    try {
      await api.post("/pairing/couple", {
        sessionId, patientId: selectedPatientId, date, start, end
      });
      alert("Coupled and scheduled!");
    } catch (e:any) {
      alert(e?.response?.data?.error || "Failed to couple");
    }
  }

  function openRoleWindow(role:"RBT"|"BCBA"|"PATIENT"){
    (async () => {
      const id = await ensureSession();
      const url = new URL(location.href);
      url.searchParams.set("session", id);
      url.searchParams.set("role", role);
      window.open(url.toString(), "_blank", role==="PATIENT" ? "width=720,height=800" : "width=520,height=800");
    })();
  }

  const armedLabel = armed ? `${armed.role} #${armed.providerId}` : "none";

  return (
    <div style={{ display:"grid", gap:16 }}>
      <h2>Pairing Coupler</h2>

      <div className="card" style={{ display:"flex", gap:12, alignItems:"center", flexWrap:"wrap" }}>
        <div>Session: <code>{sessionId || "(none)"}</code></div>
        <button className="btn" onClick={ensureSession}>Start session</button>
        <div style={{ marginLeft:"auto", display:"flex", gap:8 }}>
          <button className="btn ghost" onClick={()=>openRoleWindow("RBT")}>Open RBT window</button>
          <button className="btn ghost" onClick={()=>openRoleWindow("BCBA")}>Open BCBA window</button>
          <button className="btn ghost" onClick={()=>openRoleWindow("PATIENT")}>Open Patient window</button>
        </div>
      </div>

      {/* Split view if in single window */}
      {!new URLSearchParams(location.search).get("role") && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
          <ProviderPane title="RBTs" list={rbts} armed={armed} onArm={(id)=>armProvider("RBT", id)} />
          <ProviderPane title="BCBAs (can supervise multiple)" list={bcbas} armed={armed} onArm={(id)=>armProvider("BCBA", id)} />
          <PatientPane patients={patients}
            date={date} setDate={setDate}
            start={start} setStart={setStart}
            end={end} setEnd={setEnd}
            selectedPatientId={selectedPatientId} setSelectedPatientId={setSelectedPatientId}
            onCouple={couple} armed={armed}
          />
        </div>
      )}

      {/* Single-role window */}
      {new URLSearchParams(location.search).get("role")==="RBT" && (
        <ProviderPane title="RBTs" list={rbts} armed={armed} onArm={(id)=>armProvider("RBT", id)} />
      )}
      {new URLSearchParams(location.search).get("role")==="BCBA" && (
        <ProviderPane title="BCBAs (can supervise multiple)" list={bcbas} armed={armed} onArm={(id)=>armProvider("BCBA", id)} />
      )}
      {new URLSearchParams(location.search).get("role")==="PATIENT" && (
        <PatientPane patients={patients}
          date={date} setDate={setDate}
          start={start} setStart={setStart}
          end={end} setEnd={setEnd}
          selectedPatientId={selectedPatientId} setSelectedPatientId={setSelectedPatientId}
          onCouple={couple} armed={armed}
        />
      )}

      <p style={{ color:"#64748b", fontSize:12 }}>
        Note: BCBAs can supervise multiple patients simultaneously — the system does not block overlapping BCBA blocks.
      </p>
      <p style={{ color:"#64748b", fontSize:12 }}>
        Tip: Open RBT and Patient windows side by side, arm the provider, and couple on the Patient side.
      </p>
      <div>Armed: <code>{armedLabel}</code></div>
    </div>
  );
}

function ProviderPane({ title, list, armed, onArm }:{
  title: string;
  list: Clinician[];
  armed: {role:string, providerId:number} | null;
  onArm: (id:number)=>void;
}){
  return (
    <div className="card">
      <h3>{title}</h3>
      <ul style={{ listStyle:"none", padding:0, margin:0, display:"grid", gap:8 }}>
        {list.map(r => (
          <li key={r.id} style={{
            display:"flex", alignItems:"center", justifyContent:"space-between",
            padding:8, border:"1px solid #e5e7eb", borderRadius:10, background:"#fff"
          }}>
            <div>{r.name}</div>
            <button
              className="btn"
              onClick={()=>onArm(r.id)}
              title="Arm this provider for coupling"
              style={{ background: armed?.providerId===r.id ? "var(--primary)" : undefined }}
            >
              {armed?.providerId===r.id ? "Armed ✓" : "Arm"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PatientPane({
  patients, date, setDate, start, setStart, end, setEnd,
  selectedPatientId, setSelectedPatientId, onCouple, armed
}:{
  patients: Patient[];
  date: string; setDate:(v:string)=>void;
  start: string; setStart:(v:string)=>void;
  end: string; setEnd:(v:string)=>void;
  selectedPatientId: number | ""; setSelectedPatientId:(v:number|"")=>void;
  onCouple: ()=>void;
  armed: {role:string, providerId:number} | null;
}){
  return (
    <div className="card" style={{ gridColumn: "1 / -1" }}>
      <h3>Patient</h3>
      <div style={{ display:"grid", gap:8, gridTemplateColumns:"1fr 1fr 1fr 1fr", alignItems:"end" }}>
        <div>
          <label>Patient<br/>
            <select
              value={selectedPatientId}
              onChange={(e)=>setSelectedPatientId(e.target.value?Number(e.target.value):"")}
            >
              <option value="">Select patient</option>
              {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        </div>
        <div>
          <label>Date<br/>
            <input type="date" value={date} onChange={(e)=>setDate(e.target.value)} />
          </label>
        </div>
        <div>
          <label>Start<br/>
            <input value={start} onChange={(e)=>setStart(e.target.value)} placeholder="HH:MM" />
          </label>
        </div>
        <div>
          <label>End<br/>
            <input value={end} onChange={(e)=>setEnd(e.target.value)} placeholder="HH:MM" />
          </label>
        </div>
      </div>

      <div style={{ marginTop:12 }}>
        <button className="btn" onClick={onCouple} disabled={!armed || !selectedPatientId}>
          Couple {armed ? `(${armed.role} #${armed.providerId})` : ""} → Patient
        </button>
        {!armed && <span style={{ marginLeft:8, color:"#64748b" }}>Arm a provider first.</span>}
      </div>
    </div>
  );
}
