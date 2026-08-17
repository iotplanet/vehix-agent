/**
 * Authenticated fetch wrapper.
 * Injects Authorization header, handles 401 → refresh → retry.
 */
import { useAuthStore } from "../store/authStore";

/**
 * API prefix — when deployed at a sub-path (e.g. /vehix/), all API calls
 * must go through that prefix so the host nginx reverse-proxy can route them.
 * Example: BASE_URL="/vehix/" → api calls go to /vehix/api/...
 *          BASE_URL="/"       → api calls go to /api/...
 */
const BASE_URL = import.meta.env.VITE_BASE_URL || "/";
const API_PREFIX = BASE_URL === "/" ? "" : BASE_URL.replace(/\/$/, "");

/** Prefix a path with the deployment sub-path for API calls. */
export function apiUrl(path: string): string {
  return `${API_PREFIX}${path}`;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Parse error detail from FastAPI-style JSON body. */
export async function errorMessageFromResponse(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data.detail === "string") return data.detail;
    if (Array.isArray(data.detail)) {
      return data.detail.map((d: { msg?: string }) => d.msg || JSON.stringify(d)).join("; ");
    }
    if (typeof data.error === "string") return data.error;
    if (typeof data.message === "string") return data.message;
  } catch {
    /* ignore */
  }
  if (res.status === 401) return "登录已过期，请重新登录";
  if (res.status === 403) return "权限不足";
  return `请求失败 (${res.status})`;
}

/** Throw ApiError when response is not OK. */
export async function ensureOk(res: Response): Promise<Response> {
  if (res.ok) return res;
  throw new ApiError(res.status, await errorMessageFromResponse(res));
}

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

  let res = await fetch(apiUrl(url), { ...options, headers });

  // On 401, try refresh
  if (res.status === 401 && token) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      const newToken = useAuthStore.getState().token;
      headers["Authorization"] = `Bearer ${newToken}`;
      res = await fetch(apiUrl(url), { ...options, headers });
    }
  }

  return res;
}

async function tryRefresh(): Promise<boolean> {
  const refreshToken = useAuthStore.getState().refreshToken;
  if (!refreshToken) {
    useAuthStore.getState().logout();
    useAuthStore.setState({ error: "登录已过期，请重新登录" });
    return false;
  }

  try {
    const res = await fetch(apiUrl("/api/auth/refresh"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) {
      useAuthStore.getState().logout();
      useAuthStore.setState({ error: "登录已过期，请重新登录" });
      return false;
    }
    const data = await res.json();
    localStorage.setItem("vehix_access_token", data.access_token);
    localStorage.setItem("vehix_refresh_token", data.refresh_token);
    useAuthStore.setState({
      token: data.access_token,
      refreshToken: data.refresh_token,
      user: data.user,
      error: null,
    });
    return true;
  } catch {
    useAuthStore.getState().logout();
    useAuthStore.setState({ error: "网络错误，请重新登录" });
    return false;
  }
}
