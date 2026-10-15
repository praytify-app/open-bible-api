import { inArray, or, sql, type SQL } from "drizzle-orm";
import { versions } from "../db/schema.js";
import { getVersionAbbreviationCandidates } from "./version-abbreviations.js";

/**
 * Version codes.
 *
 * Abbreviations in an imported corpus are whatever the source called the
 * translation: often a full title with spaces, sometimes a slash, which makes
 * them awkward or impossible in a URL path. Every eBible import records its
 * source as https://ebible.org/Scriptures/<translationId>_usfm.zip, and that
 * translation id is unique, stable, and URL-safe. It is exposed as `code` and
 * accepted wherever a version abbreviation is, derived from source_url so no
 * data migration is needed. Versions from other sources have no code.
 *
 * Matching ignores case (`kjv`, `ENGWEBP`), because clients normalize case
 * and people type it either way, but an exact-case match always wins.
 */
const EBIBLE_SOURCE = /^https:\/\/ebible\.org\/Scriptures\/([A-Za-z0-9_-]+)_usfm\.zip$/;
const CODE = /^[A-Za-z0-9_-]{2,64}$/;

export function versionCode(sourceUrl: string | null | undefined): string | null {
  return sourceUrl ? (EBIBLE_SOURCE.exec(sourceUrl)?.[1] ?? null) : null;
}

/** The source_url a version with this code has, or null when the param cannot be a code. */
export function sourceUrlForCode(param: string): string | null {
  return CODE.test(param) ? `https://ebible.org/Scriptures/${param}_usfm.zip` : null;
}

/** Abbreviations a param may mean: itself and its legacy forms, also looked up upper-cased (`asv`). */
function abbreviationCandidates(param: string): string[] {
  return [...new Set([...getVersionAbbreviationCandidates(param), ...getVersionAbbreviationCandidates(param.toUpperCase())])];
}

const lowered = (values: string[]) => [...new Set(values.map((v) => v.toLowerCase()))];

/** Match versions named by any of these params, by abbreviation (canonical or legacy) or code, ignoring case. */
export function versionParamsWhere(params: string[]): SQL {
  const abbreviations = lowered(params.flatMap(abbreviationCandidates));
  const sourceUrls = lowered(params.map(sourceUrlForCode).filter((url): url is string => url !== null));
  const byAbbreviation = inArray(sql`lower(${versions.abbreviation})`, abbreviations);
  return sourceUrls.length
    ? (or(byAbbreviation, inArray(sql`lower(${versions.sourceUrl})`, sourceUrls)) as SQL)
    : byAbbreviation;
}

export interface VersionKey {
  abbreviation: string;
  sourceUrl: string | null;
}

/**
 * The row a param names. Abbreviations win over codes, an exact-case match
 * over a case-insensitive one, and a canonical abbreviation over its legacy
 * forms, so neither codes nor case-folding change which version an existing
 * URL resolves to.
 */
export function pickVersion<T>(rows: T[], param: string, key: (row: T) => VersionKey): T | undefined {
  const sameCase = (a: string | null, b: string) => a === b;
  const anyCase = (a: string | null, b: string) => typeof a === "string" && a.toLowerCase() === b.toLowerCase();
  const candidates = abbreviationCandidates(param);
  const sourceUrl = sourceUrlForCode(param);
  for (const matches of [sameCase, anyCase]) {
    for (const abbreviation of candidates) {
      const hit = rows.find((row) => matches(key(row).abbreviation, abbreviation));
      if (hit) return hit;
    }
  }
  if (!sourceUrl) return undefined;
  return (
    rows.find((row) => sameCase(key(row).sourceUrl, sourceUrl)) ??
    rows.find((row) => anyCase(key(row).sourceUrl, sourceUrl))
  );
}

/** Whether a row's abbreviation is one the param names, in any case. */
export function abbreviationMatches(abbreviation: string, param: string): boolean {
  const lower = abbreviation.toLowerCase();
  return abbreviationCandidates(param).some((c) => c.toLowerCase() === lower);
}
