import { describe, it, expect, vi, beforeEach } from "vitest";

const mock = await vi.hoisted(async () => {
  const { createMockDb } = await import("../helpers/mock-db.js");
  return createMockDb();
});

vi.mock("../../src/db/client.js", () => ({ db: mock.db, queryClient: {} }));

import { app } from "../../src/index.js";
import { dailySlot, parseUtcDate } from "../../src/routes/daily.js";
import { CachePolicy } from "../../src/middleware/cache.js";

const ENTRY = {
  id: "d1",
  dayOfYear: 288,
  reference: "Psalm 23:1",
  text: "The LORD is my shepherd; I shall not want.",
  versionAbbreviation: "KJV",
};

const WEB = {
  id: "ver-web",
  abbreviation: "WEB",
  name: "World English Bible",
  license: "Public Domain",
  licenseType: "PD",
  attribution: "World English Bible",
  attributionUrl: "https://ebible.org/find/details.php?id=engwebp",
  languageCode: "eng",
  textDirection: "ltr",
};

const WEB_CATALOG = [
  { version: WEB, book: { id: "web-psa", bookCode: "PSA", name: "Psalms", position: 19, chapterCount: 150, testament: "OT" } },
];

const utc = (iso: string) => new Date(`${iso}T12:00:00Z`);

describe("dailySlot", () => {
  it("counts on a leap-year calendar so a date always maps to one slot", () => {
    expect(dailySlot(utc("2026-01-01"))).toBe(1);
    expect(dailySlot(utc("2026-02-28"))).toBe(59);
    expect(dailySlot(utc("2028-02-29"))).toBe(60);
    expect(dailySlot(utc("2026-03-01"))).toBe(61);
    expect(dailySlot(utc("2028-03-01"))).toBe(61);
    expect(dailySlot(utc("2026-12-25"))).toBe(360);
    expect(dailySlot(utc("2026-12-31"))).toBe(366);
  });

  it("uses the UTC date, not the server's local date", () => {
    expect(dailySlot(new Date("2026-01-01T23:30:00-05:00"))).toBe(2); // 04:30 UTC on Jan 2
  });

  it("matches the previous index from March onward in a common year", () => {
    // Old: Math.floor((now - Dec 31 of prior year) / day) % 366 + 1
    for (let d = new Date(Date.UTC(2026, 2, 1)); d.getUTCFullYear() === 2026; d = new Date(d.getTime() + 86_400_000)) {
      const ordinal = Math.floor((d.getTime() - Date.UTC(2025, 11, 31)) / 86_400_000);
      expect(dailySlot(d)).toBe((ordinal % 366) + 1);
    }
  });
});

describe("parseUtcDate", () => {
  it("accepts real dates and rejects impossible or malformed ones", () => {
    expect(parseUtcDate("2026-10-14")?.toISOString()).toBe("2026-10-14T00:00:00.000Z");
    expect(parseUtcDate("2028-02-29")).not.toBeNull();
    expect(parseUtcDate("2026-02-29")).toBeNull();
    expect(parseUtcDate("2026-13-01")).toBeNull();
    expect(parseUtcDate("14/10/2026")).toBeNull();
    expect(parseUtcDate("2026-10-14T00:00")).toBeNull();
  });
});

describe("GET /api/v1/daily", () => {
  beforeEach(() => mock.reset());

  it("serves the curated verse with its locator and expires at UTC midnight", async () => {
    mock.queue([ENTRY]);
    const res = await app.request("/api/v1/daily");
    expect(res.status).toBe(200);
    const { data } = await res.json();

    expect(data).toMatchObject({
      reference: "Psalm 23:1",
      text: ENTRY.text,
      version: "KJV",
      bookCode: "PSA",
      chapter: 23,
      verseStart: 1,
      verseEnd: 1,
    });
    expect(data.date).toBe(new Date().toISOString().slice(0, 10));
    expect(data.requestedVersion).toBeUndefined();

    const cc = res.headers.get("cache-control")!;
    const maxAge = Number(/max-age=(\d+)/.exec(cc)![1]);
    expect(maxAge).toBeGreaterThanOrEqual(60);
    expect(maxAge).toBeLessThanOrEqual(86_400);
    expect(cc).toContain(`s-maxage=${maxAge}`);
    expect(mock.calls.queries).toBe(1);
  });

  it("serves a pinned date with a long-lived cache policy", async () => {
    mock.queue([ENTRY]);
    const res = await app.request("/api/v1/daily?date=2026-12-25");
    const { data } = await res.json();
    expect(data.dayOfYear).toBe(360);
    expect(data.date).toBe("2026-12-25");
    expect(res.headers.get("cache-control")).toBe(CachePolicy.scripture);
  });

  it("rejects a malformed date without querying", async () => {
    const res = await app.request("/api/v1/daily?date=2026-02-30");
    expect(res.status).toBe(400);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(mock.calls.queries).toBe(0);
  });

  it("reads the day's reference in the requested version", async () => {
    mock.queue([ENTRY], WEB_CATALOG, [{ id: 7, number: 1, text: "Yahweh is my shepherd: I shall lack nothing." }]);
    const res = await app.request("/api/v1/daily?version=WEB");
    const { data } = await res.json();

    expect(data).toMatchObject({
      reference: "Psalm 23:1",
      text: "Yahweh is my shepherd: I shall lack nothing.",
      version: "WEB",
      bookCode: "PSA",
      bookName: "Psalms",
      chapter: 23,
      verseStart: 1,
      verseEnd: 1,
      license: "Public Domain",
      attribution: "World English Bible",
      attributionUrl: "https://ebible.org/find/details.php?id=engwebp",
    });
    expect(data.requestedVersion).toBeUndefined();
    expect(data.note).toBeUndefined();
  });

  it("joins a multi-verse reference into one text", async () => {
    mock.queue([{ ...ENTRY, reference: "Psalm 23:1-2" }], WEB_CATALOG, [
      { id: 7, number: 1, text: "Yahweh is my shepherd:" },
      { id: 8, number: 2, text: "He makes me lie down." },
    ]);
    const { data } = await (await app.request("/api/v1/daily?version=WEB")).json();
    expect(data.text).toBe("Yahweh is my shepherd: He makes me lie down.");
    expect(data.verseEnd).toBe(2);
  });

  it("falls back to the curated text with a note when the version is unknown", async () => {
    mock.queue([ENTRY], []);
    const { data } = await (await app.request("/api/v1/daily?version=NOPE")).json();
    expect(data).toMatchObject({ text: ENTRY.text, version: "KJV", requestedVersion: "NOPE" });
    expect(data.note).toContain("not available");
  });

  it("falls back with a note when the version lacks the verse", async () => {
    mock.queue([ENTRY], WEB_CATALOG, []);
    const { data } = await (await app.request("/api/v1/daily?version=WEB")).json();
    expect(data).toMatchObject({ text: ENTRY.text, version: "KJV", requestedVersion: "WEB" });
    expect(data.note).toContain("does not contain Psalm 23:1");
  });

  it("adds no note when the curated version itself is requested but not seeded", async () => {
    mock.queue([ENTRY], []);
    const { data } = await (await app.request("/api/v1/daily?version=KJV")).json();
    expect(data.version).toBe("KJV");
    expect(data.requestedVersion).toBeUndefined();
    expect(data.note).toBeUndefined();
  });
});
