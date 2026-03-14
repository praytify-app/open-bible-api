import { describe, it, expect, vi } from "vitest";

vi.mock("../../src/db/client.js", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue([]),
  },
  queryClient: {},
}));

import { app } from "../../src/index.js";

describe("Verses routes", () => {
  it("GET /api/v1/verses?ref=... without version should return 400", async () => {
    const res = await app.request("/api/v1/verses?ref=John+3:16");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("BAD_REQUEST");
    expect(body.error.message).toContain("version");
  });

  it("GET /api/v1/verses without ref should return 400", async () => {
    const res = await app.request("/api/v1/verses?version=KJV");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("BAD_REQUEST");
    expect(body.error.message).toContain("ref");
  });

  it("GET /api/v1/verses?ref=invalid&version=KJV should return 400 for invalid ref", async () => {
    const res = await app.request("/api/v1/verses?ref=invalid&version=KJV");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("BAD_REQUEST");
    expect(body.error.message).toContain("Invalid reference format");
  });

  it("GET /api/v1/verses/:id with non-numeric id should return 400", async () => {
    const res = await app.request("/api/v1/verses/abc");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("BAD_REQUEST");
    expect(body.error.message).toContain("number");
  });
});
