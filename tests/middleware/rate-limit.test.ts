import { describe, it, expect, afterEach, vi } from "vitest";
import { Hono } from "hono";
import {
  rateLimit,
  rateLimitMaxFromEnv,
  type RateLimitEntry,
} from "../../src/middleware/rate-limit.js";

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

describe("rateLimit client keying", () => {
  it("keys on the last X-Forwarded-For entry, which the gateway appended", async () => {
    const app = createApp(1, 60_000);

    const first = await app.request("/test", {
      headers: { "x-forwarded-for": "6.6.6.6, 198.51.100.7" },
    });
    expect(first.status).toBe(200);

    // A different spoofed first hop does not buy a fresh bucket.
    const spoofed = await app.request("/test", {
      headers: { "x-forwarded-for": "7.7.7.7, 198.51.100.7" },
    });
    expect(spoofed.status).toBe(429);

    // A different real client does.
    const other = await app.request("/test", {
      headers: { "x-forwarded-for": "6.6.6.6, 198.51.100.8" },
    });
    expect(other.status).toBe(200);
  });
});

describe("rateLimit gateway bypass", () => {
  function gatewayApp(gatewayToken: string | undefined) {
    const app = new Hono();
    app.use("/*", rateLimit({ maxRequests: 1, windowMs: 60_000, gatewayToken }));
    app.get("/test", (c) => c.json({ ok: true }));
    return app;
  }

  it("skips the limiter and its headers when the gateway token matches", async () => {
    const app = gatewayApp("s3cret-gateway-token");
    const headers = { "x-forwarded-for": "203.0.113.1", "x-gateway-token": "s3cret-gateway-token" };

    for (let i = 0; i < 5; i++) {
      const res = await app.request("/test", { headers });
      expect(res.status).toBe(200);
      expect(res.headers.get("x-ratelimit-limit")).toBeNull();
    }
  });

  it("applies the limiter when the token is wrong, a prefix, or absent", async () => {
    const app = gatewayApp("s3cret-gateway-token");
    const ip = { "x-forwarded-for": "203.0.113.2" };

    const ok = await app.request("/test", { headers: { ...ip, "x-gateway-token": "wrong" } });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("x-ratelimit-limit")).toBe("1");

    const prefix = await app.request("/test", { headers: { ...ip, "x-gateway-token": "s3cret" } });
    expect(prefix.status).toBe(429);

    const absent = await app.request("/test", { headers: ip });
    expect(absent.status).toBe(429);
  });

  it("never bypasses when GATEWAY_TOKEN is unset, even for an empty header", async () => {
    const app = gatewayApp(undefined);
    const headers = { "x-forwarded-for": "203.0.113.3", "x-gateway-token": "" };

    expect((await app.request("/test", { headers })).status).toBe(200);
    expect((await app.request("/test", { headers })).status).toBe(429);
  });
});

describe("rateLimit memory bounds", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("evicts expired entries once a window has passed", async () => {
    vi.useFakeTimers();
    const store = new Map<string, RateLimitEntry>();
    const app = new Hono();
    app.use("/*", rateLimit({ maxRequests: 10, windowMs: 1_000, store }));
    app.get("/test", (c) => c.json({ ok: true }));

    for (let i = 0; i < 50; i++) {
      await app.request("/test", { headers: { "x-forwarded-for": `10.1.0.${i}` } });
    }
    expect(store.size).toBe(50);

    vi.advanceTimersByTime(1_500);
    await app.request("/test", { headers: { "x-forwarded-for": "10.2.0.1" } });

    expect(store.size).toBe(1);
    expect(store.has("10.2.0.1")).toBe(true);
  });

  it("caps tracked clients by dropping the oldest entry", async () => {
    const store = new Map<string, RateLimitEntry>();
    const app = new Hono();
    app.use("/*", rateLimit({ maxRequests: 10, windowMs: 60_000, maxEntries: 3, store }));
    app.get("/test", (c) => c.json({ ok: true }));

    for (const ip of ["a", "b", "c", "d"]) {
      await app.request("/test", { headers: { "x-forwarded-for": ip } });
    }

    expect([...store.keys()]).toEqual(["b", "c", "d"]);
  });
});

describe("rateLimitMaxFromEnv", () => {
  it("prefers RATE_LIMIT_MAX", () => {
    expect(rateLimitMaxFromEnv({ RATE_LIMIT_MAX: "250", RATE_LIMIT: "100" })).toBe(250);
  });

  it("honours the legacy RATE_LIMIT name", () => {
    expect(rateLimitMaxFromEnv({ RATE_LIMIT: "100" })).toBe(100);
  });

  it("falls back on missing, zero, or garbage values", () => {
    expect(rateLimitMaxFromEnv({})).toBe(1000);
    expect(rateLimitMaxFromEnv({ RATE_LIMIT_MAX: "0" })).toBe(1000);
    expect(rateLimitMaxFromEnv({ RATE_LIMIT_MAX: "lots" })).toBe(1000);
  });
});
