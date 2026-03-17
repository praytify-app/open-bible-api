import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  classifyLicense,
  parseCsvLine,
  parseCatalogCsv,
  filterByLicense,
  type CatalogEntry,
} from "../../src/seeder/catalog.js";

const FIXTURE_PATH = join(
  import.meta.dirname,
  "..",
  "fixtures",
  "translations-sample.csv"
);

describe("classifyLicense", () => {
  it("classifies Public Domain as PD", () => {
    expect(classifyLicense("Public Domain")).toBe("PD");
    expect(classifyLicense("public domain")).toBe("PD");
  });

  it("classifies CC BY as CC_BY", () => {
    expect(
      classifyLicense("Creative Commons Attribution license 4.0")
    ).toBe("CC_BY");
    expect(
      classifyLicense(
        "Copyright © 2010 Iglesia de Dios. Released under Creative Commons Attribution Share-Alike license 4.0"
      )
    ).toBe("CC_BY_SA");
  });

  it("classifies CC BY-SA as CC_BY_SA", () => {
    expect(
      classifyLicense("Creative Commons Attribution-ShareAlike 4.0")
    ).toBe("CC_BY_SA");
  });

  it("classifies NC licenses as OTHER", () => {
    expect(
      classifyLicense("Creative Commons Attribution-NonCommercial 4.0")
    ).toBe("OTHER");
  });

  it("classifies ND licenses as OTHER", () => {
    expect(
      classifyLicense("Creative Commons Attribution-NoDerivatives 4.0")
    ).toBe("OTHER");
  });

  it("classifies proprietary as OTHER", () => {
    expect(classifyLicense("Copyright © Proprietary")).toBe("OTHER");
  });

  it("classifies Wycliffe copyright as COPYRIGHTED_REDISTRIBUTABLE", () => {
    expect(classifyLicense("Copyright © 2011 Wycliffe Bible Translators, Inc.")).toBe("COPYRIGHTED_REDISTRIBUTABLE");
    expect(classifyLicense("Copyright © 2024 The Word for the World International")).toBe("COPYRIGHTED_REDISTRIBUTABLE");
  });
});

describe("parseCsvLine", () => {
  it("parses simple unquoted fields", () => {
    expect(parseCsvLine("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("parses quoted fields", () => {
    expect(parseCsvLine('"hello","world"')).toEqual(["hello", "world"]);
  });

  it("handles commas inside quotes", () => {
    expect(parseCsvLine('"hello, world","test"')).toEqual([
      "hello, world",
      "test",
    ]);
  });

  it("handles escaped quotes (double quotes)", () => {
    expect(parseCsvLine('"say ""hello""","ok"')).toEqual([
      'say "hello"',
      "ok",
    ]);
  });

  it("handles empty fields", () => {
    expect(parseCsvLine('"a","","c"')).toEqual(["a", "", "c"]);
  });
});

describe("parseCatalogCsv", () => {
  let entries: CatalogEntry[];

  // Read fixture once
  const csv = readFileSync(FIXTURE_PATH, "utf-8");

  it("parses the sample CSV into entries", () => {
    entries = parseCatalogCsv(csv);
    // 10 data rows, but 1 is not redistributable (deulut has Redistributable=False)
    expect(entries.length).toBe(10);
  });

  it("parses language fields correctly", () => {
    entries = parseCatalogCsv(csv);
    const kjv = entries.find((e) => e.translationId === "engkjv");
    expect(kjv).toBeDefined();
    expect(kjv!.languageCode).toBe("eng");
    expect(kjv!.languageName).toBe("English");
    expect(kjv!.languageNativeName).toBe("English");
    expect(kjv!.languageScript).toBe("Latin");
    expect(kjv!.languageDirection).toBe("ltr");
  });

  it("derives abbreviation from shortTitle", () => {
    entries = parseCatalogCsv(csv);
    const kjv = entries.find((e) => e.translationId === "engkjv");
    expect(kjv!.abbreviation).toBe("KJV");
  });

  it("classifies licenses correctly", () => {
    entries = parseCatalogCsv(csv);
    const kjv = entries.find((e) => e.translationId === "engkjv");
    expect(kjv!.licenseType).toBe("PD");

    const yor = entries.find((e) => e.translationId === "yorulb");
    expect(yor!.licenseType).toBe("CC_BY");

    const ibo = entries.find((e) => e.translationId === "ibobib");
    expect(ibo!.licenseType).toBe("CC_BY_SA");

    const zho = entries.find((e) => e.translationId === "zhocuv");
    expect(zho!.licenseType).toBe("OTHER"); // NC

    const por = entries.find((e) => e.translationId === "porara");
    expect(por!.licenseType).toBe("OTHER"); // ND
  });

  it("builds sourceUrl from translationId", () => {
    entries = parseCatalogCsv(csv);
    const kjv = entries.find((e) => e.translationId === "engkjv");
    expect(kjv!.sourceUrl).toBe(
      "https://ebible.org/Scriptures/engkjv_usfm.zip"
    );
  });

  it("handles RTL text direction", () => {
    entries = parseCatalogCsv(csv);
    const arb = entries.find((e) => e.translationId === "arbnav");
    expect(arb!.languageDirection).toBe("rtl");
  });

  it("skips non-redistributable entries", () => {
    entries = parseCatalogCsv(csv);
    const deu = entries.find((e) => e.translationId === "deulut");
    expect(deu).toBeUndefined();
  });
});

describe("filterByLicense", () => {
  it("keeps PD, CC_BY, CC_BY_SA, COPYRIGHTED_REDISTRIBUTABLE and excludes OTHER", () => {
    const csv = readFileSync(FIXTURE_PATH, "utf-8");
    const all = parseCatalogCsv(csv);
    const filtered = filterByLicense(all);
    // 10 redistributable - 2 excluded (zhocuv NC + porara ND) = 8
    expect(filtered.length).toBe(8);
    const ids = filtered.map((e) => e.translationId);
    expect(ids).toContain("engkjv");
    expect(ids).toContain("aak");
    expect(ids).not.toContain("zhocuv");
    expect(ids).not.toContain("porara");
  });
});
