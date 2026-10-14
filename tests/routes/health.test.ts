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

import { readFileSync } from "node:fs";
import { app } from "../../src/index.js";

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));

describe("GET /api/v1/health", () => {
  it("should return 200 with status ok", async () => {
    const res = await app.request("/api/v1/health");

    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.version).toBe(pkg.version);
    expect(body.timestamp).toBeDefined();
    expect(typeof body.timestamp).toBe("string");
  });

  it("should return a valid ISO timestamp", async () => {
    const res = await app.request("/api/v1/health");
    const body = await res.json();

    const date = new Date(body.timestamp);
    expect(date.toISOString()).toBe(body.timestamp);
  });

  it("reports the same version as the OpenAPI document", async () => {
    const health = await (await app.request("/api/v1/health")).json();
    const spec = await (await app.request("/api/v1/openapi.json")).json();
    expect(health.version).toBe(spec.info.version);
    expect(health.version).not.toBe("1.0.0");
  });
});
