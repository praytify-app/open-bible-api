import { describe, it, expect } from "vitest";
import { app } from "../../src/index.js";

describe("GET /api/v1/health", () => {
  it("should return 200 with status ok", async () => {
    const res = await app.request("/api/v1/health");

    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.version).toBe("1.0.0");
    expect(body.timestamp).toBeDefined();
    expect(typeof body.timestamp).toBe("string");
  });

  it("should return a valid ISO timestamp", async () => {
    const res = await app.request("/api/v1/health");
    const body = await res.json();

    const date = new Date(body.timestamp);
    expect(date.toISOString()).toBe(body.timestamp);
  });
});
