import { describe, it, expect, vi, beforeEach } from "vitest";

const mock = await vi.hoisted(async () => {
  const { createMockDb } = await import("../helpers/mock-db.js");
  return createMockDb();
});

vi.mock("../../src/db/client.js", () => ({ db: mock.db, queryClient: {} }));

import { app } from "../../src/index.js";

const WEB = {
  id: "ver-web",
  abbreviation: "WEB",
  name: "World English Bible",
  license: "Public Domain",
  licenseType: "PD",
  attribution: "World English Bible (Public Domain)",
  attributionUrl: "https://ebible.org/find/details.php?id=engwebp",
  languageCode: "eng",
  textDirection: "ltr",
};

const AVD = {
  ...WEB,
  id: "ver-avd",
  abbreviation: "AVD",
  name: "Arabic Van Dyck",
  attribution: null,
  attributionUrl: null,
  languageCode: "arb",
  textDirection: "rtl",
};

const book = (versionId: string, bookCode: string, name: string, position: number) => ({
  id: `${versionId}-${bookCode}`,
  bookCode,
  name,
  position,
  chapterCount: 21,
  testament: "NT",
});

/** Rows as the version-and-books join returns them. */
function catalogRows(version: typeof WEB, books: ReturnType<typeof book>[]) {
  return books.map((b) => ({ version, book: b }));
}

const WEB_BOOKS = [book("ver-web", "JHN", "John", 43), book("ver-web", "1JN", "1 John", 62)];
const AVD_BOOKS = [book("ver-avd", "JHN", "إِنْجِيلُ يُوحَنَّا", 43)];

const JOHN_3_16 = [{ id: 1, number: 16, text: "For God so loved the world, \\wj that \\wj* he gave..." }];

describe("GET /api/v1/verses?ref=", () => {
  beforeEach(() => mock.reset());

  it("returns the passage with book, chapter, range, and version licensing in two queries", async () => {
    mock.queue(catalogRows(WEB, WEB_BOOKS), JOHN_3_16);

    const res = await app.request("/api/v1/verses?ref=John%203:16&version=WEB");
    expect(res.status).toBe(200);
    const { data } = await res.json();

    expect(data).toEqual({
      reference: "John 3:16",
      version: "WEB",
      verses: [{ id: 1, number: 16, text: "For God so loved the world, that he gave..." }],
      bookCode: "JHN",
      bookName: "John",
      chapter: 3,
      verseStart: 16,
      verseEnd: 16,
      license: "Public Domain",
      attribution: "World English Bible (Public Domain)",
      attributionUrl: "https://ebible.org/find/details.php?id=engwebp",
      languageCode: "eng",
      textDirection: "ltr",
    });
    expect(mock.calls.queries).toBe(2);
  });

  it("reports the verses actually returned for a whole chapter", async () => {
    mock.queue(catalogRows(WEB, WEB_BOOKS), [
      { id: 1, number: 1, text: "a" },
      { id: 2, number: 2, text: "b" },
      { id: 36, number: 36, text: "c" },
    ]);

    const res = await app.request("/api/v1/verses?ref=John%203&version=WEB");
    const { data } = await res.json();
    expect(res.status).toBe(200);
    expect(data.verseStart).toBe(1);
    expect(data.verseEnd).toBe(36);
    expect(data.verses).toHaveLength(3);
  });

  it.each([
    ["JHN 3:16", "JHN"],
    ["Jn 3:16", "JHN"],
    ["john 3:16", "JHN"],
    ["1 John 1:9", "1JN"],
    ["I John 1:9", "1JN"],
    ["1JN 1:9", "1JN"],
  ])("resolves %s", async (ref, code) => {
    mock.queue(catalogRows(WEB, WEB_BOOKS), JOHN_3_16);
    const res = await app.request(`/api/v1/verses?ref=${encodeURIComponent(ref)}&version=WEB`);
    expect(res.status).toBe(200);
    expect((await res.json()).data.bookCode).toBe(code);
  });

  it("resolves a localized Arabic book name typed without diacritics", async () => {
    mock.queue(catalogRows(AVD, AVD_BOOKS), JOHN_3_16);
    const ref = encodeURIComponent("انجيل يوحنا 3:16");
    const res = await app.request(`/api/v1/verses?ref=${ref}&version=AVD`);
    const { data } = await res.json();
    expect(res.status).toBe(200);
    expect(data.bookCode).toBe("JHN");
    expect(data.bookName).toBe(AVD_BOOKS[0].name);
    expect(data.textDirection).toBe("rtl");
  });

  it("returns 404, not a 200 with data.error, for a single unknown version", async () => {
    mock.queue([]);
    const res = await app.request("/api/v1/verses?ref=John%203:16&version=NOPE");
    expect(res.status).toBe(404);
    expect((await res.json()).error.message).toContain("NOPE");
  });

  it("returns 404 for an unknown book or a verse past the end of the chapter", async () => {
    mock.queue(catalogRows(WEB, WEB_BOOKS));
    const badBook = await app.request("/api/v1/verses?ref=Hezekiah%201:1&version=WEB");
    expect(badBook.status).toBe(404);
    expect((await badBook.json()).error.message).toContain("Hezekiah");

    mock.queue(catalogRows(WEB, WEB_BOOKS), []);
    const badVerse = await app.request("/api/v1/verses?ref=John%203:99&version=WEB");
    expect(badVerse.status).toBe(404);
  });

  it("keeps the parallel shape and reports per-version errors inline", async () => {
    mock.queue([...catalogRows(WEB, WEB_BOOKS), ...catalogRows(AVD, AVD_BOOKS)], JOHN_3_16, JOHN_3_16);

    const res = await app.request("/api/v1/verses?ref=John%203:16&version=WEB,AVD,NOPE");
    expect(res.status).toBe(200);
    const { data } = await res.json();

    expect(data.reference).toBe("John 3:16");
    expect(Object.keys(data.versions)).toEqual(["WEB", "AVD", "NOPE"]);
    expect(data.versions.WEB.bookCode).toBe("JHN");
    expect(data.versions.AVD.textDirection).toBe("rtl");
    expect(data.versions.NOPE).toEqual({ error: "Version 'NOPE' not found" });
  });

  it("rejects more than five versions before touching the database", async () => {
    const res = await app.request("/api/v1/verses?ref=John%203:16&version=A,B,C,D,E,F");
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toContain("At most 5");
    expect(mock.calls.queries).toBe(0);
  });

  it("rejects an over-long reference with 400 without parsing it", async () => {
    const hostile = "John" + " ".repeat(16_000) + "3:16";
    const started = performance.now();
    const res = await app.request(`/api/v1/verses?ref=${encodeURIComponent(hostile)}&version=WEB`);
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toContain("at most 100");
    expect(performance.now() - started).toBeLessThan(250);
  });
});
