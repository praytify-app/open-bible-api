import { describe, expect, it } from "vitest";
import { highestChapterNumber } from "../../src/seeder/chapter-count.js";

// books.chapter_count is the highest chapter number (the API documents it that
// way, and readers list 1..chapterCount). Counting the parsed chapters instead
// hid the text of partial translations: Walmajarri Isaiah has only chapter 41,
// so a count of 1 sent readers to a chapter 1 that does not exist.
describe("highestChapterNumber", () => {
  it("is the last chapter of a complete book", () => {
    expect(highestChapterNumber([{ number: 1 }, { number: 2 }, { number: 3 }])).toBe(3);
  });

  it("is the highest number, not the count, when a partial book skips chapters", () => {
    expect(highestChapterNumber([{ number: 8 }, { number: 11 }, { number: 20 }, { number: 21 }])).toBe(21);
    expect(highestChapterNumber([{ number: 41 }])).toBe(41);
  });

  it("does not depend on source order", () => {
    expect(highestChapterNumber([{ number: 16 }, { number: 4 }])).toBe(16);
  });

  it("is 0 for a book with no chapters", () => {
    expect(highestChapterNumber([])).toBe(0);
  });
});
