import { useState, useEffect } from "react";
import { NavLink, Outlet, useNavigate, Navigate } from "react-router-dom";
import { Button, Badge, BadgeLabel } from "@heroui/react";
import { Car, Bot, Radio, LogOut, Menu, X, Wrench } from "lucide-react";
import { useAuthStore } from "../store/authStore";

const NAV_ITEMS = [
  { to: "/fleet", label: "车队地图", icon: Car },
  { to: "/agent", label: "Agent 控制台", icon: Bot },
  { to: "/ota", label: "OTA 管理", icon: Radio },
];

const ROLE_LABELS: Record<string, string> = {
  superuser: "超级管理员", admin: "管理员", operator: "操作员", viewer: "查看者",
};

export default function Layout() {
  const { user, token, logout, restoreSession } = useAuthStore();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => { restoreSession(); }, []);
  if (!token) return <Navigate to="/login" replace />;

  const handleLogout = () => { logout(); navigate("/login", { replace: true }); };
  const closeSidebar = () => setSidebarOpen(false);

  const navLinks = (mobile: boolean) => (
    <>
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to} to={item.to}
          onClick={mobile ? closeSidebar : undefined}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
              isActive ? "bg-primary/10 text-primary font-medium" : "text-default-500 hover:bg-default-100 hover:text-foreground"
            }`
          }
        >
          <item.icon size={18} /><span>{item.label}</span>
        </NavLink>
      ))}
      {user?.role === "superuser" && (
        <NavLink to="/settings" onClick={mobile ? closeSidebar : undefined}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
              isActive ? "bg-primary/10 text-primary font-medium" : "text-default-500 hover:bg-default-100 hover:text-foreground"
            }`
          }
        ><Wrench size={18} /><span>系统设置</span></NavLink>
      )}
    </>
  );

  const userSection = user && (
    <div className="border-t border-divider pt-3 mt-auto">
      <div className="flex items-center gap-2 px-2 mb-2">
        <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs text-primary font-bold">
          {user.display_name?.[0] || user.username[0]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-foreground truncate">{user.display_name}</div>
          <Badge variant="soft" size="sm"><BadgeLabel>{ROLE_LABELS[user.role] || user.role}</BadgeLabel></Badge>
        </div>
      </div>
      <Button variant="secondary" size="sm" className="w-full text-xs" onPress={handleLogout}>
        <LogOut size={14} /> 退出
      </Button>
    </div>
  );

  return (
    <div className="flex h-screen">
      {/* Mobile overlay */}
      {sidebarOpen && <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={closeSidebar} />}

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50 w-56 flex-shrink-0
        bg-content1 border-r border-divider
        flex flex-col p-4 transition-transform duration-200
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
      `}>
        <div className="flex items-center justify-between px-3 py-2 mb-6">
          <h1 className="text-lg font-bold text-primary flex items-center gap-2">
            <span className="text-xl">⚡</span> Vehix Agent
          </h1>
          <button onClick={closeSidebar} className="lg:hidden text-default-500"><X size={20} /></button>
        </div>
        <p className="text-tiny text-default-400 px-3 -mt-4 mb-4">智能车队运维</p>
        <nav className="flex flex-col gap-1 flex-1">{navLinks(false)}</nav>
        {userSection}
        <div className="text-tiny text-default-400 px-3 mt-2">v0.2.0 · GB/T 32960</div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 bg-background">
        <div className="lg:hidden flex items-center gap-3 px-4 py-3 bg-content1 border-b border-divider flex-shrink-0">
          <button onClick={() => setSidebarOpen(true)} className="text-default-500"><Menu size={22} /></button>
          <h1 className="text-base font-bold text-primary">⚡ Vehix Agent</h1>
          {user && <div className="ml-auto text-xs text-default-500">{user.display_name}</div>}
        </div>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
