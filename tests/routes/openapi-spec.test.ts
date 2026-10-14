import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("../../src/db/client.js", () => ({ db: {}, queryClient: {} }));

import { app } from "../../src/index.js";

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));

async function spec() {
  const res = await app.request("/api/v1/openapi.json");
  expect(res.status).toBe(200);
  return res.json();
}

describe("published OpenAPI document", () => {
  it("takes info.version from package.json", async () => {
    expect((await spec()).info.version).toBe(pkg.version);
  });

  it("hides admin routes while still serving them", async () => {
    const paths = Object.keys((await spec()).paths);
    expect(paths.some((p) => p.includes("/admin"))).toBe(false);

    const admin = await app.request("/api/v1/admin/stats");
    expect(admin.status).toBe(401);
  });

  it("keeps engine paths under /api/v1 for the gateway to rewrite", async () => {
    const paths = Object.keys((await spec()).paths);
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.every((p) => p.startsWith("/api/v1/"))).toBe(true);
  });

  it("declares a bearerAuth security scheme", async () => {
    expect((await spec()).components.securitySchemes.bearerAuth).toMatchObject({ type: "http", scheme: "bearer" });
  });

  it("types every 200 response instead of using an empty schema", async () => {
    const doc = await spec();
    const untyped: string[] = [];
    for (const [path, ops] of Object.entries<any>(doc.paths)) {
      for (const [method, op] of Object.entries<any>(ops)) {
        const schema = op.responses?.["200"]?.content?.["application/json"]?.schema;
        const json = JSON.stringify(schema ?? {});
        if (json === "{}" || json.includes('"data":{}') || json.includes('"items":{}')) {
          untyped.push(`${method.toUpperCase()} ${path}`);
        }
      }
    }
    expect(untyped).toEqual([]);
  });

  it("publishes the contract schemas the gateway, SDK, and portal build against", async () => {
    const names = Object.keys((await spec()).components.schemas);
    for (const name of ["Passage", "ParallelPassage", "ChapterMeta", "DailyVerse", "SearchResult", "DownloadBooks", "VersionListItem"]) {
      expect(names).toContain(name);
    }
  });
});
