import { describe, it, expect, vi } from "vitest";
import { z } from "zod";

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
  downloadStatementTimeoutMs: 0,
}));

import { app } from "../../src/index.js";
import { validationError } from "../../src/lib/router.js";

describe("request validation errors", () => {
  it("answers a short version search with a readable 400 in the error envelope", async () => {
    const res = await app.request("/api/v1/versions?search=e");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBeUndefined();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.status).toBe(400);
    expect(body.error.issues).toEqual([{ path: "search", message: expect.stringContaining("2") }]);
    expect(body.error.message).toMatch(/^Invalid query\. search: /);
    // The old default put a JSON dump of the issues in `message`.
    expect(body.error.message).not.toContain("{");
  });

  it("uses the same envelope on another router (path parameters)", async () => {
    const res = await app.request("/api/v1/languages/e");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toMatch(/^Invalid param\. code: /);
  });
});

describe("validationError", () => {
  it("joins nested paths and lists every issue", () => {
    const schema = z.object({ a: z.object({ b: z.number() }), c: z.string().min(3) });
    const parsed = schema.safeParse({ a: { b: "x" }, c: "z" });
    if (parsed.success) throw new Error("expected a validation failure");
    const { error } = validationError(parsed.error, "json");
    expect(error.issues.map((i) => i.path)).toEqual(["a.b", "c"]);
    expect(error.message.startsWith("Invalid json. a.b: ")).toBe(true);
    expect(error.message).toContain("; c: ");
  });

  it("omits the path prefix for a root-level issue", () => {
    const parsed = z.string().safeParse(1);
    if (parsed.success) throw new Error("expected a validation failure");
    const { error } = validationError(parsed.error, "json");
    expect(error.issues[0].path).toBe("");
    expect(error.message).not.toMatch(/Invalid json\. :/);
  });
});
