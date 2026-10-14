import { describe, it, expect, vi, beforeEach } from "vitest";

const mock = await vi.hoisted(async () => {
  const { createMockDb } = await import("../helpers/mock-db.js");
  return createMockDb();
});

vi.mock("../../src/db/client.js", () => ({ db: mock.db, queryClient: {} }));

import { app } from "../../src/index.js";
import { CachePolicy } from "../../src/middleware/cache.js";

const BOOK_ROWS = [
  { id: "b1", versionId: "v1", bookCode: "GEN", name: "Genesis", position: 1, chapterCount: 50, testament: "OT" },
  { id: "b2", versionId: "v1", bookCode: "EXO", name: "Exodus", position: 2, chapterCount: 40, testament: "OT" },
];

function queueBooks() {
  mock.queue([{ id: "v1" }], BOOK_ROWS);
}

describe("HTTP caching", () => {
  beforeEach(() => mock.reset());

  it("marks catalog and scripture GETs cacheable with a strong ETag", async () => {
    queueBooks();
    const res = await app.request("/api/v1/versions/KJV/books");

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe(CachePolicy.scripture);
    const etag = res.headers.get("etag");
    expect(etag).toMatch(/^"[0-9a-f]+"$/);
  });

  it("answers a matching If-None-Match with an empty 304 that keeps Cache-Control", async () => {
    queueBooks();
    const first = await app.request("/api/v1/versions/KJV/books");
    const etag = first.headers.get("etag")!;

    queueBooks();
    const second = await app.request("/api/v1/versions/KJV/books", {
      headers: { "If-None-Match": etag },
    });

    expect(second.status).toBe(304);
    expect(second.headers.get("etag")).toBe(etag);
    expect(second.headers.get("cache-control")).toBe(CachePolicy.scripture);
    expect(await second.text()).toBe("");
  });

  it("returns a full 200 when the validator is stale", async () => {
    queueBooks();
    const res = await app.request("/api/v1/versions/KJV/books", {
      headers: { "If-None-Match": '"not-the-current-etag"' },
    });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toHaveLength(2);
  });

  it("produces the same ETag for the same content", async () => {
    queueBooks();
    const a = await app.request("/api/v1/versions/KJV/books");
    queueBooks();
    const b = await app.request("/api/v1/versions/KJV/books");
    expect(a.headers.get("etag")).toBe(b.headers.get("etag"));
  });

  it("never caches a route-level 404", async () => {
    mock.queue([]); // version lookup finds nothing
    const res = await app.request("/api/v1/versions/NOPE/books");
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("etag")).toBeNull();
  });

  it("never caches an unmatched route or a validation error", async () => {
    const notFound = await app.request("/api/v1/does-not-exist");
    expect(notFound.status).toBe(404);
    expect(notFound.headers.get("cache-control")).toBe("no-store");

    const badSearch = await app.request("/api/v1/search?version=KJV");
    expect(badSearch.status).toBe(400);
    expect(badSearch.headers.get("cache-control")).toBe("no-store");
  });

  it("gives search a short public lifetime", async () => {
    mock.queue([{ id: "v1", languageCode: "eng" }]);
    mock.queueExecute([]);
    const res = await app.request("/api/v1/search?q=love&version=KJV");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe(CachePolicy.search);
  });

  it("does not cache health or admin responses", async () => {
    const health = await app.request("/api/v1/health");
    expect(health.headers.get("cache-control")).toBe("no-store");

    const admin = await app.request("/api/v1/admin/stats");
    expect(admin.status).toBe(401);
    expect(admin.headers.get("cache-control")).toBe("no-store");
  });
});
