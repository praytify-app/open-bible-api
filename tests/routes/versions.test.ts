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

describe("Versions routes", () => {
  it("GET /api/v1/versions should exist", async () => {
    const res = await app.request("/api/v1/versions");
    expect(res.status).not.toBe(404);
  });

  it("GET /api/v1/versions/:id should exist", async () => {
    const res = await app.request("/api/v1/versions/some-id");
    expect(res.status).not.toBe(404);
  });

  it("GET /api/v1/versions/:id/books should exist", async () => {
    const res = await app.request("/api/v1/versions/some-id/books");
    expect(res.status).not.toBe(404);
  });

  it("GET /api/v1/versions/:id/download should exist", async () => {
    const res = await app.request("/api/v1/versions/some-id/download");
    expect(res.status).not.toBe(404);
  });
});
