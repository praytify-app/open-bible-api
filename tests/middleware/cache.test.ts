import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { cacheControl } from "../../src/middleware/cache.js";

function createApp(maxAge: number) {
  const app = new Hono();
  app.use("/*", cacheControl(maxAge));
  app.get("/test", (c) => c.json({ ok: true }));
  return app;
}

describe("cacheControl", () => {
  it("sets Cache-Control header with given max-age", async () => {
    const app = createApp(3600);
    const res = await app.request("/test");

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=3600");
  });

  it("uses custom max-age value", async () => {
    const app = createApp(60);
    const res = await app.request("/test");

    expect(res.headers.get("cache-control")).toBe("public, max-age=60");
  });
});
