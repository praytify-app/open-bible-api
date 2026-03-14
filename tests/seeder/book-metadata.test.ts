import { describe, it, expect } from "vitest";
import {
  BOOK_METADATA,
  getBookMeta,
} from "../../src/seeder/book-metadata.js";

describe("Book Metadata", () => {
  it("has 66 books", () => {
    expect(BOOK_METADATA).toHaveLength(66);
  });

  it("Genesis is at position 1, OT", () => {
    const gen = getBookMeta("GEN");
    expect(gen).toBeDefined();
    expect(gen!.position).toBe(1);
    expect(gen!.testament).toBe("OT");
    expect(gen!.englishName).toBe("Genesis");
  });

  it("Revelation is at position 66, NT", () => {
    const rev = getBookMeta("REV");
    expect(rev).toBeDefined();
    expect(rev!.position).toBe(66);
    expect(rev!.testament).toBe("NT");
    expect(rev!.englishName).toBe("Revelation");
  });

  it("unknown code returns undefined", () => {
    expect(getBookMeta("XYZ")).toBeUndefined();
  });

  it("lookup is case-insensitive", () => {
    expect(getBookMeta("gen")).toBeDefined();
    expect(getBookMeta("Gen")).toBeDefined();
    expect(getBookMeta("gen")!.code).toBe("GEN");
  });
});
