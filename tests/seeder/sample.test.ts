import { describe, it, expect, vi } from "vitest";

const importSingleTranslation = vi.hoisted(() =>
  vi.fn(async (entry: { translationId: string }) => ({
    translationId: entry.translationId,
    status: "imported" as const,
    verseCount: 31_000,
  }))
);
const runBatchImport = vi.hoisted(() => vi.fn());

vi.mock("../../src/seeder/batch-runner.js", () => ({ importSingleTranslation, runBatchImport }));

import { SAMPLE_TRANSLATIONS, seedSampleTranslations } from "../../src/seeder/sample.js";

describe("sample corpus", () => {
  it("is WEB, KJV, and the Arabic Van Dyck, all public domain", () => {
    expect(SAMPLE_TRANSLATIONS.map((t) => [t.translationId, t.abbreviation])).toEqual([
      ["engwebp", "WEB"],
      ["eng-kjv2006", "KJV"],
      ["arb-vd", "AVD"],
    ]);
    expect(SAMPLE_TRANSLATIONS.every((t) => t.licenseType === "PD")).toBe(true);
  });

  it("includes a right-to-left version", () => {
    expect(SAMPLE_TRANSLATIONS.some((t) => t.languageDirection === "rtl")).toBe(true);
  });

  it("uses the eBible zip URL the importer matches existing versions on", () => {
    for (const t of SAMPLE_TRANSLATIONS) {
      expect(t.sourceUrl).toBe(`https://ebible.org/Scriptures/${t.translationId}_usfm.zip`);
    }
  });

  it("imports each translation directly, leaving the seed-all checkpoint alone", async () => {
    const results = await seedSampleTranslations(false, () => {});
    expect(results.map((r) => r.status)).toEqual(["imported", "imported", "imported"]);
    expect(importSingleTranslation).toHaveBeenCalledTimes(3);
    expect(importSingleTranslation.mock.calls.every(([, force]) => force === false)).toBe(true);
    expect(runBatchImport).not.toHaveBeenCalled();
  });
});
