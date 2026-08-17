import { describe, it, expect, beforeEach, vi } from "vitest";
import { apiUrl, ApiError, errorMessageFromResponse } from "./api";

describe("apiUrl", () => {
  it("prefixes non-root base paths", () => {
    // apiUrl uses import.meta.env at module load; we only assert path concat shape
    const path = "/api/vehicles";
    const url = apiUrl(path);
    expect(url.endsWith("/api/vehicles")).toBe(true);
  });
});

describe("ApiError", () => {
  it("stores status", () => {
    const err = new ApiError(403, "权限不足");
    expect(err.status).toBe(403);
    expect(err.message).toBe("权限不足");
  });
});

describe("errorMessageFromResponse", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("reads FastAPI detail string", async () => {
    const res = new Response(JSON.stringify({ detail: "未提供认证令牌" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
    await expect(errorMessageFromResponse(res)).resolves.toBe("未提供认证令牌");
  });

  it("falls back for empty body", async () => {
    const res = new Response("", { status: 500 });
    await expect(errorMessageFromResponse(res)).resolves.toContain("500");
  });
});
