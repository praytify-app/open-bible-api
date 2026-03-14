import { describe, it, expect, vi, beforeAll } from "vitest";

// Mock the db client before importing anything that uses it
vi.mock("../../src/db/client.js", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
  },
  queryClient: {},
}));

import { app } from "../../src/index.js";

describe("Languages routes", () => {
  it("GET /api/v1/languages should exist and not return 404 route-not-found", async () => {
    // The route exists even if DB call fails
    const res = await app.request("/api/v1/languages");
    // It won't be a "Route not found" 404, it may be 500 due to mock
    expect(res.status).not.toBe(404);
  });

  it("GET /api/v1/languages/:code should exist and not return route-not-found", async () => {
    const res = await app.request("/api/v1/languages/eng");
    expect(res.status).not.toBe(404);
  });
});
