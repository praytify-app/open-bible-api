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

describe("Search route", () => {
  it("GET /api/v1/search without q should return 400", async () => {
    const res = await app.request("/api/v1/search?version=KJV");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("BAD_REQUEST");
    expect(body.error.message).toContain("'q' is required");
  });

  it("GET /api/v1/search without version or language should return 400", async () => {
    const res = await app.request("/api/v1/search?q=love");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("BAD_REQUEST");
    expect(body.error.message).toContain("'version' or 'language'");
  });

  it("GET /api/v1/search with empty q should return 400", async () => {
    const res = await app.request("/api/v1/search?q=&version=KJV");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("BAD_REQUEST");
  });
});
