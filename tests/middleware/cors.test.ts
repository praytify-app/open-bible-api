import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { corsMiddleware } from "../../src/middleware/cors.js";

function createApp(origins: string) {
  const app = new Hono();
  app.use("/*", corsMiddleware(origins));
  app.get("/test", (c) => c.json({ ok: true }));
  return app;
}

describe("corsMiddleware", () => {
  it("adds CORS headers to responses", async () => {
    const app = createApp("*");
    const res = await app.request("/test", {
      headers: { Origin: "http://example.com" },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("handles preflight OPTIONS requests with 204", async () => {
    const app = createApp("*");
    const res = await app.request("/test", {
      method: "OPTIONS",
      headers: {
        Origin: "http://example.com",
        "Access-Control-Request-Method": "GET",
      },
    });

    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("supports comma-separated origin list", async () => {
    const app = createApp("http://a.com, http://b.com");
    const res = await app.request("/test", {
      headers: { Origin: "http://a.com" },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("http://a.com");
  });
});
