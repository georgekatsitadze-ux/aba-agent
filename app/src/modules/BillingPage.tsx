import React from "react";
import api from "../lib/api";

type Invoice = { id: number; patientName: string; amount: number; status: string };

export default function BillingPage() {
  const [invoices, setInvoices] = React.useState<Invoice[]>([]);
  const [statusMsg, setStatusMsg] = React.useState<string | null>(null);

  async function load() {
    const r = await api.get<Invoice[]>("/invoices");
    setInvoices(r.data);
  }

  React.useEffect(() => { load(); }, []);

  async function submitInvoice(id: number) {
    setStatusMsg("Submitting...");
    try {
      const r = await api.post<Invoice>(`/invoices/${id}/submit`);
      setInvoices(prev => prev.map(inv => inv.id === id ? r.data : inv));
      setStatusMsg(`Invoice ${id} submitted ✅`);
    } catch (e: any) {
      setStatusMsg(`Error: ${e?.response?.data?.error || e.message}`);
    }
  }

  return (
    <div>
      <h2>Billing</h2>
      {statusMsg && <p style={{ color: "#2563eb" }}>{statusMsg}</p>}
      <table style={{ width: "100%", marginTop: 12 }}>
        <thead><tr><th>#</th><th>Patient</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>
          {invoices.map((inv) => (
            <tr key={inv.id}>
              <td>{inv.id}</td>
              <td>{inv.patientName}</td>
              <td>${inv.amount.toFixed(2)}</td>
              <td>{inv.status}</td>
              <td>
                {inv.status !== "Submitted" ? (
                  <button onClick={() => submitInvoice(inv.id)}>Submit</button>
                ) : (
                  <span style={{ color: "#16a34a" }}>—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
