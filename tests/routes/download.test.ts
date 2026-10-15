import { describe, it, expect, vi, beforeEach } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const mock = await vi.hoisted(async () => {
  const { createMockDb } = await import("../helpers/mock-db.js");
  return createMockDb();
});

vi.mock("../../src/db/client.js", () => ({ db: mock.db, queryClient: {}, downloadStatementTimeoutMs: 60_000 }));

import { app } from "../../src/index.js";
import { downloadSlots } from "../../src/routes/versions.js";

const VERSION_ROW = {
  id: "11111111-2222-4333-8444-555555555555",
  abbreviation: "YOR",
  name: "Yoruba Bible",
  license: "Creative Commons Attribution 4.0",
  licenseType: "CC_BY",
  attribution: "Copyright Bible Society of Nigeria",
  attributionUrl: "https://ebible.org/find/details.php?id=yor",
  languageCode: "yor",
  textDirection: "ltr",
  sourceUrl: "https://ebible.org/Scriptures/yor_usfm.zip",
};

// Ordered as the query returns them: book position, chapter, verse.
const VERSE_ROWS = [
  { bookCode: "GEN", bookName: "Gẹnẹsisi", position: 1, testament: "OT", chapter: 1, verse: 1, text: "Ní àtètèkọ́ṣe \\add Ọlọ́run\\add* dá ọ̀run" },
  { bookCode: "GEN", bookName: "Gẹnẹsisi", position: 1, testament: "OT", chapter: 1, verse: 2, text: "Ayé sì wà" },
  { bookCode: "GEN", bookName: "Gẹnẹsisi", position: 1, testament: "OT", chapter: 2, verse: 1, text: "Báyìí ni a parí" },
  { bookCode: "JHN", bookName: "Johanu", position: 43, testament: "NT", chapter: 3, verse: 16, text: "Nítorí Ọlọ́run fẹ́ aráyé" },
];

describe("GET /api/v1/versions/{id}/download", () => {
  beforeEach(() => mock.reset());

  it("returns an ordered array of books in two queries by default", async () => {
    mock.queue([VERSION_ROW], VERSE_ROWS);

    const res = await app.request("/api/v1/versions/YOR/download");
    expect(res.status).toBe(200);
    const { data } = await res.json();

    expect(data.version).toEqual({
      id: VERSION_ROW.id,
      abbreviation: "YOR",
      name: "Yoruba Bible",
      license: "Creative Commons Attribution 4.0",
      licenseType: "CC_BY",
      attribution: "Copyright Bible Society of Nigeria",
      attributionUrl: "https://ebible.org/find/details.php?id=yor",
      languageCode: "yor",
      textDirection: "ltr",
    });
    expect(data.books).toEqual([
      {
        bookCode: "GEN",
        code: "GEN",
        name: "Gẹnẹsisi",
        position: 1,
        testament: "OT",
        chapters: [
          { number: 1, verses: [{ number: 1, text: "Ní àtètèkọ́ṣe Ọlọ́run dá ọ̀run" }, { number: 2, text: "Ayé sì wà" }] },
          { number: 2, verses: [{ number: 1, text: "Báyìí ni a parí" }] },
        ],
      },
      {
        bookCode: "JHN",
        code: "JHN",
        name: "Johanu",
        position: 43,
        testament: "NT",
        chapters: [{ number: 3, verses: [{ number: 16, text: "Nítorí Ọlọ́run fẹ́ aráyé" }] }],
      },
    ]);
    expect(mock.calls.queries).toBe(2);
  });

  it("carries the fields Praytify's offline download reads today", async () => {
    mock.queue([VERSION_ROW], VERSE_ROWS);
    const { data } = await (await app.request("/api/v1/versions/YOR/download?format=books")).json();

    // apps/web/lib/bible-api-web.ts and apps/mobile/lib/bible-api.ts read
    // data.name, data.languageCode, and data.books[].code / .chapters[].verses[].
    expect(data.name).toBe("Yoruba Bible");
    expect(data.languageCode).toBe("yor");
    expect(Array.isArray(data.books)).toBe(true);
    expect(data.books[0].code).toBe("GEN");
    expect(data.books[0].chapters[0].verses[0]).toEqual({ number: 1, text: "Ní àtètèkọ́ṣe Ọlọ́run dá ọ̀run" });
  });

  it("resolves by UUID as well as abbreviation", async () => {
    mock.queue([VERSION_ROW], VERSE_ROWS);
    const res = await app.request(`/api/v1/versions/${VERSION_ROW.id}/download`);
    expect(res.status).toBe(200);
    expect((await res.json()).data.version.abbreviation).toBe("YOR");
  });

  it("keeps the legacy nested shape behind format=legacy, with cleaned text", async () => {
    // The legacy attribution rule fires on a literal "CC" in the license.
    mock.queue([{ ...VERSION_ROW, license: "CC BY 4.0" }], VERSE_ROWS);
    const { data } = await (await app.request("/api/v1/versions/YOR/download?format=legacy")).json();

    expect(data).toEqual({
      version: { abbreviation: "YOR", name: "Yoruba Bible", license: "CC BY 4.0" },
      books: {
        GEN: { "1": { "1": "Ní àtètèkọ́ṣe Ọlọ́run dá ọ̀run", "2": "Ayé sì wà" }, "2": { "1": "Báyìí ni a parí" } },
        JHN: { "3": { "16": "Nítorí Ọlọ́run fẹ́ aráyé" } },
      },
      attribution: "Yoruba Bible (https://ebible.org/Scriptures/yor_usfm.zip)",
    });
  });

  it("emits a strong ETag and answers a matching If-None-Match with 304", async () => {
    mock.queue([VERSION_ROW], VERSE_ROWS);
    const first = await app.request("/api/v1/versions/YOR/download");
    const etag = first.headers.get("etag");
    expect(etag).toMatch(/^"[0-9a-f]+"$/);
    expect(first.headers.get("cache-control")).toContain("s-maxage=86400");

    mock.queue([VERSION_ROW], VERSE_ROWS);
    const second = await app.request("/api/v1/versions/YOR/download", { headers: { "If-None-Match": etag! } });
    expect(second.status).toBe(304);
  });

  it("gives each format its own ETag", async () => {
    mock.queue([VERSION_ROW], VERSE_ROWS);
    const books = await app.request("/api/v1/versions/YOR/download");
    mock.queue([VERSION_ROW], VERSE_ROWS);
    const legacy = await app.request("/api/v1/versions/YOR/download?format=legacy");
    expect(books.headers.get("etag")).not.toBe(legacy.headers.get("etag"));
  });

  it("rejects an unknown format with the standard error envelope", async () => {
    const res = await app.request("/api/v1/versions/YOR/download?format=xml");
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("BAD_REQUEST");
    expect(mock.calls.queries).toBe(0);
  });

  it("returns 404 for an unknown version", async () => {
    mock.queue([]);
    const res = await app.request("/api/v1/versions/NOPE/download");
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
  it("runs the verse query under the longer download statement timeout", async () => {
    mock.queue([VERSION_ROW], VERSE_ROWS);
    expect((await app.request("/api/v1/versions/YOR/download")).status).toBe(200);
    const executed = mock.calls.executedSql.map((q) => new PgDialect().sqlToQuery(q as SQL).sql);
    expect(executed).toEqual(["SET LOCAL statement_timeout = 60000"]);
  });

  it("answers 503 with Retry-After, before reading any verses, when every slot and queue place is taken", async () => {
    const held = Array.from({ length: downloadSlots.limit + downloadSlots.maxWaiting }, () => downloadSlots.acquire());
    try {
      mock.queue([VERSION_ROW], VERSE_ROWS);
      const res = await app.request("/api/v1/versions/YOR/download");
      expect(res.status).toBe(503);
      expect(res.headers.get("retry-after")).toBe("10");
      expect((await res.json()).error.code).toBe("BUSY");
      expect(mock.calls.queries).toBe(1);
    } finally {
      // Releasing in order hands each slot to the next queued holder.
      for (const pending of held) (await pending)?.();
    }
    expect(downloadSlots.stats).toEqual({ active: 0, waiting: 0 });
  });
});
