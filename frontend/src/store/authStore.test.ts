import { describe, it, expect, beforeEach } from "vitest";
import { useAuthStore } from "../store/authStore";

describe("authStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({
      token: null,
      refreshToken: null,
      user: null,
      loading: false,
      error: null,
    });
  });

  it("logout clears tokens", () => {
    localStorage.setItem("vehix_access_token", "a");
    localStorage.setItem("vehix_refresh_token", "r");
    useAuthStore.setState({ token: "a", refreshToken: "r", user: { id: 1, username: "a", display_name: "A", role: "admin" } });
    useAuthStore.getState().logout();
    expect(useAuthStore.getState().token).toBeNull();
    expect(localStorage.getItem("vehix_access_token")).toBeNull();
  });

  it("restoreSession decodes jwt payload", () => {
    const payload = btoa(JSON.stringify({
      sub: 1, username: "admin", display_name: "Admin", role: "admin",
    }));
    const token = `hdr.${payload}.sig`;
    localStorage.setItem("vehix_access_token", token);
    localStorage.setItem("vehix_refresh_token", "refresh");
    useAuthStore.getState().restoreSession();
    const user = useAuthStore.getState().user;
    expect(user?.username).toBe("admin");
    expect(user?.role).toBe("admin");
    expect(useAuthStore.getState().token).toBe(token);
  });
});
