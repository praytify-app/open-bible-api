import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseUSFM } from "../../src/seeder/usfm-parser.js";

const samplePath = join(__dirname, "../fixtures/sample.usfm");
const sampleContent = readFileSync(samplePath, "utf-8");

describe("USFM Parser", () => {
  const result = parseUSFM(sampleContent);

  it("extracts book code (GEN)", () => {
    expect(result.bookCode).toBe("GEN");
  });

  it("extracts book name (Genesis)", () => {
    expect(result.bookName).toBe("Genesis");
  });

  it("parses 2 chapters", () => {
    expect(result.chapters).toHaveLength(2);
    expect(result.chapters[0].number).toBe(1);
    expect(result.chapters[1].number).toBe(2);
  });

  it("parses 3 verses per chapter", () => {
    expect(result.chapters[0].verses).toHaveLength(3);
    expect(result.chapters[1].verses).toHaveLength(3);
  });

  it("strips formatting markers from verse text", () => {
    const verse1 = result.chapters[0].verses[0];
    expect(verse1.number).toBe(1);
    expect(verse1.text).toBe(
      "In the beginning God created the heavens and the earth."
    );
    // Ensure no USFM markers remain
    expect(verse1.text).not.toMatch(/\\/);
  });

  it("preserves Unicode characters", () => {
    const unicodeContent = `\\id GEN - Test
\\h Génesis
\\c 1
\\p
\\v 1 En el principio Dios creó los cielos y la tierra.`;
    const parsed = parseUSFM(unicodeContent);
    expect(parsed.bookName).toBe("Génesis");
    expect(parsed.chapters[0].verses[0].text).toBe(
      "En el principio Dios creó los cielos y la tierra."
    );
  });

  it("joins poetry continuation lines into the open verse", () => {
    const poetry = `\\id PSA
\\h Psalms
\\c 23
\\d A Psalm of David.
\\q1
\\v 2 He maketh me to lie down in green pastures;
\\q1 He leadeth me beside still waters.
\\q1
\\v 3 He restoreth my soul:
\\q1 He guideth me in the paths of righteousness.`;
    const parsed = parseUSFM(poetry);
    const verses = parsed.chapters[0].verses;
    expect(verses[0].text).toBe(
      "He maketh me to lie down in green pastures; He leadeth me beside still waters."
    );
    expect(verses[1].text).toBe(
      "He restoreth my soul: He guideth me in the paths of righteousness."
    );
  });

  it("captures verse text that arrives only on a continuation line", () => {
    const content = `\\id PSA
\\c 1
\\q1
\\v 1
\\q1 Blessed is the man that walketh not.`;
    const parsed = parseUSFM(content);
    expect(parsed.chapters[0].verses[0]).toEqual({
      number: 1,
      text: "Blessed is the man that walketh not.",
    });
  });

  it("does not attach heading text or post-heading lines to a verse", () => {
    const content = `\\id PSA
\\c 3
\\v 8 Salvation belongeth unto Jehovah.
\\d A Psalm of David, when he fled.
\\q1 Stray line belonging to nothing.
\\v 9 Thy blessing be upon thy people.`;
    const parsed = parseUSFM(content);
    const verses = parsed.chapters[0].verses;
    expect(verses[0].text).toBe("Salvation belongeth unto Jehovah.");
    expect(verses[1].text).toBe("Thy blessing be upon thy people.");
  });

  it("strips Strong's word attributes at seed time", () => {
    const content = `\\id PSA
\\c 23
\\q1
\\v 1 \\w Jehovah|strong="H3068"\\w* \\w is|strong="H3068"\\w* my \\w shepherd|strong="H7462"\\w*.`;
    const parsed = parseUSFM(content);
    expect(parsed.chapters[0].verses[0].text).toBe("Jehovah is my shepherd.");
  });

  it("keeps bridged verse text under the first verse number", () => {
    const content = `\\id GEN
\\c 1
\\p
\\v 1-2 In the beginning God created the heavens and the earth.`;
    const parsed = parseUSFM(content);
    expect(parsed.chapters[0].verses[0]).toEqual({
      number: 1,
      text: "In the beginning God created the heavens and the earth.",
    });
  });

  it("merges split sub-verses into one row per verse number", () => {
    const content = `\\id GEN
\\c 2
\\p
\\v 4a First part of the verse.
\\v 4b-5 Second part bridging onward.
\\v 6 A normal verse.`;
    const parsed = parseUSFM(content);
    const verses = parsed.chapters[0].verses;
    expect(verses).toHaveLength(2);
    expect(verses[0]).toEqual({
      number: 4,
      text: "First part of the verse. Second part bridging onward.",
    });
    expect(verses[1]).toEqual({ number: 6, text: "A normal verse." });
  });

  it("merges repeated chapter markers instead of duplicating chapters", () => {
    const content = `\\id EZR
\\c 1
\\p
\\v 1 First verse of chapter one.
\\c 1
\\p
\\v 2 Second verse arriving after a repeated marker.
\\c 2
\\p
\\v 1 Chapter two begins.`;
    const parsed = parseUSFM(content);
    expect(parsed.chapters).toHaveLength(2);
    expect(parsed.chapters[0].verses.map((v) => v.number)).toEqual([1, 2]);
    expect(parsed.chapters[1].verses).toHaveLength(1);
  });

  it("merges repeated verse numbers instead of duplicating rows", () => {
    const content = `\\id PSA
\\c 1
\\q1
\\v 1 First stanza line.
\\q1 Continuation of first.
\\v 1 Repeated marker text.
\\v 2 Second verse.`;
    const parsed = parseUSFM(content);
    const verses = parsed.chapters[0].verses;
    expect(verses).toHaveLength(2);
    expect(verses[0].number).toBe(1);
    expect(verses[0].text).toBe(
      "First stanza line. Continuation of first. Repeated marker text."
    );
  });
});
