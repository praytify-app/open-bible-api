import { inArray, or, type SQL } from "drizzle-orm";
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

/** Match versions named by any of these params, by abbreviation (canonical or legacy) or code. */
export function versionParamsWhere(params: string[]): SQL {
  const abbreviations = [...new Set(params.flatMap(getVersionAbbreviationCandidates))];
  const sourceUrls = params.map(sourceUrlForCode).filter((url): url is string => url !== null);
  const byAbbreviation = inArray(versions.abbreviation, abbreviations);
  return sourceUrls.length ? (or(byAbbreviation, inArray(versions.sourceUrl, sourceUrls)) as SQL) : byAbbreviation;
}

export interface VersionKey {
  abbreviation: string;
  sourceUrl: string | null;
}

/**
 * The row a param names. Abbreviations win over codes, and a canonical
 * abbreviation over its legacy forms, so adding codes never changes which
 * version an existing URL resolves to.
 */
export function pickVersion<T>(rows: T[], param: string, key: (row: T) => VersionKey): T | undefined {
  for (const abbreviation of getVersionAbbreviationCandidates(param)) {
    const hit = rows.find((row) => key(row).abbreviation === abbreviation);
    if (hit) return hit;
  }
  const sourceUrl = sourceUrlForCode(param);
  return sourceUrl ? rows.find((row) => key(row).sourceUrl === sourceUrl) : undefined;
}
