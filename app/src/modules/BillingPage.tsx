import axios from "axios";
import React from "react";

export default function BillingPage(){
  const [invoices, setInvoices] = React.useState<any[]>([]);

  React.useEffect(() => {
    axios.get("/api/invoices").then(r => setInvoices(r.data));
  }, []);

  return (
    <div>
      <h2>Billing</h2>
      <table style={{ width: "100%", marginTop: 12 }}>
        <thead><tr><th>#</th><th>Patient</th><th>Amount</th><th>Status</th></tr></thead>
        <tbody>
          {invoices.map(inv => (
            <tr key={inv.id}>
              <td>{inv.id}</td><td>{inv.patientName}</td><td>${inv.amount.toFixed(2)}</td><td>{inv.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}