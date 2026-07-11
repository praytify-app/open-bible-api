/**
 * eBible.org catalog fetcher.
 *
 * Parses the translations.csv from eBible.org and filters translations
 * by open-source-compatible licenses (PD, CC BY, CC BY-SA).
 */

export type LicenseType = "PD" | "CC_BY" | "CC_BY_SA" | "COPYRIGHTED_REDISTRIBUTABLE" | "OTHER";

export interface CatalogEntry {
  translationId: string;
  languageCode: string;
  languageName: string;
  languageNativeName: string;
  languageScript: string;
  languageDirection: string;
  abbreviation: string;
  name: string;
  license: string;
  licenseType: LicenseType;
  attribution: string;
  attributionUrl: string;
  sourceUrl: string;
}

const TRANSLATIONS_CSV_URL =
  "https://ebible.org/Scriptures/translations.csv";

/**
 * Classify a copyright/license string into a normalized license type.
 */
export function classifyLicense(license: string): LicenseType {
  const lower = license.toLowerCase();

  // Check for restrictive clauses first — these disqualify
  if (lower.includes("noderivatives") || lower.includes("no-derivatives") || lower.includes("no derivatives") || lower.includes("-nd")) {
    return "OTHER";
  }
  if (lower.includes("noncommercial") || lower.includes("non-commercial") || lower.includes("non commercial") || lower.includes("-nc")) {
    return "OTHER";
  }

  // Public Domain
  if (lower.includes("public domain")) {
    return "PD";
  }

  // CC BY-SA (check before CC BY since "CC BY-SA" contains "CC BY")
  if (
    lower.includes("share-alike") ||
    lower.includes("sharealike") ||
    lower.includes("share alike") ||
    lower.includes("cc by-sa") ||
    lower.includes("cc-by-sa")
  ) {
    return "CC_BY_SA";
  }

  // CC BY
  if (
    lower.includes("creative commons attribution") ||
    lower.includes("cc by") ||
    lower.includes("cc-by")
  ) {
    return "CC_BY";
  }

  if (lower.includes("proprietary")) {
    return "OTHER";
  }

  if (lower.includes("copyright")) {
    return "COPYRIGHTED_REDISTRIBUTABLE";
  }

  return "OTHER";
}

/**
 * Parse a single CSV line, handling quoted fields that may contain commas.
 */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        // Check for escaped quote (double quote)
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // skip the next quote
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }

  // Push the last field
  fields.push(current);

  return fields;
}

/**
 * Parse the eBible.org translations.csv content into CatalogEntry objects.
 *
 * Expected CSV columns (from eBible.org):
 * languageCode, translationId, languageName, languageNameInEnglish, dialect,
 * homeDomain, title, description, Redistributable, Copyright, UpdateDate,
 * publicationURL, OTbooks, OTchapters, OTverses, NTbooks, NTchapters,
 * NTverses, DCbooks, DCchapters, DCverses, FCBHID, Certified, inScript,
 * swordName, rodCode, textDirection, downloadable, font, shortTitle,
 * PODISBN, script, sourceDate
 */
export function parseCatalogCsv(csv: string): CatalogEntry[] {
  const lines = csv.split("\n").filter((line) => line.trim().length > 0);

  if (lines.length < 2) {
    return [];
  }

  // Parse header to get column indices
  const headers = parseCsvLine(lines[0]);
  const colIndex = new Map<string, number>();
  headers.forEach((h, i) => colIndex.set(h.trim(), i));

  const getCol = (name: string): number => colIndex.get(name) ?? -1;

  const entries: CatalogEntry[] = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    if (fields.length < 10) continue; // skip malformed lines

    const redistributable = fields[getCol("Redistributable")] ?? "";
    const downloadable = fields[getCol("downloadable")] ?? "";

    // Skip non-redistributable or non-downloadable entries
    if (redistributable.toLowerCase() !== "true") continue;
    if (downloadable.toLowerCase() !== "true") continue;

    const copyright = fields[getCol("Copyright")] ?? "";
    const languageCode = fields[getCol("languageCode")] ?? "";
    const translationId = fields[getCol("translationId")] ?? "";
    const languageNativeName = fields[getCol("languageName")] ?? "";
    const languageName = fields[getCol("languageNameInEnglish")] ?? "";
    const title = fields[getCol("title")] ?? "";
    const shortTitle = fields[getCol("shortTitle")] ?? "";
    const publicationURL = fields[getCol("publicationURL")] ?? "";
    const textDirection = fields[getCol("textDirection")] ?? "ltr";
    const script = fields[getCol("script")] ?? "";

    entries.push({
      translationId,
      languageCode,
      languageName,
      languageNativeName,
      languageScript: script,
      languageDirection: textDirection,
      abbreviation: deriveAbbreviation(translationId, shortTitle),
      name: title,
      license: copyright,
      licenseType: classifyLicense(copyright),
      attribution: copyright,
      attributionUrl: publicationURL,
      sourceUrl: `https://ebible.org/Scriptures/${translationId}_usfm.zip`,
    });
  }

  return entries;
}

/**
 * Well-known abbreviation overrides for common translations.
 * Maps eBible translationId → standard abbreviation.
 */
const KNOWN_ABBREVIATIONS: Record<string, string> = {
  engkjv: "KJV",
  "eng-asv": "ASV",
  engkjvcpb: "KJVA",
  engbsb: "BSB",
  engmsb: "MSB",
  engwebp: "WEB",
  engwebu: "WEBU",
  engwebpb: "WEBA",
  engwmb: "WMB",
  engwmbb: "WMBA",
  engoebcw: "OEB-CW",
  engoebcwl: "OEB-US",
  engoebus: "OEB",
  engBBE: "BBE",
  engDBY: "DBY",
  engLEBP: "LEB",
  engYLT: "YLT",
  engULB: "ULB",
  engUST: "UST",
  eng_ls: "LSV",
  engcover: "COVER",
  engfbv: "FBV",
  engrev: "REV",
  engtcent: "TCENT",
  engf35: "F35",
  engtfv: "TFV",
  spaRVG: "RVG",
  spablm: "BLM",
  fraLSG: "LSG",
  deuelo: "ELO",
  porARA: "ARA",
  porNAA: "NAA",
  rus_synod: "RST",
  arb_vd: "AVD",
  cmn_cu: "CUV",
  hin_irv: "IRVHIN",
  jpn_kougo: "KOUGO",
  kor_krv: "KRV",
  swh_ulb: "SWULB",
  yorBSN: "BSN",
  hau_bib: "HAUSA",
  ibo_bib: "IGBO",
};

/**
 * Derive a short abbreviation from the eBible translationId.
 *
 * Strategy:
 * 1. Check known overrides map
 * 2. Strip the language prefix (first 3 chars) and uppercase the remainder
 * 3. Fall back to translationId uppercased if too short
 */
/**
 * Scope markers shared by hundreds of unrelated translations ("acuNT" and
 * "akeNT" both strip to "NT"). Never distinctive enough to name one version.
 */
const GENERIC_SUFFIXES = new Set([
  "NT", "OT", "PS", "POR", "P", "PP", "NTP", "NTPS", "NTPO", "NTPSA",
]);

function deriveAbbreviation(translationId: string, shortTitle: string): string {
  // Check known overrides
  if (KNOWN_ABBREVIATIONS[translationId]) {
    return KNOWN_ABBREVIATIONS[translationId];
  }

  // If shortTitle is already short (≤ 10 chars, no spaces) and distinctive, use it
  if (shortTitle && shortTitle.length <= 10 && !shortTitle.includes(" ")) {
    const upper = shortTitle.toUpperCase();
    if (!GENERIC_SUFFIXES.has(upper)) {
      return upper;
    }
  }

  // Strip language prefix (e.g. "engkjv" → "kjv", "spaRVG" → "RVG")
  // eBible translationIds typically start with a 3-letter ISO code.
  // Generic or all-numeric suffixes ("NT", "2017") are rejected — they
  // repeat across languages and collide on the unique abbreviation index.
  if (translationId.length > 3) {
    const suffix = translationId.slice(3);
    const cleaned = suffix.replace(/[_-]/g, "").toUpperCase();
    if (
      cleaned.length >= 2 &&
      !GENERIC_SUFFIXES.has(cleaned) &&
      !/^\d+$/.test(cleaned)
    ) {
      return cleaned;
    }
  }

  // Language-qualified short title ("Waima NT") is distinctive per language
  if (shortTitle) {
    return shortTitle;
  }

  // Last resort: uppercase the full translationId
  return translationId.toUpperCase();
}

/**
 * Filter catalog entries to only redistributable translations.
 * Keeps: PD, CC_BY, CC_BY_SA, COPYRIGHTED_REDISTRIBUTABLE
 * Excludes: OTHER (NC, ND, proprietary, etc.)
 */
export function filterByLicense(entries: CatalogEntry[]): CatalogEntry[] {
  const excluded: Set<LicenseType> = new Set(["OTHER"]);
  return entries.filter((entry) => !excluded.has(entry.licenseType));
}

/**
 * Fetch the live eBible.org translations catalog and return parsed entries.
 */
export async function fetchCatalog(): Promise<CatalogEntry[]> {
  const response = await fetch(TRANSLATIONS_CSV_URL);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch eBible.org catalog: ${response.status} ${response.statusText}`
    );
  }
  const csv = await response.text();
  return parseCatalogCsv(csv);
}
