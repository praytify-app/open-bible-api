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

describe("404 handler", () => {
  it("should return 404 with proper error shape for unknown routes", async () => {
    const res = await app.request("/api/v1/nonexistent");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toEqual({
      code: "NOT_FOUND",
      message: "Route not found",
      status: 404,
    });
  });

  it("should return 404 for root path", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(404);
  });
});
