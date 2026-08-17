import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import LoginPage from "./components/auth/LoginPage";
import FleetMap from "./components/fleet/FleetMap";
import VehicleTwin from "./components/vehicle/VehicleTwin";
import AgentConsole from "./components/agent/AgentConsole";
import OTATaskManager from "./components/ota/OTATaskManager";
import SystemSettings from "./components/admin/SystemSettings";
import WorkOrderList from "./components/workorder/WorkOrderList";
import { useAuthStore } from "./store/authStore";

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const role = useAuthStore((s) => s.user?.role);
  if (role !== "admin" && role !== "superuser") {
    return <Navigate to="/fleet" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/fleet" replace />} />
        <Route path="/fleet" element={<FleetMap />} />
        <Route path="/vehicle/:vin" element={<VehicleTwin />} />
        <Route path="/agent" element={<AgentConsole />} />
        <Route path="/ota" element={<OTATaskManager />} />
        <Route path="/workorders" element={<WorkOrderList />} />
        <Route path="/settings" element={<RequireAdmin><SystemSettings /></RequireAdmin>} />
      </Route>
    </Routes>
  );
}
