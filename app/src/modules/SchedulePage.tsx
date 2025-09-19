// MARK: schedule-grid-v15-overlay+conflicts
import React from "react";
import { Link } from "react-router-dom";
import api from "../lib/api";

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
  status: "scheduled"|"in_session"|"canceled"|"no_show"|"nap"|"speech";
};

const BG: Record<Block["status"] | "default", string> = {
  scheduled: "#ffffff",
  in_session: "rgba(34,197,94,.25)",   // green
  canceled:  "rgba(249,115,22,.25)",   // orange
  no_show:   "rgba(239,68,68,.25)",    // red
  nap:       "rgba(234,179,8,.25)",
  speech:    "rgba(99,102,241,.25)",
  default:   "rgba(2,132,199,.25)"
};

const ROLES: Array<Clinician["role"]> = ["RBT","BCBA","SLP","OT","PT"];
const DAY_START = 8 * 60, DAY_END = 18 * 60, SLOT_MIN = 15;
const COLS = (DAY_END - DAY_START) / SLOT_MIN;
const ROW_H = 44; // timeline height

const hhmmToMin = (s:string) => { const [h,m]=s.split(":").map(Number); return h*60+(m||0); };
const minToHHMM = (x:number) => `${String(Math.floor(x/60)).padStart(2,"0")}:${String(x%60).padStart(2,"0")}`;
const clamp = (v:number, lo:number, hi:number) => Math.max(lo, Math.min(hi, v));
const snap = (min:number) => clamp(Math.round(min / SLOT_MIN) * SLOT_MIN, DAY_START, DAY_END);
const localYYYYMMDD = (d=new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const isToday = (ds:string) => ds === localYYYYMMDD();
const nowHHMM = () => minToHHMM(snap(new Date().getHours()*60 + new Date().getMinutes()));
const getNowMin = ()=> new Date().getHours()*60+new Date().getMinutes();

export default function SchedulePage() {
  const [date, setDate] = React.useState(localYYYYMMDD());
  const [patients, setPatients] = React.useState<Patient[]>([]);
  const [clinicians, setClinicians] = React.useState<Clinician[]>([]);
  const [blocks, setBlocks] = React.useState<Block[]>([]);
  const [view, setView] = React.useState<"patient"|"RBT"|"BCBA"|"SLP"|"OT"|"PT">("patient");
  const [visual, setVisual] = React.useState(true);

  // add-block
  const [providerRole, setProviderRole] = React.useState<Clinician["role"]>("RBT");
  const [providerId, setProviderId] = React.useState<number | "">("");
  const [patientId, setPatientId] = React.useState<number | "">("");
  const [start, setStart] = React.useState("09:00");
  const [end, setEnd] = React.useState("11:00");

  // conflict modal
  const [conflict, setConflict] = React.useState<null | { conflicts?: any[]; copresence?: any[] }>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [pRes, rbt, bcba, slp, ot, pt, sRes] = await Promise.all([
          api.get<Patient[]>("/patients"),
          api.get<Clinician[]>("/clinicians", { params: { role: "RBT" } }),
          api.get<Clinician[]>("/clinicians", { params: { role: "BCBA" } }),
          api.get<Clinician[]>("/clinicians", { params: { role: "SLP" } }),
          api.get<Clinician[]>("/clinicians", { params: { role: "OT" } }),
          api.get<Clinician[]>("/clinicians", { params: { role: "PT" } }),
          api.get<Block[]>("/schedule", { params: { date } }),
        ]);
        if (cancelled) return;
        setPatients(pRes.data);
        setClinicians([...rbt.data, ...bcba.data, ...slp.data, ...ot.data, ...pt.data]);
        setBlocks(sRes.data);
      } catch (e) { console.error("load failed:", e); setBlocks([]); }
    })();
    return () => { cancelled = true; };
  }, [date]);

  const rows = React.useMemo(() => {
    if (view === "patient") return patients.map(p => ({ key:`P-${p.id}`, name:p.name, rowType:"patient" as const, id:p.id }));
    return clinicians.filter(c => c.role === view).map(c => ({ key:`C-${c.role}-${c.id}`, name:c.name, rowType:"clinician" as const, id:c.id, role:c.role }));
  }, [view, patients, clinicians]);

  const blocksForRow = (r:{rowType:"patient"|"clinician"; id:number; role?:Clinician["role"]}) =>
    r.rowType === "patient" ? blocks.filter(b => b.patientId===r.id) : blocks.filter(b => b.providerRole===r.role && b.providerId===r.id);

  async function reloadDay(){
    const s = await api.get<Block[]>("/schedule",{params:{date}});
    setBlocks(s.data);
  }

  async function addBlockSubmit(e:React.FormEvent){
    e.preventDefault();
    if(!providerId||!patientId) return;
    try{
      await api.post("/schedule",{date,start,end,providerRole,providerId,patientId,status:"SCHEDULED"});
      await reloadDay();
    }catch(err:any){
      if(err?.response?.status===409) setConflict(err.response.data);
      else console.error(err);
    }
  }

  // locks
  const isLockedAll  = (b:Block)=> b.status==="canceled"||b.status==="no_show"||(b.status==="in_session"&&isToday(b.date)&&hhmmToMin(b.end)<=getNowMin());
  const isLockedStart= (b:Block)=> b.status==="in_session" || isLockedAll(b);

  // context menu
  const [menu,setMenu]=React.useState<{x:number;y:number;block:Block}|null>(null);
  const [editDlg,setEditDlg]=React.useState<{open:boolean;block:Block|null;start:string;end:string}>({open:false,block:null,start:"",end:""});
  const onCtx=(e:React.MouseEvent,b:Block)=>{e.preventDefault(); setMenu({x:e.clientX,y:e.clientY,block:b});};
  const closeMenu=()=>setMenu(null);
  const openEdit=(b:Block)=>{setEditDlg({open:true,block:b,start:b.start,end:b.end}); closeMenu();};
  const saveEdit=async()=>{ if(!editDlg.block) return;
    try{
      if(hhmmToMin(editDlg.end)-hhmmToMin(editDlg.start)<SLOT_MIN){alert(`Min ${SLOT_MIN} minutes`);return;}
      await api.put(`/schedule/${editDlg.block.id}`,{start:editDlg.start,end:editDlg.end});
      setEditDlg({open:false,block:null,start:"",end:""}); await reloadDay();
    }catch(e:any){ if(e?.response?.status===409) setConflict(e.response.data); else console.error(e); } };
  const cancelBlock=async(b:Block)=>{ try{ await api.post(`/schedule/${b.id}/cancel`); await reloadDay(); } finally{ closeMenu(); } };
  const markNoShow=async(b:Block)=>{ await api.put(`/schedule/${b.id}`,{status:"NO_SHOW"}); await reloadDay(); closeMenu(); };
  const actStart=async(b:Block)=>{ await api.put(`/schedule/${b.id}`,{status:"IN_SESSION"}); await reloadDay(); closeMenu(); };
  const actEnd=async(b:Block)=>{ if(!isToday(b.date)){alert("End only for today.");return;} try{
      await api.put(`/schedule/${b.id}`,{end:nowHHMM(),status:"IN_SESSION"}); await reloadDay(); closeMenu();
    }catch(e:any){ if(e?.response?.status===409) setConflict(e.response.data); else console.error(e); } };

  // drag/move/resize + vertical move
  type DragMode="move"|"start"|"end";
  type DragState={ id:number; mode:DragMode;
    origStartMin:number; origEndMin:number;
    draftStartMin:number; draftEndMin:number;
    rowsGeom:Array<{key:string;top:number;bottom:number;left:number;width:number}>;
    activeRowKey:string; overRowKey:string; moveOffsetMin:number; durationMin:number;
  }|null;
  const [drag,setDrag]=React.useState<DragState>(null);
  const rowRefs=React.useRef<Record<string,HTMLDivElement|null>>({});

  React.useEffect(()=>{ function onMove(e:MouseEvent){
      if(!drag) return;
      // find row under cursor
      const y=e.clientY;
      let over=drag.overRowKey;
      for(const rg of drag.rowsGeom){ if(y>=rg.top && y<=rg.bottom){ over=rg.key; break; } }
      const geom=drag.rowsGeom.find(r=>r.key===over) || drag.rowsGeom.find(r=>r.key===drag.activeRowKey)!;

      const relX=clamp(e.clientX-geom.left,0,geom.width);
      const pct=geom.width>0?relX/geom.width:0;
      const tMin=DAY_START + pct*(DAY_END-DAY_START);
      const s=snap(tMin);

      if(drag.mode==="end"){
        const minEnd=snap(drag.draftStartMin+SLOT_MIN);
        setDrag({...drag,draftEndMin:clamp(Math.max(s,minEnd),DAY_START,DAY_END),overRowKey:over});
      }else if(drag.mode==="start"){
        const maxStart=snap(drag.draftEndMin-SLOT_MIN);
        setDrag({...drag,draftStartMin:clamp(Math.min(s,maxStart),DAY_START,DAY_END),overRowKey:over});
      }else{
        const leftEdge=clamp(s-drag.moveOffsetMin,DAY_START,DAY_END);
        let newStart=snap(leftEdge), newEnd=newStart+drag.durationMin;
        if(newEnd>DAY_END){ newEnd=DAY_END; newStart=snap(newEnd-drag.durationMin); }
        if(newStart<DAY_START){ newStart=DAY_START; newEnd=snap(newStart+drag.durationMin); }
        if(newEnd-newStart<SLOT_MIN){ newEnd=snap(newStart+SLOT_MIN); }
        setDrag({...drag,draftStartMin:newStart,draftEndMin:newEnd,overRowKey:over});
      }
    }
    async function onUp(){
      if(!drag) return;
      try{
        const blk=blocks.find(b=>b.id===drag.id); if(blk){
          const newStart=minToHHMM(drag.draftStartMin), newEnd=minToHHMM(drag.draftEndMin);
          const body:any={};
          const rowChanged=drag.overRowKey!==drag.activeRowKey;

          if(drag.mode!=="end"  && newStart!==blk.start) body.start=newStart;
          if(drag.mode!=="start"&& newEnd!==blk.end)   body.end  =newEnd;
          if(rowChanged){
            const over=parseRowKey(drag.overRowKey);
            if(view==="patient"){ if(blk.patientId!==over.id) body.patientId=over.id; }
            else { if(blk.providerId!==over.id) body.providerId=over.id; }
          }
          if(Object.keys(body).length){
            try{ await api.put(`/schedule/${blk.id}`,body); await reloadDay(); }
            catch(e:any){ if(e?.response?.status===409) setConflict(e.response.data); else console.error(e); }
          }
        }
      }finally{ setDrag(null); document.body.style.userSelect=""; document.body.style.cursor=""; }
    }
    window.addEventListener("mousemove",onMove);
    window.addEventListener("mouseup",onUp);
    return()=>{ window.removeEventListener("mousemove",onMove); window.removeEventListener("mouseup",onUp); };
  },[drag,blocks,date,view]);

  function beginDrag(b:Block,rowKey:string,e:React.MouseEvent,mode:DragMode){
    if(isLockedAll(b)) return;
    if(mode==="start" && isLockedStart(b)) return;

    const rowsGeom = Object.entries(rowRefs.current)
      .map(([key,el])=>{ if(!el) return null; const r=el.getBoundingClientRect(); return {key,top:r.top,bottom:r.bottom,left:r.left,width:r.width}; })
      .filter(Boolean) as Array<{key:string;top:number;bottom:number;left:number;width:number}>;

    let activeRowKey=rowKey;
    for(const rg of rowsGeom){ if(e.clientY>=rg.top && e.clientY<=rg.bottom){ activeRowKey=rg.key; break; } }
    const geom=rowsGeom.find(r=>r.key===activeRowKey)!;

    const oS=clamp(hhmmToMin(b.start),DAY_START,DAY_END);
    const oE=clamp(hhmmToMin(b.end),DAY_START,DAY_END);
    const dur=Math.max(SLOT_MIN,oE-oS);
    let offset=0;
    if(mode==="move"){
      const rel=clamp(e.clientX-geom.left,0,geom.width);
      const relMin=DAY_START+(rel/geom.width)*(DAY_END-DAY_START);
      offset = snap(relMin)-oS;
      document.body.style.cursor="grabbing";
    }
    setDrag({ id:b.id, mode, origStartMin:oS, origEndMin:oE, draftStartMin:oS, draftEndMin:oE,
      rowsGeom, activeRowKey, overRowKey:activeRowKey, moveOffsetMin:offset, durationMin:dur });
    document.body.style.userSelect="none";
    e.preventDefault(); e.stopPropagation();
  }

  const isDragging=(id:number)=>!!drag && drag.id===id;
  const parseRowKey=(key:string)=> key.startsWith("P-") ? {kind:"patient",id:Number(key.split("-")[1])} : {kind:"clinician",role:key.split("-")[1] as Clinician["role"],id:Number(key.split("-")[2])};

  const providerLabel=(b:Block)=> clinicians.find(c=>c.role===b.providerRole && c.id===b.providerId)?.name || `${b.providerRole}#${b.providerId}`;
  const patientLabel =(id:number)=> patients.find(p=>p.id===id)?.name || `Patient#${id}`;

  return (
    <div style={{ display:"grid", gap:16 }}>
      <div style={{ display:"flex", alignItems:"center", gap:12 }}>
        <h2 style={{ margin:0 }}>Schedule</h2>
        <Link to="/coupler" className="btn ghost">Open Coupler</Link>
        <div style={{ marginLeft:"auto", display:"flex", gap:8, alignItems:"center" }}>
          <label style={{ display:"inline-flex", alignItems:"center", gap:6 }}>
            <input type="checkbox" checked={visual} onChange={e=>setVisual(e.target.checked)} /> Visual mode
          </label>
        </div>
      </div>

      <section className="card" style={{ display:"flex", gap:12, alignItems:"center", flexWrap:"wrap" }}>
        <label>Date&nbsp;<input type="date" value={date} onChange={e=>setDate(e.target.value)} /></label>
        <div style={{ marginLeft:"auto", display:"flex", gap:6 }}>
          <button onClick={()=>setView("patient")} disabled={view==="patient"}>Patient view</button>
          {ROLES.map(r=> <button key={r} onClick={()=>setView(r)} disabled={view===r}>{r} view</button>)}
        </div>
      </section>

      <section className="card">
        <h3 style={{ marginTop:0 }}>Add block</h3>
        <form onSubmit={addBlockSubmit} style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"end" }}>
          <div><label>Role<br/>
            <select value={providerRole} onChange={e=>{ setProviderRole(e.target.value as Clinician["role"]); setProviderId(""); }}>
              {ROLES.map(r=> <option key={r} value={r}>{r}</option>)}
            </select></label></div>
          <div><label>Provider<br/>
            <select value={providerId} onChange={e=>setProviderId(e.target.value?Number(e.target.value):"")}>
              <option value="">Select {providerRole}</option>
              {clinicians.filter(c=>c.role===providerRole).map(c=> <option key={c.id} value={c.id}>{c.name} ({c.availability.start}-{c.availability.end})</option>)}
            </select></label></div>
          <div><label>Patient<br/>
            <select value={patientId} onChange={e=>setPatientId(e.target.value?Number(e.target.value):"")}>
              <option value="">Select patient</option>
              {patients.map(p=> <option key={p.id} value={p.id}>{p.name}</option>)}
            </select></label></div>
          <div><label>Start<br/><input value={start} onChange={e=>setStart(e.target.value)} placeholder="HH:MM" /></label></div>
          <div><label>End<br/><input value={end} onChange={e=>setEnd(e.target.value)} placeholder="HH:MM" /></label></div>
          <button className="btn" type="submit">Add</button>
        </form>
      </section>

      {visual ? (
        <section className="card" style={{ overflowX:"auto" }}>
          {/* header time ruler */}
          <div style={{ display:"grid", gridTemplateColumns:`220px repeat(${COLS},1fr)`, alignItems:"center", gap:2, fontSize:12, color:"#475569" }}>
            <div />
            {Array.from({length:COLS},(_,i)=> {
              const minutes=DAY_START+i*SLOT_MIN, hh=String(Math.floor(minutes/60)).padStart(2,"0"), mm=String(minutes%60).padStart(2,"0");
              return <div key={i} style={{textAlign:"center"}}>{mm==="00"?`${hh}:00`:""}</div>;
            })}
          </div>

          {/* rows */}
          <div style={{ display:"grid", gap:14, marginTop:8 }}>
            {rows.map(r=>{
              const rowBlocks = blocksForRow(r).sort((a,b)=>a.start.localeCompare(b.start));
              const rowKey = r.key;

              return (
                <div key={rowKey} style={{
                  outline: drag && drag.overRowKey===rowKey ? "2px solid var(--ring)" : "none",
                  outlineOffset: 2, borderRadius: 8, padding: drag && drag.overRowKey===rowKey ? 2 : 0
                }}>
                  <div style={{ fontWeight:600, marginBottom:6 }}>{r.name}</div>

                  <div style={{ display:"grid", gridTemplateColumns:`220px 1fr`, gap:8 }}>
                    {/* left label cell */}
                    <div style={{ border:"1px solid #e5e7eb", borderRadius:8, background:"#fff",
                                  display:"flex", alignItems:"center", padding:"6px 8px", color:"#475569", fontSize:12 }}>
                      {view==="patient" ? "Patient" : (r as any).role}
                    </div>

                    {/* timeline container with its own background grid + overlay */}
                    <div style={{
                      position:"relative",
                      height: ROW_H,
                      border:"1px dashed #e5e7eb",
                      borderRadius:8,
                      background: `repeating-linear-gradient(to right,
                         #f3f4f6 0, #f3f4f6 1px, transparent 1px, transparent calc(100%/${COLS}))`
                    }}
                    ref={(el)=>{ rowRefs.current[rowKey]=el; }}>
                      {/* blocks overlay */}
                      {rowBlocks.map(b=>{
                        const baseStart=clamp(hhmmToMin(b.start),DAY_START,DAY_END);
                        const baseEnd  =clamp(hhmmToMin(b.end),DAY_START,DAY_END);
                        const startMin = isDragging(b.id) ? (drag!.draftStartMin) : baseStart;
                        const endMin   = isDragging(b.id) ? (drag!.draftEndMin)   : baseEnd;
                        const leftPct  = ((startMin-DAY_START)/(DAY_END-DAY_START))*100;
                        const widthPct = Math.max(2, ((endMin-startMin)/(DAY_END-DAY_START))*100);

                        const lockAll  = isLockedAll(b);
                        const lockStart= isLockedStart(b);

                        return (
                          <div key={b.id}
                            onMouseDown={(e)=> beginDrag(b,rowKey,e,"move")}
                            onContextMenu={(e)=> onCtx(e,b)}
                            title={`${minToHHMM(startMin)}-${minToHHMM(endMin)} · ${view==="patient"?providerLabel(b):patientLabel(b.patientId)} · ${b.status}`}
                            style={{
                              position:"absolute",
                              top: 4, height: ROW_H-8,
                              left:`${leftPct}%`,
                              width:`${widthPct}%`,
                              background: BG[b.status] || BG.default,
                              border:"1px solid rgba(0,0,0,.10)",
                              borderRadius:8,
                              padding:"4px 8px",
                              boxSizing:"border-box",
                              display:"flex", alignItems:"center", gap:8,
                              cursor: lockAll ? "default" : "grab",
                              overflow:"hidden", whiteSpace:"nowrap", textOverflow:"ellipsis",
                              opacity: b.status==="canceled"||b.status==="no_show" ? 0.85 : 1
                            }}
                          >
                            {/* left handle */}
                            <div
                              onMouseDown={(e)=> beginDrag(b,rowKey,e,"start")}
                              onClick={(e)=>e.stopPropagation()}
                              style={{
                                width:10,height:ROW_H-16,borderRadius:4,
                                background: lockStart||lockAll ? "rgba(0,0,0,.08)" : "rgba(0,0,0,.18)",
                                cursor: lockStart||lockAll ? "not-allowed" : "ew-resize",
                                marginRight:8
                              }}
                              title={lockStart||lockAll ? "Start locked" : "Drag to change start"}
                            />
                            <span style={{ fontSize:12, color:"#0f172a", overflow:"hidden", textOverflow:"ellipsis" }}>
                              {minToHHMM(startMin)}-{minToHHMM(endMin)} · {view==="patient"?providerLabel(b):patientLabel(b.patientId)}
                            </span>
                            {/* right handle */}
                            <div
                              onMouseDown={(e)=> beginDrag(b,rowKey,e,"end")}
                              onClick={(e)=>e.stopPropagation()}
                              style={{
                                marginLeft:"auto", width:10, height:ROW_H-16, borderRadius:4,
                                background: lockAll ? "rgba(0,0,0,.08)" : "rgba(0,0,0,.18)",
                                cursor: lockAll ? "not-allowed" : "ew-resize"
                              }}
                              title={lockAll ? "Block locked" : "Drag to change end"}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <ListView view={view} blocks={blocks} clinicians={clinicians} patients={patients} />
      )}

      {/* context menu */}
      {menu && (
        <div
          style={{ position:"fixed", left:menu.x, top:menu.y, zIndex:1000, background:"#fff", border:"1px solid #e5e7eb", borderRadius:8, boxShadow:"0 6px 24px rgba(0,0,0,.08)" }}
          onMouseLeave={()=>setMenu(null)}
        >
          <MenuItem label="Edit…" onClick={()=>{openEdit(menu.block);}} />
          <MenuItem label="Start session" onClick={()=>actStart(menu.block)} disabled={menu.block.status==="in_session"} />
          <MenuItem label="End session" onClick={()=>actEnd(menu.block)} disabled={!isToday(menu.block.date)} />
          <MenuItem label="Cancel block" onClick={()=>cancelBlock(menu.block)} />
          <MenuItem label="Mark no-show" onClick={()=>markNoShow(menu.block)} />
        </div>
      )}

      {/* edit dialog */}
      {editDlg.open && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.3)", display:"grid", placeItems:"center", zIndex:1001 }}>
          <div className="card" style={{ minWidth:320, display:"grid", gap:10 }}>
            <h3 style={{margin:0}}>Edit block time</h3>
            <label>Start<br/><input value={editDlg.start} onChange={e=>setEditDlg(s=>({...s,start:e.target.value}))} /></label>
            <label>End<br/><input value={editDlg.end} onChange={e=>setEditDlg(s=>({...s,end:e.target.value}))} /></label>
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
              <button className="btn ghost" onClick={()=>setEditDlg({open:false,block:null,start:"",end:""})}>Close</button>
              <button className="btn" onClick={saveEdit}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* conflict modal */}
      {conflict && <ConflictModal data={conflict} onClose={()=>setConflict(null)} />}

      <div onClick={()=>setMenu(null)} />
    </div>
  );
}

function MenuItem({ label, onClick, disabled }:{label:string;onClick:()=>void;disabled?:boolean}){
  return (
    <button
      className="btn ghost"
      style={{ width:"100%", textAlign:"left", padding:"8px 12px", color:disabled?"#94a3b8":"inherit", cursor:disabled?"not-allowed":"pointer" }}
      onClick={()=>{ if(!disabled) onClick(); }}
      disabled={disabled}
    >
      {label}
    </button>
  );
}

function ListView(props: { view: "patient"|"RBT"|"BCBA"|"SLP"|"OT"|"PT"; blocks: Block[]; clinicians: Clinician[]; patients: Patient[] }) {
  const { view, blocks, clinicians, patients } = props;
  const providerLabel=(b:Block)=> clinicians.find(c=>c.role===b.providerRole && c.id===b.providerId)?.name || `${b.providerRole}#${b.providerId}`;
  return (
    <section className="card">
      {view==="patient" ? (
        <>
          <h3 style={{ marginTop: 0 }}>By patient</h3>
          {patients.map(p => {
            const list = blocks.filter(b => b.patientId === p.id).sort((a, b) => a.start.localeCompare(b.start));
            return (
              <div key={p.id} style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 600 }}>{p.name}</div>
                {list.length === 0 && <div style={{ color: "#64748b" }}>No blocks</div>}
                <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                  {list.map(b => (<li key={b.id}>{b.start}–{b.end} with {providerLabel(b)} ({b.providerRole}) — {b.status}</li>))}
                </ul>
              </div>
            );
          })}
        </>
      ) : (
        <>
          <h3 style={{ marginTop: 0 }}>By {view}</h3>
          {clinicians.filter(c => c.role === view).map(c => {
            const list = blocks.filter(b => b.providerRole === c.role && b.providerId === c.id).sort((a, b) => a.start.localeCompare(b.start));
            return (
              <div key={c.id} style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 600 }}>{c.name} <span style={{ color: "#64748b" }}>({c.availability.start}-{c.availability.end})</span></div>
                {list.length === 0 && <div style={{ color: "#64748b" }}>Available (no blocks)</div>}
                <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                  {list.map(b => (<li key={b.id}>{b.start}–{b.end} with {patients.find(p => p.id === b.patientId)?.name || `Patient#${b.patientId}`} — {b.status}</li>))}
                </ul>
              </div>
            );
          })}
        </>
      )}
    </section>
  );
}

function ConflictModal({ data, onClose }:{ data:{conflicts?:any[]; copresence?:any[]}; onClose:()=>void }) {
  const conflicts = data.conflicts || [];
  const cop = data.copresence || [];
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.35)", display:"grid", placeItems:"center", zIndex:1100 }}>
      <div className="card" style={{ minWidth: 520, display:"grid", gap:12 }}>
        <h3 style={{ margin:0 }}>Conflicts detected</h3>

        {conflicts.length>0 && (
          <div>
            <div style={{ fontWeight:600, marginBottom:6 }}>Overlaps</div>
            <ul style={{ margin:0, paddingLeft:18 }}>
              {conflicts.map((c,idx)=>(
                <li key={idx}>
                  <code>{c.code}</code> with block #{c.with?.id} ({c.with?.start}-{c.with?.end}, {c.with?.providerRole}#{c.with?.providerId}, patient #{c.with?.patientId})
                </li>
              ))}
            </ul>
          </div>
        )}

        {cop.length>0 && (
          <div>
            <div style={{ fontWeight:600, marginBottom:6 }}>Co-presence</div>
            <ul style={{ margin:0, paddingLeft:18 }}>
              {cop.map((v,idx)=>(
                <li key={idx}>
                  Missing overlap: require <b>{v.require}</b> with <b>{v.with}</b> for {v.needMinutes}m (have {v.haveMinutes}m)
                </li>
              ))}
            </ul>
          </div>
        )}

        {(conflicts.length===0 && cop.length===0) && <div>No details from server.</div>}

        <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
          {/* Later: add "Override (Manager)" if you enable it server-side */}
          <button className="btn" onClick={onClose}>OK</button>
        </div>
      </div>
    </div>
  );
}
