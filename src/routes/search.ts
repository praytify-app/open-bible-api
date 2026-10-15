import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { db } from "../db/client.js";
import { languages, versions } from "../db/schema.js";
import { and, eq, gt, inArray, sql, type SQL } from "drizzle-orm";
import { success, errorResponse } from "../lib/responses.js";
import { versionParamsWhere } from "../lib/version-lookup.js";
import { cacheControl, CachePolicy } from "../middleware/cache.js";
import { getPgDictionary } from "../lib/pg-dictionaries.js";
import { cleanVerseText } from "../lib/text-cleaner.js";
import {
  canonicalizeVersionAbbreviation,
  getVersionAbbreviationCandidates,
} from "../lib/version-abbreviations.js";
import { ErrorSchema, SearchResultSchema } from "../lib/openapi-schemas.js";

export const SEARCH_LIMITS = {
  defaultLimit: 20,
  maxLimit: 100,
  // Deep offsets make Postgres rank and discard every earlier match.
  maxOffset: 1000,
  minQueryLength: 2,
  maxQueryLength: 200,
} as const;

/** Paging that can never reach Postgres as a negative or unbounded value. */
export function clampSearchPaging(limitParam?: string, offsetParam?: string) {
  const limit = Number(limitParam);
  const offset = Number(offsetParam);
  return {
    limit:
      limitParam && Number.isInteger(limit) && limit >= 1
        ? Math.min(limit, SEARCH_LIMITS.maxLimit)
        : SEARCH_LIMITS.defaultLimit,
    offset:
      offsetParam && Number.isInteger(offset) && offset >= 0
        ? Math.min(offset, SEARCH_LIMITS.maxOffset)
        : 0,
  };
}

/** Escape LIKE metacharacters so user input matches literally ('%' is not "everything"). */
export function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

const searchRouter = new OpenAPIHono();
searchRouter.use("*", cacheControl(CachePolicy.search));

const searchRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Search"],
  summary: "Full-text search verses",
  description:
    "Search verses with stemmed full-text search where Postgres has a dictionary for the language, and a literal " +
    "substring match ranked by trigram similarity otherwise. Requires `version` or `language`. Results carry " +
    "camelCase fields; the snake_case duplicates are kept for older clients and will be removed in a future major version.",
  request: {
    query: z.object({
      q: z.string().optional().openapi({
        description: `Search text, ${SEARCH_LIMITS.minQueryLength}-${SEARCH_LIMITS.maxQueryLength} characters`,
        example: "love",
      }),
      version: z.string().optional().openapi({ description: "Version abbreviation", example: "KJV" }),
      language: z.string().optional().openapi({ description: "Language code", example: "eng" }),
      limit: z.string().optional().openapi({ description: "Max results, 1-100 (default 20)", example: "20" }),
      offset: z.string().optional().openapi({ description: "Result offset, 0-1000 (default 0)", example: "0" }),
    }),
  },
  responses: {
    200: {
      description: "Search results, best match first",
      content: {
        "application/json": {
          schema: z.object({ data: z.array(SearchResultSchema) }),
        },
      },
    },
    400: {
      description: "Missing or invalid parameters",
      content: { "application/json": { schema: ErrorSchema } },
    },
    404: {
      description: "Version or language not found",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

interface SearchRow {
  id: number;
  verse_number: number;
  text: string;
  chapter_number: number;
  book_name: string;
  book_code: string;
  version_abbreviation: string;
  license: string | null;
  attribution: string | null;
  attribution_url: string | null;
  rank: number;
}

/**
 * Resolve the search scope in one query: the version ids and the language
 * code that picks the text-search dictionary.
 */
async function resolveScope(
  versionParam: string | undefined,
  languageParam: string | undefined
): Promise<{ versionIds: string[]; languageCode: string | null } | null> {
  if (versionParam) {
    const found = await db
      .select({ id: versions.id, languageCode: languages.code, abbreviation: versions.abbreviation })
      .from(versions)
      .leftJoin(languages, eq(versions.languageId, languages.id))
      .where(versionParamsWhere([versionParam]));
    // Every version an abbreviation names (canonical and legacy rows alike);
    // a code is only consulted when no abbreviation matches.
    const candidates = getVersionAbbreviationCandidates(versionParam);
    const byAbbreviation = found.filter((r) => candidates.includes(r.abbreviation));
    const rows = byAbbreviation.length > 0 ? byAbbreviation : found;
    if (rows.length === 0) return null;
    return { versionIds: rows.map((r) => r.id), languageCode: rows[0].languageCode };
  }

  // LEFT JOIN so "no such language" (no rows) differs from "no seeded versions" (null id).
  const rows = await db
    .select({ code: languages.code, versionId: versions.id })
    .from(languages)
    .leftJoin(versions, and(eq(versions.languageId, languages.id), gt(versions.verseCount, 0)))
    .where(eq(languages.code, languageParam!));
  if (rows.length === 0) return null;
  return {
    versionIds: rows.flatMap((r) => (r.versionId ? [r.versionId] : [])),
    languageCode: rows[0].code,
  };
}

export interface SearchQueryInput {
  dictName: string;
  versionIds: string[];
  q: string;
  limit: number;
  offset: number;
}

/**
 * The search statement. Two shapes return the same rows in the same order;
 * they differ in which index Postgres starts from.
 *
 * Scope first: the scope's chapter ids are collected once, then only verses
 * in those chapters are matched and ranked. Cost grows with the scope (about
 * 31,000 verses per version), so it is bounded whatever the query.
 *
 * Index first: a plain join filtered by version. The planner starts from the
 * GIN index, so cost grows with matches across the whole catalog, or it
 * repeats the GIN scan once per chapter in a nested loop.
 *
 * Measured on the full 14.8M-verse corpus (docs/PERFORMANCE.md in the
 * gateway repo): index first took "lord" in KJV from 2 s to 12 s as more
 * versions were vectorized, common words on the trigram path from 4 s to the
 * 15 s timeout, and a two-character Chinese query across six versions 40 s.
 * Scope first answered the same queries in 0.05 to 0.7 s with a warm cache,
 * and at most 3.7 s cold. Index first still wins for stemmed search across a
 * language's several versions, so it is kept for that case alone.
 */
export function buildSearchQuery({ dictName, versionIds, q, limit, offset }: SearchQueryInput): SQL {
  const ids = `{${versionIds.join(",")}}`;
  const stemmed = dictName !== "simple";
  const match = stemmed
    ? sql`v.search_vector @@ plainto_tsquery(${dictName}::regconfig, ${q})`
    : sql`v.text ILIKE ${"%" + escapeLikePattern(q) + "%"} ESCAPE '\\'`;
  const rank = stemmed
    ? sql`ts_rank(v.search_vector, plainto_tsquery(${dictName}::regconfig, ${q}))`
    : sql`similarity(v.text, ${q})`;

  // v.id breaks rank ties so offset pagination is stable between pages.
  if (stemmed && versionIds.length > 1) {
    return sql`
      SELECT v.id, v.number AS verse_number, v.text, c.number AS chapter_number,
        b.name AS book_name, b.book_code, ver.abbreviation AS version_abbreviation,
        ver.license, ver.attribution, ver.attribution_url, ${rank} AS rank
      FROM verses v
      JOIN chapters c ON v.chapter_id = c.id
      JOIN books b ON c.book_id = b.id
      JOIN versions ver ON b.version_id = ver.id
      WHERE b.version_id = ANY(${ids}::uuid[]) AND ${match}
      ORDER BY rank DESC, v.id
      LIMIT ${limit} OFFSET ${offset}
    `;
  }

  // Every verse has exactly one chapter, book, and version, so joining after
  // the LIMIT returns the same rows as joining before it.
  return sql`
    SELECT m.id, m.number AS verse_number, m.text, c.number AS chapter_number,
      b.name AS book_name, b.book_code, ver.abbreviation AS version_abbreviation,
      ver.license, ver.attribution, ver.attribution_url, m.rank
    FROM (
      SELECT v.id, v.number, v.text, v.chapter_id, ${rank} AS rank
      FROM verses v
      WHERE v.chapter_id = ANY (ARRAY(
          SELECT c.id FROM chapters c JOIN books b ON c.book_id = b.id
          WHERE b.version_id = ANY(${ids}::uuid[])))
        AND ${match}
      ORDER BY rank DESC, v.id
      LIMIT ${limit} OFFSET ${offset}
    ) m
    JOIN chapters c ON c.id = m.chapter_id
    JOIN books b ON b.id = c.book_id
    JOIN versions ver ON ver.id = b.version_id
    ORDER BY m.rank DESC, m.id
  `;
}

searchRouter.openapi(searchRoute, async (c) => {
  const q = c.req.query("q")?.trim();
  const versionParam = c.req.query("version")?.trim() || undefined;
  const languageParam = c.req.query("language")?.trim() || undefined;

  if (!q) {
    return errorResponse(c, 400, "BAD_REQUEST", "Query parameter 'q' is required");
  }

  if (q.length < SEARCH_LIMITS.minQueryLength || q.length > SEARCH_LIMITS.maxQueryLength) {
    return errorResponse(
      c,
      400,
      "BAD_REQUEST",
      `Query parameter 'q' must be ${SEARCH_LIMITS.minQueryLength}-${SEARCH_LIMITS.maxQueryLength} characters`
    );
  }

  if (!versionParam && !languageParam) {
    return errorResponse(
      c,
      400,
      "BAD_REQUEST",
      "Either 'version' or 'language' query parameter is required"
    );
  }

  const { limit, offset } = clampSearchPaging(c.req.query("limit"), c.req.query("offset"));

  const scope = await resolveScope(versionParam, languageParam);
  if (!scope) {
    return versionParam
      ? errorResponse(c, 404, "NOT_FOUND", `Version '${versionParam}' not found`)
      : errorResponse(c, 404, "NOT_FOUND", `Language '${languageParam}' not found`);
  }
  if (scope.versionIds.length === 0) {
    return success(c, []);
  }

  const rows = (await db.execute(
    buildSearchQuery({
      dictName: getPgDictionary(scope.languageCode ?? ""),
      versionIds: scope.versionIds,
      q,
      limit,
      offset,
    })
  )) as unknown as SearchRow[];

  return success(
    c,
    rows.map((row) => {
      const versionAbbreviation = canonicalizeVersionAbbreviation(row.version_abbreviation);
      const text = cleanVerseText(row.text);
      const rank = Number(row.rank);
      return {
        id: Number(row.id),
        text,
        verseNumber: row.verse_number,
        chapterNumber: row.chapter_number,
        bookName: row.book_name,
        bookCode: row.book_code,
        versionAbbreviation,
        license: row.license,
        attribution: row.attribution,
        attributionUrl: row.attribution_url,
        rank,
        // Deprecated snake_case duplicates; Praytify's server still reads them.
        verse_number: row.verse_number,
        chapter_number: row.chapter_number,
        book_name: row.book_name,
        book_code: row.book_code,
        version_abbreviation: versionAbbreviation,
      };
    })
  );
});

export { searchRouter };
