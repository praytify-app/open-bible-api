import { describe, it, expect } from "vitest";
import { normalizeBookKey, resolveBook, englishAliasToCode } from "../../src/lib/book-names.js";

const ENGLISH = [
  { bookCode: "GEN", name: "Genesis" },
  { bookCode: "JOB", name: "Job" },
  { bookCode: "PSA", name: "Psalms" },
  { bookCode: "SNG", name: "Song of Solomon" },
  { bookCode: "ISA", name: "Isaiah" },
  { bookCode: "JON", name: "Jonah" },
  { bookCode: "JHN", name: "John" },
  { bookCode: "1CO", name: "1 Corinthians" },
  { bookCode: "1JN", name: "1 John" },
  { bookCode: "JUD", name: "Jude" },
];

// Names as they appear in the eBible Arabic Van Dyck USFM headers, with harakat.
const ARABIC = [
  { bookCode: "PSA", name: "اَلْمَزَامِيرُ" },
  { bookCode: "JHN", name: "إِنْجِيلُ يُوحَنَّا" },
];

const FRENCH = [{ bookCode: "JHN", name: "Évangile selon Jean" }];

const code = (q: string, books = ENGLISH) => resolveBook(q, books)?.bookCode;

describe("normalizeBookKey", () => {
  it("folds case, spaces, periods, and ordinal prefixes", () => {
    expect(normalizeBookKey("1 John")).toBe("1john");
    expect(normalizeBookKey("1John")).toBe("1john");
    expect(normalizeBookKey("I John")).toBe("1john");
    expect(normalizeBookKey("First John")).toBe("1john");
    expect(normalizeBookKey("III John")).toBe("3john");
    expect(normalizeBookKey("Jn.")).toBe("jn");
  });

  it("never reads a leading I as a numeral without a following space", () => {
    expect(normalizeBookKey("Isaiah")).toBe("isaiah");
  });

  it("strips accents and Arabic diacritics", () => {
    expect(normalizeBookKey("Évangile selon Jean")).toBe("evangileselonjean");
    expect(normalizeBookKey(ARABIC[1].name)).toBe(normalizeBookKey("انجيل يوحنا"));
  });
});

describe("resolveBook", () => {
  it("matches USFM codes first, in any case", () => {
    expect(code("JHN")).toBe("JHN");
    expect(code("jhn")).toBe("JHN");
    expect(code("1JN")).toBe("1JN");
  });

  it("matches the version's localized name", () => {
    expect(code("Song of Solomon")).toBe("SNG");
    expect(code("song of solomon")).toBe("SNG");
    expect(code("Isaiah")).toBe("ISA");
    expect(code("évangile selon jean", FRENCH)).toBe("JHN");
    expect(code("Evangile selon Jean", FRENCH)).toBe("JHN");
  });

  it("matches localized Arabic names typed without diacritics", () => {
    expect(code("انجيل يوحنا", ARABIC)).toBe("JHN");
    expect(code("المزامير", ARABIC)).toBe("PSA");
  });

  it("falls back to English names and abbreviations", () => {
    expect(code("Jn")).toBe("JHN");
    expect(code("Psalm")).toBe("PSA");
    expect(code("Ps")).toBe("PSA");
    expect(code("Gen")).toBe("GEN");
    expect(code("1 Cor")).toBe("1CO");
    expect(code("I John")).toBe("1JN");
    expect(code("Song of Songs")).toBe("SNG");
  });

  it("lets English references resolve in a non-English version", () => {
    expect(code("John", ARABIC)).toBe("JHN");
    expect(code("Psalms", ARABIC)).toBe("PSA");
  });

  it("treats three-letter codes as codes even where English is ambiguous", () => {
    // USFM JUD is Jude, JON is Jonah.
    expect(code("Jud")).toBe("JUD");
    expect(code("Jon")).toBe("JON");
    expect(code("Job")).toBe("JOB");
  });

  it("returns undefined for unknown books and books missing from the version", () => {
    expect(code("Hezekiah")).toBeUndefined();
    expect(code("Rom")).toBeUndefined();
    expect(code("")).toBeUndefined();
  });
});

describe("englishAliasToCode", () => {
  it("covers every Protestant book's full English name", () => {
    const names = [
      "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Joshua", "Judges", "Ruth",
      "1 Samuel", "2 Samuel", "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles", "Ezra",
      "Nehemiah", "Esther", "Job", "Psalms", "Proverbs", "Ecclesiastes", "Song of Solomon",
      "Isaiah", "Jeremiah", "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel", "Amos",
      "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah", "Haggai", "Zechariah",
      "Malachi", "Matthew", "Mark", "Luke", "John", "Acts", "Romans", "1 Corinthians",
      "2 Corinthians", "Galatians", "Ephesians", "Philippians", "Colossians",
      "1 Thessalonians", "2 Thessalonians", "1 Timothy", "2 Timothy", "Titus", "Philemon",
      "Hebrews", "James", "1 Peter", "2 Peter", "1 John", "2 John", "3 John", "Jude",
      "Revelation",
    ];
    const codes = new Set(names.map((n) => englishAliasToCode(n)));
    expect(codes.has(undefined)).toBe(false);
    expect(codes.size).toBe(66);
  });
});
