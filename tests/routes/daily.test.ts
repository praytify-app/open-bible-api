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

describe("Daily verse route", () => {
  it("GET /api/v1/daily should exist and not return route-not-found", async () => {
    const res = await app.request("/api/v1/daily");
    // Will be 500 due to mock but not a routing 404
    expect(res.status).not.toBe(404);
  });
});
