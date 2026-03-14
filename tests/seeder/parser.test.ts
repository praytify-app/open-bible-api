import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseBibleFile } from "../../src/seeder/parser.js";

const usfmContent = readFileSync(
  join(__dirname, "../fixtures/sample.usfm"),
  "utf-8"
);
const usxContent = readFileSync(
  join(__dirname, "../fixtures/sample.usx"),
  "utf-8"
);

describe("parseBibleFile (auto-detection)", () => {
  it("correctly routes USFM files", () => {
    const result = parseBibleFile(usfmContent);
    expect(result.bookCode).toBe("GEN");
    expect(result.bookName).toBe("Genesis");
    expect(result.chapters).toHaveLength(2);
  });

  it("correctly routes USX files", () => {
    const result = parseBibleFile(usxContent);
    expect(result.bookCode).toBe("GEN");
    expect(result.bookName).toBe("Genesis");
    expect(result.chapters).toHaveLength(2);
  });

  it("detects USX when content starts with <?xml", () => {
    const xml = `<?xml version="1.0"?>
<usx version="3.0">
  <book code="MAT" style="id">Test</book>
  <para style="h">Matthew</para>
  <chapter number="1" style="c" />
  <para style="p">
    <verse number="1" style="v" />The book of the genealogy of Jesus Christ.
  </para>
</usx>`;
    const result = parseBibleFile(xml);
    expect(result.bookCode).toBe("MAT");
  });

  it("detects USX when content starts with <usx", () => {
    const xml = `<usx version="3.0">
  <book code="MAT" style="id">Test</book>
  <para style="h">Matthew</para>
  <chapter number="1" style="c" />
  <para style="p">
    <verse number="1" style="v" />The book of the genealogy of Jesus Christ.
  </para>
</usx>`;
    const result = parseBibleFile(xml);
    expect(result.bookCode).toBe("MAT");
  });

  it("defaults to USFM for non-XML content", () => {
    const usfm = `\\id MAT - Test
\\h Matthew
\\c 1
\\v 1 The book of the genealogy of Jesus Christ.`;
    const result = parseBibleFile(usfm);
    expect(result.bookCode).toBe("MAT");
  });
});
