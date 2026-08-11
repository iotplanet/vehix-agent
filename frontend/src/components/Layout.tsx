import { useState, useEffect } from "react";
import { NavLink, Outlet, useNavigate, Navigate } from "react-router-dom";
import { Button, Drawer } from "@heroui/react";
import { Car, Bot, Radio, LogOut, Menu, Wrench } from "lucide-react";
import { useAuthStore } from "../store/authStore";

const NAV_ITEMS = [
  { to: "/fleet", label: "车队地图", icon: Car },
  { to: "/agent", label: "Agent 控制台", icon: Bot },
  { to: "/ota", label: "OTA 管理", icon: Radio },
];


/** Shared nav content rendered in both desktop sidebar and mobile Drawer */
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
  const navLinks = (
    <>
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to} to={item.to}
          onClick={onNav}
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
        <NavLink to="/settings" onClick={onNav}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
              isActive ? "bg-primary/10 text-primary font-medium" : "text-default-500 hover:bg-default-100 hover:text-foreground"
            }`
          }
        ><Wrench size={18} /><span>系统设置</span></NavLink>
      )}
    </>
  );

  return (
    <>
      <div className="flex items-center px-3 py-2 mb-6">
        <h1 className="text-lg font-bold text-primary flex items-center gap-2">
          <img src="/vehix-logo.svg" alt="Vehix" className="w-7 h-7" />
          Vehix Agent
        </h1>
      </div>
      <p className="text-tiny text-default-400 px-3 -mt-4 mb-4">智能车队运维</p>
      <nav className="flex flex-col gap-1 flex-1">{navLinks}</nav>
      {user && (
        <div className="border-t border-divider pt-3 mt-auto">
          <div className="flex items-center gap-2 px-2 mb-2">
            <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs text-primary font-bold">
              {user.display_name?.[0] || user.username[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-foreground truncate">{user.display_name}</div>
            </div>
          </div>
          <Button variant="secondary" size="sm" className="w-full text-xs" onPress={onLogout}>
            <LogOut size={14} /> 退出
          </Button>
        </div>
      )}
      <div className="text-tiny text-default-400 px-3 mt-2">v0.2.0 · GB/T 32960</div>
    </>
  );
}

export default function Layout() {
  const { user, token, logout, restoreSession } = useAuthStore();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => { restoreSession(); }, []);
  if (!token) return <Navigate to="/login" replace />;

  const handleLogout = () => { logout(); navigate("/login", { replace: true }); };
  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="flex h-screen">
      {/* Mobile Drawer */}
      <Drawer.Backdrop isOpen={sidebarOpen} onOpenChange={setSidebarOpen} variant="blur">
        <Drawer.Content placement="left">
          <Drawer.Dialog className="h-full bg-content1 p-4">
            <Drawer.CloseTrigger />
            <SidebarContent user={user} onNav={closeSidebar} onLogout={handleLogout} />
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-56 flex-shrink-0 bg-content1 border-r border-divider flex-col p-4">
        <SidebarContent user={user} onLogout={handleLogout} />
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 bg-background">
        {/* Mobile top bar */}
        <div className="lg:hidden flex items-center gap-3 px-4 py-3 bg-content1 border-b border-divider flex-shrink-0" style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
          <button onClick={() => setSidebarOpen(true)} className="text-default-500"><Menu size={22} /></button>
          <img src="/vehix-logo.svg" alt="Vehix" className="w-6 h-6" />
          <h1 className="text-base font-bold text-primary">Vehix Agent</h1>
          {user && <div className="ml-auto text-xs text-default-500 truncate max-w-[80px]">{user.display_name}</div>}
        </div>
        <main className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
