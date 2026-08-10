/**
 * Authenticated fetch wrapper.
 * Injects Authorization header, handles 401 → refresh → retry.
 */
import { useAuthStore } from "../store/authStore";

export async function apiFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = useAuthStore.getState().token;

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let res = await fetch(url, { ...options, headers });

  // On 401, try refresh
  if (res.status === 401 && token) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      const newToken = useAuthStore.getState().token;
      headers["Authorization"] = `Bearer ${newToken}`;
      res = await fetch(url, { ...options, headers });
    }
  }

  return res;
}

async function tryRefresh(): Promise<boolean> {
  const refreshToken = useAuthStore.getState().refreshToken;
  if (!refreshToken) return false;

  try {
    const res = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) {
      useAuthStore.getState().logout();
      return false;
    }
    const data = await res.json();
    localStorage.setItem("vehix_access_token", data.access_token);
    localStorage.setItem("vehix_refresh_token", data.refresh_token);
    useAuthStore.setState({
      token: data.access_token,
      refreshToken: data.refresh_token,
      user: data.user,
    });
    return true;
  } catch {
    return false;
  }
}
