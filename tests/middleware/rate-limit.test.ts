import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { rateLimit } from "../../src/middleware/rate-limit.js";

function createApp(maxRequests: number, windowMs: number) {
  const app = new Hono();
  app.use("/*", rateLimit({ maxRequests, windowMs }));
  app.get("/test", (c) => c.json({ ok: true }));
  return app;
}

describe("rateLimit", () => {
  it("allows requests under the limit and sets rate-limit headers", async () => {
    const app = createApp(5, 60_000);
    const res = await app.request("/test", {
      headers: { "x-forwarded-for": "1.2.3.4" },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("x-ratelimit-limit")).toBe("5");
    expect(res.headers.get("x-ratelimit-remaining")).toBe("4");
    expect(res.headers.get("x-ratelimit-reset")).toBeDefined();
  });

  it("blocks requests over the limit with 429", async () => {
    const app = createApp(2, 60_000);

    // Use up the limit
    await app.request("/test", {
      headers: { "x-forwarded-for": "10.0.0.1" },
    });
    await app.request("/test", {
      headers: { "x-forwarded-for": "10.0.0.1" },
    });

    // Third request should be blocked
    const res = await app.request("/test", {
      headers: { "x-forwarded-for": "10.0.0.1" },
    });

    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeDefined();

    const body = await res.json();
    expect(body.error.code).toBe("RATE_LIMITED");
  });
});
