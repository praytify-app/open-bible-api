import { describe, it, expect, vi } from "vitest";

vi.mock("../../src/db/client.js", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue([]),
  },
  queryClient: {},
}));

import { app } from "../../src/index.js";

describe("Admin routes", () => {
  it("GET /api/v1/admin/stats without auth should return 401", async () => {
    const res = await app.request("/api/v1/admin/stats");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("POST /api/v1/admin/versions without auth should return 401", async () => {
    const res = await app.request("/api/v1/admin/versions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ abbreviation: "TEST" }),
    });
    expect(res.status).toBe(401);
  });

  it("POST /api/v1/admin/seed without auth should return 401", async () => {
    const res = await app.request("/api/v1/admin/seed", { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("DELETE /api/v1/admin/versions/:id without auth should return 401", async () => {
    const res = await app.request("/api/v1/admin/versions/some-id", {
      method: "DELETE",
    });
    expect(res.status).toBe(401);
  });

  it("POST /api/v1/admin/seed with valid auth should return 202", async () => {
    const originalToken = process.env.ADMIN_TOKEN;
    process.env.ADMIN_TOKEN = "test-token";

    const res = await app.request("/api/v1/admin/seed", {
      method: "POST",
      headers: { Authorization: "Bearer test-token" },
    });
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.data.status).toBe("accepted");

    process.env.ADMIN_TOKEN = originalToken;
  });
});
