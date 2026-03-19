import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { db } from "../db/client.js";
import { verses, chapters, books, versions, languages } from "../db/schema.js";
import { eq, and, sql, ilike } from "drizzle-orm";
import { success, errorResponse, parsePagination } from "../lib/responses.js";
import { cacheControl } from "../middleware/cache.js";
import { PG_DICTIONARIES, getPgDictionary } from "../lib/pg-dictionaries.js";
import { SearchQuerySchema, ErrorSchema } from "../lib/openapi-schemas.js";

const ONE_HOUR = 3600;

const searchRouter = new OpenAPIHono();

const searchRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Search"],
  summary: "Full-text search verses",
  description: "Search Bible verses using full-text search (tsvector for supported languages, trigram fallback for others). Requires either 'version' or 'language' parameter.",
  request: {
    query: z.object({
      q: z.string().optional().openapi({ description: "Search query text", example: "love" }),
      version: z.string().optional().openapi({ description: "Version abbreviation", example: "KJV" }),
      language: z.string().optional().openapi({ description: "Language code", example: "eng" }),
      limit: z.string().optional().openapi({ description: "Max results (default: 20, max: 100)", example: "20" }),
      offset: z.string().optional().openapi({ description: "Result offset", example: "0" }),
    }),
  },
  responses: {
    200: {
      description: "Search results",
      content: {
        "application/json": {
          schema: z.object({ data: z.array(z.any()) }),
        },
      },
    },
    400: {
      description: "Missing required parameters",
      content: { "application/json": { schema: ErrorSchema } },
    },
    404: {
      description: "Version or language not found",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

searchRouter.openapi(searchRoute, async (c): Promise<any> => {
  const q = c.req.query("q");
  const versionParam = c.req.query("version");
  const languageParam = c.req.query("language");
  const limitParam = c.req.query("limit");
  const offsetParam = c.req.query("offset");

  if (!q || q.trim().length === 0) {
    return errorResponse(c, 400, "BAD_REQUEST", "Query parameter 'q' is required");
  }

  if (!versionParam && !languageParam) {
    return errorResponse(
      c,
      400,
      "BAD_REQUEST",
      "Either 'version' or 'language' query parameter is required"
    );
  }

  const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 20, 100) : 20;
  const offset = offsetParam ? parseInt(offsetParam, 10) || 0 : 0;

  let versionIds: string[] = [];
  let languageCode: string | null = null;

  if (versionParam) {
    const ver = await db
      .select({ id: versions.id })
      .from(versions)
      .where(eq(versions.abbreviation, versionParam));

    if (ver.length === 0) {
      return errorResponse(c, 404, "NOT_FOUND", `Version '${versionParam}' not found`);
    }
    versionIds = ver.map((v) => v.id);
  } else if (languageParam) {
    const lang = await db
      .select({ id: languages.id, code: languages.code })
      .from(languages)
      .where(eq(languages.code, languageParam))
      .limit(1);

    if (lang.length === 0) {
      return errorResponse(c, 404, "NOT_FOUND", `Language '${languageParam}' not found`);
    }

    languageCode = lang[0].code;

    const vers = await db
      .select({ id: versions.id })
      .from(versions)
      .where(eq(versions.languageId, lang[0].id));

    if (vers.length === 0) {
      return success(c, []);
    }
    versionIds = vers.map((v) => v.id);
  }

  // Determine search strategy based on language
  const dictName = languageCode
    ? getPgDictionary(languageCode)
    : versionParam
      ? await getDictionaryForVersion(versionParam)
      : "simple";

  const hasTsvector = dictName !== "simple";

  let results;

  // Format version IDs as a PG array literal: {uuid1,uuid2,...}
  const pgArray = `{${versionIds.join(",")}}`;

  if (hasTsvector) {
    // Use tsvector for languages with PG dictionaries
    results = await db.execute(sql`
      SELECT
        v.id,
        v.number AS verse_number,
        v.text,
        c.number AS chapter_number,
        b.name AS book_name,
        b.book_code,
        ver.abbreviation AS version_abbreviation,
        ver.license,
        CASE WHEN ver.license LIKE '%CC%' THEN ver.name || ' (' || COALESCE(ver.source_url, '') || ')' ELSE NULL END AS attribution,
        ts_rank(to_tsvector(${dictName}::regconfig, v.text), plainto_tsquery(${dictName}::regconfig, ${q})) AS rank
      FROM verses v
      JOIN chapters c ON v.chapter_id = c.id
      JOIN books b ON c.book_id = b.id
      JOIN versions ver ON b.version_id = ver.id
      WHERE b.version_id = ANY(${pgArray}::uuid[])
        AND to_tsvector(${dictName}::regconfig, v.text) @@ plainto_tsquery(${dictName}::regconfig, ${q})
      ORDER BY rank DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `);
  } else {
    // Use pg_trgm fallback for CJK/African languages
    results = await db.execute(sql`
      SELECT
        v.id,
        v.number AS verse_number,
        v.text,
        c.number AS chapter_number,
        b.name AS book_name,
        b.book_code,
        ver.abbreviation AS version_abbreviation,
        ver.license,
        CASE WHEN ver.license LIKE '%CC%' THEN ver.name || ' (' || COALESCE(ver.source_url, '') || ')' ELSE NULL END AS attribution,
        similarity(v.text, ${q}) AS rank
      FROM verses v
      JOIN chapters c ON v.chapter_id = c.id
      JOIN books b ON c.book_id = b.id
      JOIN versions ver ON b.version_id = ver.id
      WHERE b.version_id = ANY(${pgArray}::uuid[])
        AND v.text ILIKE ${"%" + q + "%"}
      ORDER BY rank DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `);
  }

  return success(c, results);
});

async function getDictionaryForVersion(abbreviation: string): Promise<string> {
  const ver = await db
    .select({ languageId: versions.languageId })
    .from(versions)
    .where(eq(versions.abbreviation, abbreviation))
    .limit(1);

  if (ver.length === 0) return "simple";

  const lang = await db
    .select({ code: languages.code })
    .from(languages)
    .where(eq(languages.id, ver[0].languageId))
    .limit(1);

  if (lang.length === 0) return "simple";

  return getPgDictionary(lang[0].code);
}

export { searchRouter };
