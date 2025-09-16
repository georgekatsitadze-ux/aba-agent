import axios from "axios";
import React from "react";

export default function PatientsPage(){
  const [patients, setPatients] = React.useState<any[]>([]);
  const [q, setQ] = React.useState("");

  React.useEffect(() => {
    axios.get("/api/patients", { params: { q } }).then(r => setPatients(r.data));
  }, [q]);

  return (
    <div>
      <h2>Patients</h2>
      <input placeholder="Search..." value={q} onChange={e=>setQ(e.target.value)} />
      <table style={{ width: "100%", marginTop: 12 }}>
        <thead><tr><th>Name</th><th>DOB</th><th>MRN</th></tr></thead>
        <tbody>
          {patients.map(p => (
            <tr key={p.id}>
              <td>{p.name}</td><td>{p.dob}</td><td>{p.mrn}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}