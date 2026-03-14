import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Hono } from "hono";
import { adminAuth } from "../../src/middleware/admin-auth.js";

const TEST_TOKEN = "test-secret-token-123";

function createApp() {
  const app = new Hono();
  app.use("/*", adminAuth());
  app.get("/admin", (c) => c.json({ ok: true }));
  return app;
}

describe("adminAuth", () => {
  beforeEach(() => {
    vi.stubEnv("ADMIN_TOKEN", TEST_TOKEN);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects requests without Bearer token (401)", async () => {
    const app = createApp();
    const res = await app.request("/admin");

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(body.error.status).toBe(401);
  });

  it("rejects requests with wrong token (401)", async () => {
    const app = createApp();
    const res = await app.request("/admin", {
      headers: { Authorization: "Bearer wrong-token" },
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(body.error.status).toBe(401);
  });

  it("allows requests with correct token (200)", async () => {
    const app = createApp();
    const res = await app.request("/admin", {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
