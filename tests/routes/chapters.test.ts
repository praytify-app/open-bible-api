import { describe, it, expect, vi, beforeEach } from "vitest";

const mock = await vi.hoisted(async () => {
  const { createMockDb } = await import("../helpers/mock-db.js");
  return createMockDb();
});

vi.mock("../../src/db/client.js", () => ({ db: mock.db, queryClient: {} }));

import { app } from "../../src/index.js";

const KJV = {
  id: "ver-kjv",
  abbreviation: "KJV",
  name: "King James Version",
  license: "Public Domain",
  licenseType: "PD",
  attribution: "King James Version (Public Domain)",
  attributionUrl: "https://ebible.org/find/details.php?id=eng-kjv2006",
  languageCode: "eng",
  textDirection: "ltr",
};

const VERSES = [
  { id: 10, chapterId: "ch-1", number: 1, text: "In the beginning was the Word," },
  { id: 11, chapterId: "ch-1", number: 2, text: "The same \\add was\\add* in the beginning with God." },
];

describe("GET /api/v1/chapters/{version}/{bookCode}/{chapter}/verses", () => {
  beforeEach(() => mock.reset());

  it("returns the verse array plus version licensing meta in two queries", async () => {
    mock.queue([{ version: KJV, bookId: "book-jhn", bookName: "John" }], VERSES);

    const res = await app.request("/api/v1/chapters/KJV/JHN/1/verses");
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.data).toEqual([
      VERSES[0],
      { ...VERSES[1], text: "The same was in the beginning with God." },
    ]);
    expect(body.meta).toEqual({
      version: "KJV",
      versionName: "King James Version",
      bookCode: "JHN",
      bookName: "John",
      chapter: 1,
      license: "Public Domain",
      licenseType: "PD",
      attribution: "King James Version (Public Domain)",
      attributionUrl: "https://ebible.org/find/details.php?id=eng-kjv2006",
      languageCode: "eng",
      textDirection: "ltr",
    });
    expect(mock.calls.queries).toBe(2);
  });

  it("accepts a lowercase book code", async () => {
    mock.queue([{ version: KJV, bookId: "book-jhn", bookName: "John" }], VERSES);
    const res = await app.request("/api/v1/chapters/KJV/jhn/1/verses");
    expect(res.status).toBe(200);
    expect((await res.json()).meta.bookCode).toBe("JHN");
  });

  it("distinguishes a missing version, book, and chapter", async () => {
    mock.queue([]);
    const noVersion = await app.request("/api/v1/chapters/NOPE/JHN/1/verses");
    expect(noVersion.status).toBe(404);
    expect((await noVersion.json()).error.message).toContain("Version 'NOPE'");

    mock.queue([{ version: KJV, bookId: null, bookName: null }]);
    const noBook = await app.request("/api/v1/chapters/KJV/XYZ/1/verses");
    expect(noBook.status).toBe(404);
    expect((await noBook.json()).error.message).toContain("Book 'XYZ'");

    mock.queue([{ version: KJV, bookId: "book-jhn", bookName: "John" }], []);
    const noChapter = await app.request("/api/v1/chapters/KJV/JHN/99/verses");
    expect(noChapter.status).toBe(404);
    expect((await noChapter.json()).error.message).toContain("Chapter 99");
  });

  it("rejects a non-positive or non-numeric chapter without querying", async () => {
    for (const chapter of ["0", "-1", "abc"]) {
      const res = await app.request(`/api/v1/chapters/KJV/JHN/${chapter}/verses`);
      expect(res.status).toBe(400);
    }
    expect(mock.calls.queries).toBe(0);
  });
});

describe("GET /api/v1/chapters/{id}/verses", () => {
  beforeEach(() => mock.reset());

  it("answers 404 for a non-UUID id instead of a Postgres cast error", async () => {
    const res = await app.request("/api/v1/chapters/not-a-uuid/verses");
    expect(res.status).toBe(404);
    expect(mock.calls.queries).toBe(0);
  });
});
