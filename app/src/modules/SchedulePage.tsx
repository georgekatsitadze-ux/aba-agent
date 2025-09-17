import React from "react";
import api, { API_BASE } from "../lib/api";

type Patient = { id: number; name: string };
type Clinician = {
  id: number; role: "RBT"|"SLP"|"OT"|"PT"; name: string;
  availability: { start: string; end: string };
  authorizedHours: number;
  usedHours?: number; utilizationPercent?: number;
  window?: { dateFrom: string; dateTo: string };
};
type Block = {
  id: number; date: string; start: string; end: string;
  providerRole: "RBT"|"SLP"|"OT"|"PT";
  providerId: number; patientId: number;
  status: "scheduled"|"canceled"|"nap"|"speech";
};
type InterruptRequest = {
  id: number; patientId: number; rbtId: number;
  requesterRole: "SLP"|"OT"|"PT"; requesterId: number;
  date: string; start: string; durationMinutes: number;
  status: "pending"|"approved"|"denied"|"applied"; createdAt: string;
};

const COLORS: Record<Block["status"], string> = {
  scheduled: "#dcfce7", canceled: "#fee2e2", nap: "#fef9c3", speech: "#ede9fe",
};
const ROLES: Array<Clinician["role"]> = ["RBT","SLP","OT","PT"];
const TIME_SLOTS = Array.from({length: 21}, (_,i) => { // 08:00 → 18:00 (every 30m)
  const mins = 8*60 + i*30;
  const hh = String(Math.floor(mins/60)).padStart(2,"0");
  const mm = String(mins%60).padStart(2,"0");
  return `${hh}:${mm}`;
});

export default function SchedulePage(){
  const [date, setDate] = React.useState<string>(new Date().toISOString().slice(0,10));
  const [patients, setPatients] = React.useState<Patient[]>([]);
  const [cliniciansByRole, setCliniciansByRole] = React.useState<Record<string, Clinician[]>>({});
  const [blocks, setBlocks] = React.useState<Block[]>([]);
  const [view, setView] = React.useState<"patient"|"RBT"|"SLP"|"OT"|"PT">("patient");

  // add block
  const [providerRole, setProviderRole] = React.useState<Clinician["role"]>("RBT");
  const [providerId, setProviderId] = React.useState<number | "">("");
  const [patientId, setPatientId] = React.useState<number | "">("");
  const [start, setStart] = React.useState("09:00");
  const [end, setEnd] = React.useState("11:00");

  // interrupts (therapist → RBT)
  const [reqRbtId, setReqRbtId] = React.useState<number | "">("");
  const [reqPatientId, setReqPatientId] = React.useState<number | "">("");
  const [reqStart, setReqStart] = React.useState("10:00");
  const [reqDur, setReqDur] = React.useState<30|60>(30);

  // RBT screen + requests
  const [selectedRbtId, setSelectedRbtId] = React.useState<number | "">("");
  const [pending, setPending] = React.useState<InterruptRequest[]>([]);
  const [activeReq, setActiveReq] = React.useState<InterruptRequest | null>(null);
  const lastSeenRef = React.useRef<number[]>([]);

  // drag state (beta)
  const [dragBlock, setDragBlock] = React.useState<Block | null>(null);

  React.useEffect(() => {
    api.get<Patient[]>("/patients").then(r => setPatients(r.data));
    refreshCliniciansAllRoles(date);

    // SSE live updates
    const es = new EventSource(`${API_BASE}/api/events`);
    es.addEventListener("schedule", () => { loadBlocks(); refreshCliniciansAllRoles(date); });
    es.addEventListener("interrupt", (e) => {
      try {
        const payload = JSON.parse((e as MessageEvent).data).payload;
        if (view === "RBT" && selectedRbtId && payload?.request?.rbtId === selectedRbtId && payload?.action === "created") {
          setActiveReq(payload.request);
        }
      } catch {}
    });
    return () => { es.close(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => { loadBlocks(); refreshCliniciansAllRoles(date); }, [date]);

  // fallback polling (5s) for pending requests on RBT screens
  React.useEffect(() => {
    if (view !== "RBT" || !selectedRbtId) return;
    const tick = async () => {
      const r = await api.get<InterruptRequest[]>("/interruptRequests", { params: { forRbtId: selectedRbtId, date, status: "pending" } });
      setPending(r.data);
      const unseen = r.data.find(x => !lastSeenRef.current.includes(x.id));
      if (unseen && !activeReq) { setActiveReq(unseen); lastSeenRef.current.push(unseen.id); }
    };
    tick();
    const h = setInterval(tick, 5000);
    return () => clearInterval(h);
  }, [view, selectedRbtId, date, activeReq]);

  async function refreshCliniciansAllRoles(d: string) {
    const df = startOfMonth(d), dt = endOfMonth(d);
    const byRole: Record<string, Clinician[]> = {};
    for (const role of ROLES) {
      const r = await api.get<Clinician[]>("/clinicians", { params: { role, dateFrom: df, dateTo: dt } });
      byRole[role] = r.data;
    }
    setCliniciansByRole(byRole);
  }

  async function loadBlocks(){ const r = await api.get<Block[]>("/schedule", { params: { date } }); setBlocks(r.data); }

  async function addBlock(e: React.FormEvent){
    e.preventDefault();
    if (!providerId || !patientId) return;
    await api.post("/schedule", { date, start, end, providerRole, providerId, patientId, status: "scheduled" });
    setProviderId(""); setPatientId("");
    await Promise.all([loadBlocks(), refreshCliniciansAllRoles(date)]);
  }

  // therapist → RBT request
  async function sendRequest(e: React.FormEvent){
    e.preventDefault();
    if (!reqRbtId || !reqPatientId) return;
    const me = (cliniciansByRole[view] || [])[0]; // first SLP/OT/PT as requester
    await api.post("/interruptRequests", {
      patientId: reqPatientId, rbtId: reqRbtId, requesterRole: view, requesterId: me?.id || 0,
      date, start: reqStart, durationMinutes: reqDur
    });
    alert("Request sent to RBT.");
  }

  async function approveRequest(id: number){
    try {
      await api.post(`/interruptRequests/${id}/approve`);
      setActiveReq(null);
      await Promise.all([loadBlocks(), refreshCliniciansAllRoles(date)]);
    } catch (e: any) {
      alert(e?.response?.data?.error || "Approval failed");
    }
  }
  async function denyRequest(id: number){ await api.post(`/interruptRequests/${id}/deny`); setActiveReq(null); }

  const byPatient = groupBy(blocks, b => b.patientId);
  const byProvider = groupBy(blocks, b => `${b.providerRole}:${b.providerId}`);

  function providerName(role: Clinician["role"], id: number){
    return (cliniciansByRole[role]?.find(c => c.id === id)?.name) || `${role}#${id}`;
  }
  function patientName(id: number){ return patients.find(p=>p.id===id)?.name || `Patient#${id}`; }

  // ---- Drag handlers (beta): drag block → drop on time slot (keeps duration)
  function onBlockDragStart(b: Block) { setDragBlock(b); }
  async function onSlotDrop(slot: string) {
    if (!dragBlock) return;
    const dur = minutesBetween(dragBlock.start, dragBlock.end);
    const newStart = slot;
    const newEnd = addMinutes(newStart, dur);
    await api.put(`/schedule/${dragBlock.id}`, { start: newStart, end: newEnd });
    setDragBlock(null);
    await Promise.all([loadBlocks(), refreshCliniciansAllRoles(date)]);
  }

  return (
    <div style={{ display:"grid", gap:16 }}>
      <h2>Schedule</h2>

      <section style={{ display:"flex", gap:12, alignItems:"center", flexWrap:"wrap" }}>
        <label>Date <input type="date" value={date} onChange={e=>setDate(e.target.value)} /></label>
        <div style={{ display:"flex", gap:6, marginLeft:"auto", flexWrap:"wrap" }}>
          <button onClick={()=>setView("patient")} disabled={view==="patient"}>Patient view</button>
          {ROLES.map(r => (
            <button key={r} onClick={()=>setView(r)} disabled={view===r}>{r} view</button>
          ))}
        </div>
      </section>

      {/* Add block */}
      <section style={{ border:"1px solid #eee", padding:12, borderRadius:10 }}>
        <h3>Add block</h3>
        <form onSubmit={addBlock} style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"end" }}>
          <div>
            <label>Role<br/>
              <select value={providerRole} onChange={e=>{ setProviderRole(e.target.value as Clinician["role"]); setProviderId(""); }}>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
          </div>
          <div>
            <label>Provider<br/>
              <select value={providerId} onChange={e=>setProviderId(e.target.value?Number(e.target.value):"")}>
                <option value="">Select {providerRole}</option>
                {(cliniciansByRole[providerRole]||[]).map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.availability.start}-{c.availability.end})</option>
                ))}
              </select>
            </label>
          </div>
          <div>
            <label>Patient<br/>
              <select value={patientId} onChange={e=>setPatientId(e.target.value?Number(e.target.value):"")}>
                <option value="">Select patient</option>
                {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          </div>
          <div><label>Start<br/><input value={start} onChange={e=>setStart(e.target.value)} placeholder="HH:MM"/></label></div>
          <div><label>End<br/><input value={end} onChange={e=>setEnd(e.target.value)} placeholder="HH:MM"/></label></div>
          <button type="submit">Add</button>
        </form>
      </section>

      {/* Therapist interrupt request form */}
      {view !== "patient" && view !== "RBT" && (
        <section style={{ border:"1px solid #eee", padding:12, borderRadius:10 }}>
          <h3>Request {view} session (interrupt ABA)</h3>
          <form onSubmit={sendRequest} style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"end" }}>
            <div>
              <label>RBT<br/>
                <select data-testid="req-rbt" value={reqRbtId} onChange={e=>setReqRbtId(e.target.value?Number(e.target.value):"")}>
                  <option value="">Select RBT</option>
                  {(cliniciansByRole["RBT"]||[]).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            </div>
            <div>
              <label>Patient<br/>
                <select data-testid="req-patient" value={reqPatientId} onChange={e=>setReqPatientId(e.target.value?Number(e.target.value):"")}>
                  <option value="">Select patient</option>
                  {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
            </div>
            <div><label>Start<br/><input data-testid="req-start" value={reqStart} onChange={e=>setReqStart(e.target.value)} placeholder="HH:MM"/></label></div>
            <div>
              <label>Duration<br/>
                <select data-testid="req-duration" value={reqDur} onChange={e=>setReqDur(Number(e.target.value) as 30|60)}>
                  <option value={30}>30 min</option>
                  <option value={60}>60 min</option>
                </select>
              </label>
            </div>
            <button data-testid="req-send" type="submit">Send request</button>
          </form>
        </section>
      )}

      {/* RBT owner + pending count */}
      {view === "RBT" && (
        <section style={{ border:"1px solid #eee", padding:12, borderRadius:10 }}>
          <h3>This screen belongs to</h3>
          <select data-testid="rbt-owner" value={selectedRbtId} onChange={e=>setSelectedRbtId(e.target.value?Number(e.target.value):"")}>
            <option value="">Select RBT</option>
            {(cliniciansByRole["RBT"]||[]).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {!!pending.length && <div style={{ color:"#2563eb", marginTop:8 }}>{pending.length} pending request(s)</div>}
        </section>
      )}

      {/* Views */}
      {view === "patient" ? (
        <section>
          <h3>By patient</h3>
          {patients.map(p => {
            const list = (byPatient.get(p.id) || []).sort((a,b)=>a.start.localeCompare(b.start));
            return (
              <div key={p.id} style={{ marginBottom: 12 }}>
                <div style={{ fontWeight:600 }}>{p.name}</div>
                {!list.length && <div style={{ color:"#666" }}>No blocks</div>}
                <div style={{ display:"grid", gap:8 }}>
                  {list.map(b => (
                    <BlockRow key={b.id} b={b}
                      label={`${b.start}-${b.end} with ${providerName(b.providerRole, b.providerId)} (${b.providerRole})`}
                      onDragStart={() => onBlockDragStart(b)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      ) : (
        <section>
          <h3>By {view}</h3>
          {(cliniciansByRole[view] || []).map(c => {
            const list = (byProvider.get(`${c.role}:${c.id}`) || []).sort((a,b)=>a.start.localeCompare(b.start));
            return (
              <div key={c.id} style={{ marginBottom: 12 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <div style={{ fontWeight:600 }}>
                    {c.name} <span style={{ color:"#666" }}>({c.availability.start}-{c.availability.end})</span>
                  </div>
                  <UtilChip used={c.usedHours||0} auth={c.authorizedHours} />
                </div>
                {!list.length && <div style={{ color:"#666" }}>Available (no blocks)</div>}
                <div style={{ display:"grid", gap:8 }}>
                  {list.map(b => (
                    <BlockRow key={b.id} b={b}
                      label={`${b.start}-${b.end} with ${patientName(b.patientId)}`}
                      onDragStart={() => onBlockDragStart(b)}
                    />
                  ))}
                </div>

                {/* Simple drag-to-reschedule drop strip (beta) */}
                <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:8 }}>
                  {TIME_SLOTS.map(t => (
                    <div key={t}
                      onDragOver={(e)=>e.preventDefault()}
                      onDrop={()=>onSlotDrop(t)}
                      style={{
                        border:"1px dashed #ccc", borderRadius:6, padding:"4px 8px", fontSize:12,
                        background:"#fafafa", cursor:"copy"
                      }}>
                      {t}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* Approval modal */}
      {activeReq && (
        <Modal onClose={()=>setActiveReq(null)}>
          <h3>Therapy request</h3>
          <p>
            <b>{activeReq.requesterRole}</b> requests <b>{activeReq.durationMinutes} minutes</b> with{" "}
            <b>{patients.find(p=>p.id===activeReq.patientId)?.name || activeReq.patientId}</b> at <b>{activeReq.start}</b>.
          </p>
          <div style={{ display:"flex", gap:8 }}>
            <button data-testid="modal-approve" onClick={()=>approveRequest(activeReq.id)}>Approve</button>
            <button data-testid="modal-deny" onClick={()=>denyRequest(activeReq.id)}>Deny</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function UtilChip({ used, auth }: { used: number; auth: number }) {
  const pct = auth ? Math.round((used / auth) * 100) : 0;
  let bg = "#e5e7eb"; if (pct >= 95) bg = "#fecaca"; else if (pct >= 90) bg = "#fcd34d"; else if (pct >= 80) bg = "#fde68a";
  return (
    <span style={{ background: bg, border: "1px solid #ddd", borderRadius: 999, padding: "2px 8px", fontSize: 12 }}>
      Utilization: {used}/{auth}h ({pct}%)
    </span>
  );
}

function BlockRow({ b, label, onDragStart }:{ b: Block; label: string; onDragStart: ()=>void }) {
  return (
    <div draggable onDragStart={onDragStart}
      style={{ display:"flex", gap:8, alignItems:"center", padding:8, borderRadius:8, background: COLORS[b.status] }}>
      <div style={{ minWidth: 260 }}>{label}</div>
      <span style={{ padding:"2px 6px", borderRadius:6, background:"#fff", border:"1px solid #ddd", color:"#444" }}>{b.status}</span>
    </div>
  );
}

function Modal({ children, onClose }:{ children: React.ReactNode; onClose: ()=>void }) {
  return (
    <div style={{
      position:"fixed", inset:0, background:"rgba(0,0,0,0.3)", display:"grid", placeItems:"center", zIndex:50
    }}>
      <div style={{ background:"#fff", padding:16, borderRadius:10, minWidth:320, display:"grid", gap:12 }}>
        {children}
        <button onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

// utils
function groupBy<T, K extends string|number>(arr: T[], key: (t:T)=>K): Map<K, T[]> {
  const m = new Map<K, T[]>(); for (const item of arr) { const k = key(item); const list = m.get(k) || []; list.push(item); m.set(k, list); } return m;
}
function minutesBetween(a: string, b: string) {
  const [ah, am] = a.split(":").map(Number); const [bh, bm] = b.split(":").map(Number); return (bh*60+bm) - (ah*60+am);
}
function addMinutes(hhmm: string, mins: number) {
  const [h,m] = hhmm.split(":").map(Number); const d = new Date(); d.setHours(h, m + Number(mins), 0, 0);
  const hh = String(d.getHours()).padStart(2,"0"); const mm = String(d.getMinutes()).padStart(2,"0"); return `${hh}:${mm}`;
}
function startOfMonth(d: string) { return d.slice(0,7) + "-01"; }
function endOfMonth(d: string) { const [y,m] = d.split("-").map(Number); const last = new Date(y, m, 0).getDate(); return `${y}-${String(m).padStart(2,"0")}-${String(last).padStart(2,"0")}`; }
