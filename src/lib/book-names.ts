/**
 * Book-name resolution for human references.
 *
 * Lookup order, per the gateway contract:
 *   1. USFM book code ("JHN", "1JN"), case-insensitive.
 *   2. The version's own localized book name, compared case- and
 *      accent-insensitively ("Évangile selon Jean", "إنجيل يوحنا").
 *   3. Common English names and abbreviations mapped to codes ("Jn",
 *      "Psalm", "1 Cor"), so English references work in every version.
 */

export interface ResolvableBook {
  bookCode: string;
  name: string;
}

/** English names and abbreviations per USFM code, written as their normalized keys. */
const ENGLISH_ALIASES: Record<string, string[]> = {
  GEN: ["genesis", "gen", "ge", "gn"],
  EXO: ["exodus", "exod", "exo", "ex"],
  LEV: ["leviticus", "lev", "le", "lv"],
  NUM: ["numbers", "num", "nu", "nm", "nb"],
  DEU: ["deuteronomy", "deut", "deu", "de", "dt"],
  JOS: ["joshua", "josh", "jos", "jsh"],
  JDG: ["judges", "judg", "jdg", "jg", "jdgs"],
  RUT: ["ruth", "rut", "ru", "rth"],
  "1SA": ["1samuel", "1sam", "1sa", "1sm"],
  "2SA": ["2samuel", "2sam", "2sa", "2sm"],
  "1KI": ["1kings", "1kgs", "1ki", "1kin", "1kg"],
  "2KI": ["2kings", "2kgs", "2ki", "2kin", "2kg"],
  "1CH": ["1chronicles", "1chron", "1chr", "1ch"],
  "2CH": ["2chronicles", "2chron", "2chr", "2ch"],
  EZR: ["ezra", "ezr"],
  NEH: ["nehemiah", "neh", "ne"],
  EST: ["esther", "esth", "est", "es"],
  JOB: ["job", "jb"],
  PSA: ["psalms", "psalm", "ps", "psa", "pss", "psm"],
  PRO: ["proverbs", "prov", "pro", "prv", "pr"],
  ECC: ["ecclesiastes", "eccl", "eccles", "ecc", "ec", "qoheleth"],
  SNG: ["songofsolomon", "songofsongs", "songofsol", "song", "sos", "sng", "canticles", "cant"],
  ISA: ["isaiah", "isa", "is"],
  JER: ["jeremiah", "jer", "je", "jr"],
  LAM: ["lamentations", "lam", "la"],
  EZK: ["ezekiel", "ezek", "eze", "ezk"],
  DAN: ["daniel", "dan", "da", "dn"],
  HOS: ["hosea", "hos", "ho"],
  JOL: ["joel", "jol", "jl"],
  AMO: ["amos", "amo", "am"],
  OBA: ["obadiah", "obad", "oba", "ob"],
  JON: ["jonah", "jon", "jnh"],
  MIC: ["micah", "mic", "mc"],
  NAM: ["nahum", "nah", "nam", "na"],
  HAB: ["habakkuk", "hab", "hb"],
  ZEP: ["zephaniah", "zeph", "zep", "zp"],
  HAG: ["haggai", "hag", "hg"],
  ZEC: ["zechariah", "zech", "zec", "zc"],
  MAL: ["malachi", "mal", "ml"],
  MAT: ["matthew", "matt", "mat", "mt"],
  MRK: ["mark", "mrk", "mar", "mk", "mr"],
  LUK: ["luke", "luk", "lk"],
  JHN: ["john", "jhn", "jn", "joh"],
  ACT: ["acts", "act", "ac"],
  ROM: ["romans", "rom", "ro", "rm"],
  "1CO": ["1corinthians", "1cor", "1co"],
  "2CO": ["2corinthians", "2cor", "2co"],
  GAL: ["galatians", "gal", "ga"],
  EPH: ["ephesians", "ephes", "eph"],
  PHP: ["philippians", "phil", "php", "pp"],
  COL: ["colossians", "col"],
  "1TH": ["1thessalonians", "1thess", "1thes", "1th"],
  "2TH": ["2thessalonians", "2thess", "2thes", "2th"],
  "1TI": ["1timothy", "1tim", "1ti", "1tm"],
  "2TI": ["2timothy", "2tim", "2ti", "2tm"],
  TIT: ["titus", "tit", "ti"],
  PHM: ["philemon", "philem", "phm", "phlm"],
  HEB: ["hebrews", "heb"],
  JAS: ["james", "jas", "jam", "jm"],
  "1PE": ["1peter", "1pet", "1pe", "1pt"],
  "2PE": ["2peter", "2pet", "2pe", "2pt"],
  "1JN": ["1john", "1jn", "1jhn", "1jo", "1joh"],
  "2JN": ["2john", "2jn", "2jhn", "2jo", "2joh"],
  "3JN": ["3john", "3jn", "3jhn", "3jo", "3joh"],
  JUD: ["jude", "jud", "jd"],
  REV: ["revelation", "revelations", "rev", "re", "rv", "apocalypse"],
  TOB: ["tobit", "tob"],
  JDT: ["judith", "jdt", "jdth"],
  WIS: ["wisdom", "wisdomofsolomon", "wis"],
  SIR: ["sirach", "ecclesiasticus", "sir"],
  BAR: ["baruch", "bar"],
  "1MA": ["1maccabees", "1macc", "1mac", "1ma"],
  "2MA": ["2maccabees", "2macc", "2mac", "2ma"],
};

const ALIAS_TO_CODE = new Map<string, string>(
  Object.entries(ENGLISH_ALIASES).flatMap(([code, aliases]) =>
    aliases.map((alias) => [alias, code] as [string, string])
  )
);

// "I John", "First John", "1st John". Requires a following space so
// "Isaiah" is never read as "1saiah".
const ORDINAL_PREFIX = /^(iii|ii|i|first|second|third|1st|2nd|3rd)\s+/;
const ORDINALS: Record<string, string> = {
  i: "1", first: "1", "1st": "1",
  ii: "2", second: "2", "2nd": "2",
  iii: "3", third: "3", "3rd": "3",
};

// USFM codes are three characters: "JHN", or a digit and two letters, "1JN".
const USFM_CODE = /^(?:[1-4][a-z0-9]{2}|[a-z]{3})$/;

/**
 * Comparison key for a book name: lowercase, accents and other combining
 * marks removed (which also folds Arabic harakat and hamza-carrying alefs),
 * ordinal prefixes as digits, and spaces and punctuation dropped.
 */
export function normalizeBookKey(name: string): string {
  const folded = name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/ٱ/g, "ا") // alef wasla, which has no decomposition
    .toLowerCase()
    .trim();
  return folded
    .replace(ORDINAL_PREFIX, (_, ordinal: string) => ORDINALS[ordinal])
    .replace(/[\s.'’-]+/g, "");
}

/** The USFM code an English name or abbreviation refers to, if any. */
export function englishAliasToCode(name: string): string | undefined {
  return ALIAS_TO_CODE.get(normalizeBookKey(name));
}

export function resolveBook<T extends ResolvableBook>(query: string, books: T[]): T | undefined {
  const key = normalizeBookKey(query);
  if (!key) return undefined;

  if (USFM_CODE.test(key)) {
    const code = key.toUpperCase();
    const byCode = books.find((b) => b.bookCode.toUpperCase() === code);
    if (byCode) return byCode;
  }

  const byName = books.find((b) => normalizeBookKey(b.name) === key);
  if (byName) return byName;

  const aliasCode = ALIAS_TO_CODE.get(key);
  if (aliasCode) return books.find((b) => b.bookCode.toUpperCase() === aliasCode);

  return undefined;
}
