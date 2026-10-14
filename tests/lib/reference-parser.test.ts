import { describe, it, expect } from "vitest";
import { parseReference, MAX_REFERENCE_LENGTH } from "../../src/lib/reference-parser.js";

describe("parseReference", () => {
  it("should parse 'John 3:16'", () => {
    const result = parseReference("John 3:16");
    expect(result).toEqual({
      book: "John",
      chapter: 3,
      verseStart: 16,
      verseEnd: undefined,
    });
  });

  it("should parse 'John 3:16-18' (range)", () => {
    const result = parseReference("John 3:16-18");
    expect(result).toEqual({
      book: "John",
      chapter: 3,
      verseStart: 16,
      verseEnd: 18,
    });
  });

  it("should parse '1 John 3:16' (numbered book)", () => {
    const result = parseReference("1 John 3:16");
    expect(result).toEqual({
      book: "1 John",
      chapter: 3,
      verseStart: 16,
      verseEnd: undefined,
    });
  });

  it("should parse 'Song of Solomon 2:1' (multi-word book)", () => {
    const result = parseReference("Song of Solomon 2:1");
    expect(result).toEqual({
      book: "Song of Solomon",
      chapter: 2,
      verseStart: 1,
      verseEnd: undefined,
    });
  });

  it("should return null for invalid references", () => {
    expect(parseReference("")).toBeNull();
    expect(parseReference("invalid")).toBeNull();
    expect(parseReference("John")).toBeNull();
    expect(parseReference("3:16")).toBeNull();
  });

  it("should trim whitespace", () => {
    const result = parseReference("  John 3:16  ");
    expect(result).toEqual({
      book: "John",
      chapter: 3,
      verseStart: 16,
      verseEnd: undefined,
    });
  });

  it("should parse 'Genesis 1:1-5'", () => {
    const result = parseReference("Genesis 1:1-5");
    expect(result).toEqual({
      book: "Genesis",
      chapter: 1,
      verseStart: 1,
      verseEnd: 5,
    });
  });

  it("should parse '2 Chronicles 7:14'", () => {
    const result = parseReference("2 Chronicles 7:14");
    expect(result).toEqual({
      book: "2 Chronicles",
      chapter: 7,
      verseStart: 14,
      verseEnd: undefined,
    });
  });
});

describe("parseReference: extended forms", () => {
  it("parses a chapter-only reference as the whole chapter", () => {
    expect(parseReference("John 3")).toEqual({ book: "John", chapter: 3 });
    expect(parseReference("Psalm 23")).toEqual({ book: "Psalm", chapter: 23 });
  });

  it("accepts en dash, em dash, and spaced ranges", () => {
    const expected = { book: "John", chapter: 3, verseStart: 16, verseEnd: 18 };
    expect(parseReference("John 3:16\u201318")).toEqual(expected);
    expect(parseReference("John 3:16\u201418")).toEqual(expected);
    expect(parseReference("John 3:16 - 18")).toEqual(expected);
  });

  it("accepts a period as the chapter-verse separator and a dotted abbreviation", () => {
    expect(parseReference("Jn. 3.16")).toEqual({ book: "Jn", chapter: 3, verseStart: 16, verseEnd: undefined });
  });

  it("accepts numbered books with or without a space, and roman numerals", () => {
    expect(parseReference("1John 1:9")?.book).toBe("1John");
    expect(parseReference("1 John 1:9")?.book).toBe("1 John");
    expect(parseReference("I John 1:9")?.book).toBe("I John");
    expect(parseReference("1 Cor 13:4-7")).toEqual({ book: "1 Cor", chapter: 13, verseStart: 4, verseEnd: 7 });
  });

  it("accepts USFM codes", () => {
    expect(parseReference("JHN 3:16")).toEqual({ book: "JHN", chapter: 3, verseStart: 16, verseEnd: undefined });
    expect(parseReference("1JN 1:9")?.book).toBe("1JN");
  });

  it("accepts book names in non-Latin and accented scripts", () => {
    expect(parseReference("\u0625\u0650\u0646\u0652\u062c\u0650\u064a\u0644\u064f \u064a\u064f\u0648\u062d\u064e\u0646\u0651\u064e\u0627 3:16")?.chapter).toBe(3);
    expect(parseReference("\u00c9vangile selon Jean 3:16")?.book).toBe("\u00c9vangile selon Jean");
    expect(parseReference("\u0418\u043e\u0430\u043d\u043d\u0430 3:16")?.verseStart).toBe(16);
  });

  it("collapses internal whitespace runs", () => {
    expect(parseReference("Song   of\tSolomon   2:1")?.book).toBe("Song of Solomon");
  });

  it("rejects zero, reversed ranges, cross-chapter ranges, and verse lists", () => {
    expect(parseReference("John 0:1")).toBeNull();
    expect(parseReference("John 3:0")).toBeNull();
    expect(parseReference("John 3:18-16")).toBeNull();
    expect(parseReference("John 3:16-4:2")).toBeNull();
    expect(parseReference("John 3:16,18")).toBeNull();
    expect(parseReference("John 3:16-")).toBeNull();
  });

  it("rejects digits inside a book name and symbol-only books", () => {
    expect(parseReference("Jo3hn 3:16")).toBeNull();
    expect(parseReference("<script> 3:16")).toBeNull();
    expect(parseReference("5 John 3:16")).toBeNull();
  });

  it("rejects input longer than MAX_REFERENCE_LENGTH", () => {
    const long = "John" + " ".repeat(MAX_REFERENCE_LENGTH) + "3:16";
    expect(parseReference(long)).toBeNull();
  });
});

describe("parseReference: hostile input", () => {
  // The previous regex took ~0.6 s on 16k spaces (the query-string limit)
  // and ~160 ms on 8k. These inputs are the worst cases for the new scan.
  const hostile = [
    "John" + " ".repeat(16_000) + "3:16",
    "1" + " ".repeat(98) + "1",
    "a ".repeat(49) + "1",
    "1:".repeat(50),
    " ".repeat(99) + "x",
    "a".repeat(99) + "1",
  ];

  it("returns quickly and never matches", () => {
    const started = performance.now();
    for (let i = 0; i < 2_000; i++) {
      for (const input of hostile) parseReference(input);
    }
    const elapsed = performance.now() - started;
    for (const input of hostile.slice(0, 1)) expect(parseReference(input)).toBeNull();
    // 12k parses; generous bound so CI noise cannot flake it.
    expect(elapsed).toBeLessThan(1_000);
  });
});

