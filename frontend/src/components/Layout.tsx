import { useState, useEffect } from "react";
import { NavLink, Outlet, useNavigate, Navigate } from "react-router-dom";
import { Button, Drawer } from "@heroui/react";
import { Car, Bot, Radio, LogOut, Menu, Wrench, ClipboardList } from "lucide-react";
import { useAuthStore } from "../store/authStore";

const BASE_URL = import.meta.env.VITE_BASE_URL || "/";

const NAV_ITEMS = [
  { to: "/fleet", label: "车队地图", icon: Car },
  { to: "/agent", label: "Agent 控制台", icon: Bot },
  { to: "/ota", label: "OTA 管理", icon: Radio },
  { to: "/workorders", label: "工单", icon: ClipboardList },
];

function canAccessSettings(role: string | undefined): boolean {
  return role === "admin" || role === "superuser";
}

interface SidebarUser {
  id: number;
  username: string;
  display_name: string;
  role: string;
}

function SidebarContent({ user, onNav, onLogout }: {
  user: SidebarUser | null;
  onNav?: () => void;
  onLogout: () => void;
}) {
  return (
    <>
      {/* Profile header — matches screenshot pattern */}
      <div className="flex items-center gap-3 px-1 mb-8">
        <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center text-sm font-semibold text-accent-foreground flex-shrink-0 shadow-[0_0_16px_color-mix(in_oklch,var(--accent)_35%,transparent)]">
          {user?.display_name?.[0] || user?.username?.[0] || "V"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-foreground truncate">
            {user?.display_name || "Vehix"}
          </div>
          <div className="text-xs text-default-400 capitalize truncate">
            {user?.role || "guest"}
          </div>
        </div>
      </div>

      <nav className="flex flex-col gap-1.5 flex-1">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNav}
            className={({ isActive }) =>
              `vx-nav-item ${isActive ? "vx-nav-item-active" : ""}`
            }
          >
            <item.icon size={18} strokeWidth={1.75} />
            <span>{item.label}</span>
          </NavLink>
        ))}
        {canAccessSettings(user?.role) && (
          <NavLink
            to="/settings"
            onClick={onNav}
            className={({ isActive }) =>
              `vx-nav-item ${isActive ? "vx-nav-item-active" : ""}`
            }
          >
            <Wrench size={18} strokeWidth={1.75} />
            <span>系统设置</span>
          </NavLink>
        )}
      </nav>

      <div className="mt-auto pt-4 space-y-2">
        <div className="flex items-center gap-2 px-2 opacity-60">
          <img src={`${BASE_URL}vehix-logo.svg`} alt="" className="w-4 h-4" />
          <span className="text-[11px] text-default-400">Vehix Agent · v0.2.0</span>
        </div>
        <Button variant="secondary" size="sm" className="w-full rounded-full" onPress={onLogout}>
          <LogOut size={14} /> 退出登录
        </Button>
      </div>
    </>
  );
}

export default function Layout() {
  const { user, token, logout, restoreSession, error: authError } = useAuthStore();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => { restoreSession(); }, []);
  if (!token) return <Navigate to="/login" replace />;

  const handleLogout = () => { logout(); navigate("/login", { replace: true }); };
  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="flex h-screen vx-app">
      <Drawer.Backdrop isOpen={sidebarOpen} onOpenChange={setSidebarOpen} variant="blur">
        <Drawer.Content placement="left">
          <Drawer.Dialog className="h-full vx-shell p-5 border-0">
            <Drawer.CloseTrigger />
            <SidebarContent user={user} onNav={closeSidebar} onLogout={handleLogout} />
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>

      <aside className="hidden lg:flex w-60 flex-shrink-0 vx-shell flex-col p-5">
        <SidebarContent user={user} onLogout={handleLogout} />
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <div
          className="lg:hidden flex items-center gap-3 px-4 py-3 flex-shrink-0 border-b border-divider bg-background/80 backdrop-blur-md"
          style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
        >
          <button type="button" aria-label="打开菜单" onClick={() => setSidebarOpen(true)} className="text-default-400">
            <Menu size={22} />
          </button>
          <img src={`${BASE_URL}vehix-logo.svg`} alt="Vehix" className="w-6 h-6" />
          <h1 className="vx-brand text-base">Vehix Agent</h1>
          {user && (
            <div className="ml-auto text-xs text-default-400 truncate max-w-[80px]">
              {user.display_name}
            </div>
          )}
        </div>
        {authError && (
          <div className="px-4 py-2.5 border-b text-xs bg-danger/10 border-danger/30 text-danger">
            {authError}
          </div>
        )}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 safe-pb vx-fade-in">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
