import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseUSX } from "../../src/seeder/usx-parser.js";

const samplePath = join(__dirname, "../fixtures/sample.usx");
const sampleContent = readFileSync(samplePath, "utf-8");

describe("USX Parser", () => {
  const result = parseUSX(sampleContent);

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

  it("parses correct number of verses per chapter", () => {
    expect(result.chapters[0].verses).toHaveLength(3);
    expect(result.chapters[1].verses).toHaveLength(1);
  });

  it("extracts verse text correctly", () => {
    expect(result.chapters[0].verses[0].number).toBe(1);
    expect(result.chapters[0].verses[0].text).toBe(
      "In the beginning God created the heavens and the earth."
    );
    expect(result.chapters[0].verses[2].text).toBe(
      'Then God said, "Let there be light."'
    );
  });

  it("preserves Unicode characters", () => {
    const unicodeUSX = `<?xml version="1.0" encoding="utf-8"?>
<usx version="3.0">
  <book code="GEN" style="id">Test</book>
  <para style="h">Génesis</para>
  <chapter number="1" style="c" />
  <para style="p">
    <verse number="1" style="v" />En el principio Dios creó los cielos.
  </para>
</usx>`;
    const parsed = parseUSX(unicodeUSX);
    expect(parsed.bookName).toBe("Génesis");
    expect(parsed.chapters[0].verses[0].text).toBe(
      "En el principio Dios creó los cielos."
    );
  });
});
