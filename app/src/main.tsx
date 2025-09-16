import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";

import DashboardPage from "./modules/DashboardPage";
import PatientsPage from "./modules/PatientsPage";
import BillingPage from "./modules/BillingPage";
import GoalsPage from "./modules/Clinical/GoalsPage";
import CommsPage from "./modules/CommsPage";

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: "Inter, system-ui, sans-serif", padding: 16 }}>
      <header style={{ display: "flex", gap: 16, alignItems: "center" }}>
        <h1 style={{ marginRight: "auto" }}>Magellan ABA</h1>
        <nav style={{ display: "flex", gap: 12 }}>
          <Link to="/">Dashboard</Link>
          <Link to="/patients">Patients</Link>
          <Link to="/billing">Billing</Link>
          <Link to="/clinical">Clinical</Link>
          <Link to="/comms">Comms</Link>
        </nav>
      </header>
      <main style={{ marginTop: 24 }}>{children}</main>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout><DashboardPage /></Layout>} />
        <Route path="/patients" element={<Layout><PatientsPage /></Layout>} />
        <Route path="/billing" element={<Layout><BillingPage /></Layout>} />
        <Route path="/clinical" element={<Layout><GoalsPage /></Layout>} />
        <Route path="/comms" element={<Layout><CommsPage /></Layout>} />
      </Routes>
    </BrowserRouter>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
