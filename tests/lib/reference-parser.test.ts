import { describe, it, expect } from "vitest";
import { parseReference } from "../../src/lib/reference-parser.js";

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
    expect(parseReference("John 3")).toBeNull();
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
