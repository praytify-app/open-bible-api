import { describe, it, expect, vi, beforeEach } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const mock = await vi.hoisted(async () => {
  const { createMockDb } = await import("../helpers/mock-db.js");
  return createMockDb();
});

vi.mock("../../src/db/client.js", () => ({ db: mock.db, queryClient: {} }));

import { app } from "../../src/index.js";
import { buildSearchQuery, clampSearchPaging, escapeLikePattern } from "../../src/routes/search.js";

const dialect = new PgDialect();
const lastQuery = () => dialect.sqlToQuery(mock.calls.executedSql.at(-1) as SQL);

const ROW = {
  id: "42",
  verse_number: 16,
  text: "For God so loved the world,\\wj that\\wj* he gave",
  chapter_number: 3,
  book_name: "John",
  book_code: "JHN",
  version_abbreviation: "World English Bible Updated",
  license: "Public Domain",
  attribution: "World English Bible",
  attribution_url: "https://ebible.org/find/details.php?id=engwebu",
  rank: 0.0759,
};

describe("clampSearchPaging", () => {
  it.each([
    [undefined, undefined, 20, 0],
    ["50", "100", 50, 100],
    ["500", "5000", 100, 1000],
    ["0", "0", 20, 0],
    ["-5", "-10", 20, 0],
    ["abc", "1.5", 20, 0],
    ["", "", 20, 0],
    ["10abc", "3e2", 20, 300],
  ])("limit=%s offset=%s -> %i, %i", (limit, offset, expectedLimit, expectedOffset) => {
    expect(clampSearchPaging(limit, offset)).toEqual({ limit: expectedLimit, offset: expectedOffset });
  });
});

describe("escapeLikePattern", () => {
  it("escapes %, _, and backslash so they match literally", () => {
    expect(escapeLikePattern("100%")).toBe("100\\%");
    expect(escapeLikePattern("a_b")).toBe("a\\_b");
    expect(escapeLikePattern("c:\\path")).toBe("c:\\\\path");
    expect(escapeLikePattern("plain words")).toBe("plain words");
  });
});

describe("GET /api/v1/search", () => {
  beforeEach(() => mock.reset());

  it("requires q to be 2-200 characters after trimming", async () => {
    for (const q of ["a", "  a  ", "x".repeat(201)]) {
      const res = await app.request(`/api/v1/search?q=${encodeURIComponent(q)}&version=KJV`);
      expect(res.status).toBe(400);
      expect((await res.json()).error.message).toContain("2-200");
    }
    expect(mock.calls.queries).toBe(0);
  });

  it("returns camelCase fields, keeps the snake_case ones, and cleans the text", async () => {
    mock.queue([{ id: "ver-webu", languageCode: "eng" }]);
    mock.queueExecute([ROW]);

    const res = await app.request("/api/v1/search?q=loved&version=WEBU");
    expect(res.status).toBe(200);
    const [hit] = (await res.json()).data;

    expect(hit).toEqual({
      id: 42,
      text: "For God so loved the world, that he gave",
      verseNumber: 16,
      chapterNumber: 3,
      bookName: "John",
      bookCode: "JHN",
      versionAbbreviation: "WEBU",
      license: "Public Domain",
      attribution: "World English Bible",
      attributionUrl: "https://ebible.org/find/details.php?id=engwebu",
      rank: 0.0759,
      verse_number: 16,
      chapter_number: 3,
      book_name: "John",
      book_code: "JHN",
      version_abbreviation: "WEBU",
    });
  });

  it("resolves the scope in one query, then searches once", async () => {
    mock.queue([{ id: "ver-kjv", languageCode: "eng" }]);
    await app.request("/api/v1/search?q=love&version=KJV");
    expect(mock.calls.queries).toBe(1);
    expect(mock.calls.executes).toBe(1);
    expect(lastQuery().sql).toContain("plainto_tsquery");
  });

  it("binds clamped paging instead of passing garbage to Postgres", async () => {
    mock.queue([{ id: "ver-kjv", languageCode: "eng" }]);
    const res = await app.request("/api/v1/search?q=love&version=KJV&limit=-3&offset=999999");
    expect(res.status).toBe(200);
    const { params } = lastQuery();
    expect(params.slice(-2)).toEqual([20, 1000]);
  });

  it("escapes LIKE wildcards on the trigram path", async () => {
    mock.queue([{ id: "ver-yor", languageCode: "yor" }]);
    await app.request(`/api/v1/search?q=${encodeURIComponent("%_")}&version=YOR`);
    const { sql, params } = lastQuery();
    expect(sql).toContain("ILIKE");
    expect(sql).toContain("ESCAPE '\\'");
    expect(params).toContain("%\\%\\_%");
  });

  it("searches every seeded version of a language", async () => {
    mock.queue([
      { code: "fra", versionId: "v1" },
      { code: "fra", versionId: "v2" },
    ]);
    await app.request("/api/v1/search?q=amour&language=fra");
    const { sql, params } = lastQuery();
    expect(sql).toContain("plainto_tsquery");
    expect(params).toContain("{v1,v2}");
    expect(params).toContain("french");
  });

  it("returns an empty list for a language with no seeded versions", async () => {
    mock.queue([{ code: "xyz", versionId: null }]);
    const res = await app.request("/api/v1/search?q=word&language=xyz");
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual([]);
    expect(mock.calls.executes).toBe(0);
  });

  it("returns 404 for an unknown version or language", async () => {
    mock.queue([]);
    expect((await app.request("/api/v1/search?q=love&version=NOPE")).status).toBe(404);
    mock.queue([]);
    expect((await app.request("/api/v1/search?q=love&language=zzz")).status).toBe(404);
  });
});

describe("buildSearchQuery", () => {
  const render = (dictName: string, versionIds: string[]) =>
    dialect.sqlToQuery(buildSearchQuery({ dictName, versionIds, q: "love", limit: 20, offset: 40 }));
  // The scope-first shape gathers the scope's chapter ids before matching.
  const scopeFirst = /chapter_id = ANY \(ARRAY\(/;

  it("matches inside one version's chapters before ranking", () => {
    const { sql, params } = render("english", ["v1"]);
    expect(sql).toMatch(scopeFirst);
    expect(sql).toContain("plainto_tsquery");
    expect(params.slice(-2)).toEqual([20, 40]);
  });

  it("keeps the trigram path scoped whatever the number of versions", () => {
    const { sql, params } = render("simple", ["v1", "v2", "v3"]);
    expect(sql).toMatch(scopeFirst);
    expect(sql).toContain("ILIKE");
    expect(params).toContain("{v1,v2,v3}");
    expect(params.slice(-2)).toEqual([20, 40]);
  });

  it("starts from the stemmed index for a language with several versions", () => {
    const { sql, params } = render("english", ["v1", "v2"]);
    expect(sql).not.toMatch(scopeFirst);
    expect(sql).toContain("b.version_id = ANY(");
    expect(params).toContain("{v1,v2}");
    expect(params.slice(-2)).toEqual([20, 40]);
  });

  it("orders by rank then verse id in every shape, so pages stay stable", () => {
    for (const [dict, ids] of [["english", ["v1"]], ["simple", ["v1", "v2"]], ["english", ["v1", "v2"]]] as const) {
      const { sql } = render(dict, [...ids]);
      expect(sql).toContain("ORDER BY rank DESC, v.id");
      if (scopeFirst.test(sql)) expect(sql.trim()).toMatch(/ORDER BY m\.rank DESC, m\.id$/);
    }
  });
});
