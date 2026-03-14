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
});
