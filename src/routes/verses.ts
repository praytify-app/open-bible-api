import { createRoute, z } from "@hono/zod-openapi";
import { db } from "../db/client.js";
import { verses } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { success, errorResponse } from "../lib/responses.js";
import { cacheControl, CachePolicy } from "../middleware/cache.js";
import { MAX_REFERENCE_LENGTH, parseReference } from "../lib/reference-parser.js";
import { cleanVerseText } from "../lib/text-cleaner.js";
import { loadPassage, loadVersionsWithBooks, type PassageResult } from "../lib/passages.js";
import {
  VerseSchema,
  ErrorSchema,
  PassageSchema,
  ParallelPassageSchema,
} from "../lib/openapi-schemas.js";
import { createRouter } from "../lib/router.js";

// Each version costs a book-list lookup and a verse query, so the fan-out
// is bounded. Five covers side-by-side reading without letting one request
// turn into dozens of queries.
export const MAX_PARALLEL_VERSIONS = 5;

const versesRouter = createRouter();
versesRouter.use("*", cacheControl(CachePolicy.scripture));

const verseRefRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Verses"],
  summary: "Lookup verses by reference",
  description:
    "Lookup a passage by human-readable reference: 'John 3:16', 'John 3:16-18', 'John 3' (whole chapter), " +
    "'1 John 1:9', 'JHN 3:16', 'Jn 3:16', or the version's own book name. " +
    `Comma-separate up to ${MAX_PARALLEL_VERSIONS} version codes for a parallel view.`,
  request: {
    query: z.object({
      ref: z.string().optional().openapi({ description: `Bible reference, at most ${MAX_REFERENCE_LENGTH} characters`, example: "John 3:16" }),
      version: z.string().optional().openapi({ description: "Version abbreviation, or several comma-separated for parallel", example: "WEB" }),
    }),
  },
  responses: {
    200: {
      description: "A passage, or a parallel passage when several versions were requested",
      content: {
        "application/json": {
          schema: z.object({ data: z.union([PassageSchema, ParallelPassageSchema]) }),
        },
      },
    },
    400: {
      description: "Invalid reference or missing parameters",
      content: { "application/json": { schema: ErrorSchema } },
    },
    404: {
      description: "Version, book, chapter, or verse not found (single version only; parallel reports per version)",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

const getVerseRoute = createRoute({
  method: "get",
  path: "/{id}",
  tags: ["Verses"],
  summary: "Get a verse by ID",
  description: "Returns a single verse by its numeric ID.",
  request: {
    params: z.object({
      id: z.string().openapi({ description: "Verse numeric ID", example: "1" }),
    }),
  },
  responses: {
    200: {
      description: "Verse details",
      content: {
        "application/json": {
          schema: z.object({ data: VerseSchema }),
        },
      },
    },
    400: {
      description: "Invalid verse ID",
      content: { "application/json": { schema: ErrorSchema } },
    },
    404: {
      description: "Verse not found",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

// --- Handlers ---

versesRouter.openapi(verseRefRoute, async (c) => {
  const ref = c.req.query("ref");
  const versionParam = c.req.query("version");

  if (!ref) {
    return errorResponse(c, 400, "BAD_REQUEST", "Query parameter 'ref' is required");
  }

  if (!versionParam) {
    return errorResponse(c, 400, "BAD_REQUEST", "Query parameter 'version' is required");
  }

  if (ref.length > MAX_REFERENCE_LENGTH) {
    return errorResponse(c, 400, "BAD_REQUEST", `Reference must be at most ${MAX_REFERENCE_LENGTH} characters`);
  }

  const parsed = parseReference(ref);
  if (!parsed) {
    return errorResponse(
      c,
      400,
      "BAD_REQUEST",
      `Invalid reference format: '${ref}'. Expected 'Book Chapter', 'Book Chapter:Verse', or 'Book Chapter:Verse-Verse' (e.g. 'John 3', 'John 3:16', 'John 3:16-18')`
    );
  }

  const requested = versionParam.split(",").map((v) => v.trim()).filter(Boolean);
  const versionCodes = [...new Set(requested)];

  if (versionCodes.length === 0) {
    return errorResponse(c, 400, "BAD_REQUEST", "Query parameter 'version' is required");
  }

  if (versionCodes.length > MAX_PARALLEL_VERSIONS) {
    return errorResponse(
      c,
      400,
      "BAD_REQUEST",
      `At most ${MAX_PARALLEL_VERSIONS} versions can be compared in one request`
    );
  }

  const loaded = await loadVersionsWithBooks(versionCodes);
  const results: [string, PassageResult][] = await Promise.all(
    versionCodes.map(async (code): Promise<[string, PassageResult]> => {
      const entry = loaded.get(code);
      if (!entry) return [code, { ok: false, message: `Version '${code}' not found` }];
      return [code, await loadPassage(ref, parsed, entry)];
    })
  );

  // A repeated code ("KJV,KJV") still asked for the parallel shape.
  if (requested.length === 1) {
    const [, result] = results[0];
    if (!result.ok) return errorResponse(c, 404, "NOT_FOUND", result.message);
    return success(c, result.passage);
  }

  return success(c, {
    reference: ref,
    versions: Object.fromEntries(
      results.map(([code, result]) => [code, result.ok ? result.passage : { error: result.message }])
    ),
  });
});

versesRouter.openapi(getVerseRoute, async (c) => {
  const idParam = c.req.param("id");
  const id = parseInt(idParam, 10);

  if (isNaN(id)) {
    return errorResponse(c, 400, "BAD_REQUEST", "Verse ID must be a number");
  }

  const verse = await db
    .select({
      id: verses.id,
      number: verses.number,
      text: verses.text,
      chapterId: verses.chapterId,
    })
    .from(verses)
    .where(eq(verses.id, id))
    .limit(1);

  if (verse.length === 0) {
    return errorResponse(c, 404, "NOT_FOUND", `Verse '${id}' not found`);
  }

  return success(c, { ...verse[0], text: cleanVerseText(verse[0].text) });
});

export { versesRouter };
