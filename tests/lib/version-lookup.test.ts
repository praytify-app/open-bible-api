import { describe, expect, it } from "vitest";
import { pickVersion, sourceUrlForCode, versionCode } from "../../src/lib/version-lookup.js";

const ebible = (id: string) => `https://ebible.org/Scriptures/${id}_usfm.zip`;

describe("versionCode", () => {
  it("reads the eBible translation id from the source URL", () => {
    expect(versionCode(ebible("engwebp"))).toBe("engwebp");
    expect(versionCode(ebible("eng-kjv2006"))).toBe("eng-kjv2006");
  });

  it("is null for other sources and missing URLs", () => {
    expect(versionCode("https://api.esv.org/v3/")).toBeNull();
    expect(versionCode(null)).toBeNull();
    expect(versionCode(undefined)).toBeNull();
  });
});

describe("sourceUrlForCode", () => {
  it("builds the source URL for a code-shaped param", () => {
    expect(sourceUrlForCode("arb-vd")).toBe(ebible("arb-vd"));
  });

  it("refuses params that cannot be codes, so they never reach SQL as URLs", () => {
    for (const param of ["World English Bible", "a/b", "x", "../x", "a".repeat(65), "%2e%2e"]) {
      expect(sourceUrlForCode(param), param).toBeNull();
    }
  });
});

describe("pickVersion", () => {
  const rows = [
    { id: "titled", abbreviation: "World English Bible", sourceUrl: ebible("engwebp") },
    { id: "kjv", abbreviation: "KJV", sourceUrl: ebible("eng-kjv2006") },
    { id: "asv-legacy", abbreviation: "American Standard Version (1901)", sourceUrl: ebible("eng-asv") },
    { id: "odd", abbreviation: "eng-kjv2006", sourceUrl: null },
  ];
  const key = (r: (typeof rows)[number]) => r;

  it("finds a version by its code when its abbreviation is a title", () => {
    expect(pickVersion(rows, "engwebp", key)?.id).toBe("titled");
  });

  it("still finds versions by abbreviation, including legacy titles behind a canonical one", () => {
    expect(pickVersion(rows, "KJV", key)?.id).toBe("kjv");
    expect(pickVersion(rows, "ASV", key)?.id).toBe("asv-legacy");
    expect(pickVersion(rows, "World English Bible", key)?.id).toBe("titled");
  });

  it("prefers an abbreviation over another version's code, so existing URLs keep their meaning", () => {
    expect(pickVersion(rows, "eng-kjv2006", key)?.id).toBe("odd");
  });

  it("returns nothing when neither matches", () => {
    expect(pickVersion(rows, "NOPE", key)).toBeUndefined();
  });
});
