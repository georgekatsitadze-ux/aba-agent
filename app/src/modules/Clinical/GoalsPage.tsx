import React from "react";
import api from "../../lib/api";

type Patient = { id: number; name: string };
type Goal = { id: number; patientId: number; title: string; target?: string; baseline?: number };
type Session = { id: number; goalId: number; date: string; value: number };
type Note = { id: number; sessionId: number; text: string; createdAt: string };

export default function GoalsPage(){
  const [patients, setPatients] = React.useState<Patient[]>([]);
  const [patientId, setPatientId] = React.useState<number | "">("");
  const [goals, setGoals] = React.useState<Goal[]>([]);
  const [selectedGoal, setSelectedGoal] = React.useState<Goal | null>(null);
  const [sessions, setSessions] = React.useState<Session[]>([]);
  const [notes, setNotes] = React.useState<Note[]>([]);

  // form state
  const [newGoal, setNewGoal] = React.useState({ title: "", target: "", baseline: 0 });
  const [newSession, setNewSession] = React.useState({ date: new Date().toISOString().slice(0,10), value: 0 });
  const [newNote, setNewNote] = React.useState("");

  React.useEffect(() => {
    api.get<Patient[]>("/patients").then(r => setPatients(r.data));
  }, []);

  React.useEffect(() => {
    loadGoals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  function loadGoals(){
    api.get<Goal[]>("/goals", { params: { patientId: patientId || undefined } })
      .then(r => {
        setGoals(r.data);
        if (selectedGoal && !r.data.find(g => g.id === selectedGoal.id)) {
          setSelectedGoal(null);
          setSessions([]);
          setNotes([]);
        }
      });
  }

  async function loadSessions(goalId: number){
    const r = await api.get<Session[]>("/sessions", { params: { goalId } });
    setSessions(r.data);
    // Load notes for each session id
    const bundles = await Promise.all(
      r.data.map(s => api.get<Note[]>("/notes", { params: { sessionId: s.id } }).then(rr => rr.data))
    );
    setNotes(bundles.flat());
  }

  async function addGoal(e: React.FormEvent){
    e.preventDefault();
    if (!patientId || !newGoal.title.trim()) return;
    await api.post("/goals", { patientId, ...newGoal });
    setNewGoal({ title: "", target: "", baseline: 0 });
    loadGoals();
  }

  async function removeGoal(gid: number){
    await api.delete(`/goals/${gid}`);
    if (selectedGoal?.id === gid) { setSelectedGoal(null); setSessions([]); setNotes([]); }
    loadGoals();
  }

  async function addSession(e: React.FormEvent){
    e.preventDefault();
    if (!selectedGoal) return;
    await api.post("/sessions", { goalId: selectedGoal.id, ...newSession });
    setNewSession({ date: new Date().toISOString().slice(0,10), value: 0 });
    loadSessions(selectedGoal.id);
  }

  async function addNote(e: React.FormEvent, sessionId: number){
    e.preventDefault();
    if (!newNote.trim()) return;
    await api.post("/notes", { sessionId, text: newNote.trim() });
    setNewNote("");
    if (selectedGoal) loadSessions(selectedGoal.id);
  }

  const selectedSessions = selectedGoal ? sessions.filter(s => s.goalId === selectedGoal.id) : [];
  const avg = selectedSessions.length ? (selectedSessions.reduce((a,b)=>a+b.value,0) / selectedSessions.length).toFixed(2) : "0.00";

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <h2>Clinical: Goals & Sessions</h2>

      {/* Filters / Create Goal */}
      <section style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr", alignItems: "end" }}>
        <div>
          <label>Patient&nbsp;</label>
          <select
            value={patientId}
            onChange={e => setPatientId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">All</option>
            {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        <form onSubmit={addGoal} style={{ display: "flex", gap: 8, alignItems: "end" }}>
          <div>
            <label style={{ display: "block" }}>New Goal Title</label>
            <input value={newGoal.title} onChange={e=>setNewGoal({ ...newGoal, title: e.target.value })} required />
          </div>
          <div>
            <label style={{ display: "block" }}>Target</label>
            <input value={newGoal.target} onChange={e=>setNewGoal({ ...newGoal, target: e.target.value })} />
          </div>
          <div>
            <label style={{ display: "block" }}>Baseline</label>
            <input type="number" value={newGoal.baseline} onChange={e=>setNewGoal({ ...newGoal, baseline: Number(e.target.value) })} />
          </div>
          <button type="submit" disabled={!patientId}>Add Goal</button>
        </form>
      </section>

      {/* Goals List */}
      <section>
        <h3>Goals ({goals.length})</h3>
        <table style={{ width: "100%" }}>
          <thead><tr><th>Patient</th><th>Title</th><th>Target</th><th>Baseline</th><th></th></tr></thead>
          <tbody>
            {goals.map(g => (
              <tr key={g.id} style={{ background: selectedGoal?.id === g.id ? "#eef" : "transparent" }}>
                <td>{patients.find(p => p.id === g.patientId)?.name || g.patientId}</td>
                <td>
                  <button onClick={()=>{ setSelectedGoal(g); loadSessions(g.id); }} style={{ all:"unset", cursor:"pointer", color:"#2563eb" }}>
                    {g.title}
                  </button>
                </td>
                <td>{g.target || "-"}</td>
                <td>{g.baseline ?? "-"}</td>
                <td><button onClick={()=>removeGoal(g.id)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Sessions / Notes for selected goal */}
      {selectedGoal && (
        <section style={{ display: "grid", gap: 12 }}>
          <h3>Sessions for: {selectedGoal.title}</h3>

          <form onSubmit={addSession} style={{ display:"flex", gap:8, alignItems:"end" }}>
            <div>
              <label style={{ display: "block" }}>Date</label>
              <input type="date" value={newSession.date} onChange={e=>setNewSession({ ...newSession, date: e.target.value })} />
            </div>
            <div>
              <label style={{ display: "block" }}>Value</label>
              <input type="number" value={newSession.value} onChange={e=>setNewSession({ ...newSession, value: Number(e.target.value) })} />
            </div>
            <button type="submit">Add Session</button>
            <div style={{ marginLeft: "auto" }}>Average: <strong>{avg}</strong></div>
          </form>

          <table style={{ width:"100%" }}>
            <thead><tr><th>Date</th><th>Value</th><th>Notes</th></tr></thead>
            <tbody>
              {selectedSessions.map(s => (
                <tr key={s.id}>
                  <td>{s.date}</td>
                  <td>{s.value}</td>
                  <td>
                    <form onSubmit={(e)=>addNote(e, s.id)} style={{ display:"flex", gap:8 }}>
                      <input
                        placeholder="Add note..."
                        value={newNote}
                        onChange={e=>setNewNote(e.target.value)}
                      />
                      <button type="submit">Save</button>
                    </form>
                    <ul style={{ margin: "4px 0 0 16px" }}>
                      {notes.filter(n => n.sessionId === s.id).map(n => (
                        <li key={n.id}>{n.text} <em style={{ color:"#666" }}>({new Date(n.createdAt).toLocaleString()})</em></li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ))}
              {selectedSessions.length === 0 && (
                <tr><td colSpan={3} style={{ color:"#666" }}>No sessions yet.</td></tr>
              )}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
