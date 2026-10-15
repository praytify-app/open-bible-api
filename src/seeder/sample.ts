import type { CatalogEntry } from "./catalog.js";
import { importSingleTranslation, type BatchResult } from "./batch-runner.js";

/**
 * A small public-domain corpus for self-hosting, demos, and the gateway's
 * local end-to-end stack: two English versions and one right-to-left,
 * non-Latin version, so book-name resolution and RTL rendering are
 * exercised from day one.
 *
 * Entries are written out rather than read from the live eBible catalog so
 * the sample seeds offline from .cache/ebible and always gets the same
 * abbreviations. Each zip is downloaded from eBible.org only if it is not
 * already cached.
 */
export const SAMPLE_TRANSLATIONS: CatalogEntry[] = [
  {
    translationId: "engwebp",
    languageCode: "eng",
    languageName: "English",
    languageNativeName: "English",
    languageScript: "Latin",
    languageDirection: "ltr",
    abbreviation: "WEB",
    name: "World English Bible",
    license: "Public Domain",
    licenseType: "PD",
    attribution: "Public Domain. \"World English Bible\" is a trademark of eBible.org.",
    attributionUrl: "https://ebible.org/find/details.php?id=engwebp",
    sourceUrl: "https://ebible.org/Scriptures/engwebp_usfm.zip",
  },
  {
    // The 1769 standard text, protocanon only. Strong's tags in the source
    // are stripped by the parser and the read-time cleaner.
    translationId: "eng-kjv2006",
    languageCode: "eng",
    languageName: "English",
    languageNativeName: "English",
    languageScript: "Latin",
    languageDirection: "ltr",
    abbreviation: "KJV",
    name: "King James Version",
    license: "Public Domain",
    licenseType: "PD",
    attribution: "Public Domain",
    attributionUrl: "https://ebible.org/find/details.php?id=eng-kjv2006",
    sourceUrl: "https://ebible.org/Scriptures/eng-kjv2006_usfm.zip",
  },
  {
    translationId: "arb-vd",
    languageCode: "arb",
    languageName: "Arabic, Standard",
    languageNativeName: "العربية",
    languageScript: "Arabic",
    languageDirection: "rtl",
    abbreviation: "AVD",
    name: "Arabic Van Dyck Bible",
    license: "Public Domain",
    licenseType: "PD",
    attribution: "Public Domain",
    attributionUrl: "https://ebible.org/find/details.php?id=arb-vd",
    sourceUrl: "https://ebible.org/Scriptures/arb-vd_usfm.zip",
  },
];

/**
 * Import the sample translations one at a time. Already-imported versions
 * are skipped unless force is set. Uses importSingleTranslation directly so
 * the seed-all resume checkpoint in .cache/seed-progress.json is untouched.
 */
export async function seedSampleTranslations(
  force = false,
  log: (message: string) => void = console.log
): Promise<BatchResult[]> {
  const results: BatchResult[] = [];
  for (const entry of SAMPLE_TRANSLATIONS) {
    log(`Importing ${entry.abbreviation} (${entry.translationId})...`);
    const result = await importSingleTranslation(entry, force);
    results.push(result);
    if (result.status === "imported") log(`  imported ${result.verseCount} verses`);
    else if (result.status === "skipped") log(`  skipped: ${result.reason}`);
    else log(`  FAILED: ${result.error}`);
  }
  return results;
}
