import { describe, expect, it } from "vitest";
import {
  canonicalizeVersionAbbreviation,
  getVersionAbbreviationCandidates,
} from "../../src/lib/version-abbreviations.js";

describe("version abbreviation canonicalization", () => {
  it("normalizes legacy English abbreviations to canonical codes", () => {
    expect(canonicalizeVersionAbbreviation("American Standard Version (1901)")).toBe(
      "ASV"
    );
    expect(canonicalizeVersionAbbreviation("English Berean Standard Bible")).toBe(
      "BSB"
    );
    expect(canonicalizeVersionAbbreviation("Majority Standard BIble")).toBe(
      "MSB"
    );
    expect(canonicalizeVersionAbbreviation("Open English Bible (US)")).toBe("OEB");
    expect(canonicalizeVersionAbbreviation("Open English Bible (Commonwealth)")).toBe(
      "OEB-CW"
    );
    expect(canonicalizeVersionAbbreviation("World English Bible Updated")).toBe(
      "WEBU"
    );
  });

  it("returns canonical plus legacy candidates for lookups", () => {
    expect(getVersionAbbreviationCandidates("BSB")).toEqual([
      "BSB",
      "English Berean Standard Bible",
    ]);
    expect(getVersionAbbreviationCandidates("OEB")).toEqual([
      "OEB",
      "Open English Bible (US)",
    ]);
    expect(getVersionAbbreviationCandidates("OEB-CW")).toEqual([
      "OEB-CW",
      "Open English Bible (Commonwealth)",
    ]);
  });
});
