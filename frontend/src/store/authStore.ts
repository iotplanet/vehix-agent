/**
 * Auth store — JWT token management, login/logout, session persistence.
 */
import { create } from "zustand";

interface User {
  id: number;
  username: string;
  display_name: string;
  role: string;
}

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: User | null;
  loading: boolean;
  error: string | null;

  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  restoreSession: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: localStorage.getItem("vehix_access_token"),
  refreshToken: localStorage.getItem("vehix_refresh_token"),
  user: null,
  loading: false,
  error: null,

  login: async (username: string, password: string) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const data = await res.json();
        set({ loading: false, error: data.detail || "登录失败" });
        return false;
      }
      const data = await res.json();
      localStorage.setItem("vehix_access_token", data.access_token);
      localStorage.setItem("vehix_refresh_token", data.refresh_token);
      set({
        token: data.access_token,
        refreshToken: data.refresh_token,
        user: data.user,
        loading: false,
        error: null,
      });
      return true;
    } catch (e) {
      set({ loading: false, error: "网络错误" });
      return false;
    }
  },

  logout: () => {
    localStorage.removeItem("vehix_access_token");
    localStorage.removeItem("vehix_refresh_token");
    set({ token: null, refreshToken: null, user: null });
  },

  restoreSession: () => {
    const token = localStorage.getItem("vehix_access_token");
    if (token) {
      // Decode JWT payload to get user info
      try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        set({
          token,
          refreshToken: localStorage.getItem("vehix_refresh_token"),
          user: {
            id: payload.sub,
            username: payload.username,
            display_name: payload.display_name || payload.username,
            role: payload.role,
          },
        });
      } catch {
        get().logout();
      }
    }
  },
}));

/** Get the current auth token (for fetch interceptor) */
export function getAuthToken(): string | null {
  return useAuthStore.getState().token;
}
