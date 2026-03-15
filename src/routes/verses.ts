import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { db } from "../db/client.js";
import { verses, chapters, books, versions, languages } from "../db/schema.js";
import { eq, and, sql, ilike } from "drizzle-orm";
import { success, errorResponse } from "../lib/responses.js";
import { cacheControl } from "../middleware/cache.js";
import { parseReference } from "../lib/reference-parser.js";
import { cleanVerseText } from "../lib/text-cleaner.js";
import { VerseSchema, VerseRefQuerySchema, ErrorSchema } from "../lib/openapi-schemas.js";

const THIRTY_DAYS = 2592000;

const versesRouter = new OpenAPIHono();

const verseRefRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Verses"],
  summary: "Lookup verses by reference",
  description: "Lookup verses by human-readable reference (e.g. 'John 3:16'). Supports parallel versions via comma-separated version codes.",
  request: {
    query: z.object({
      ref: z.string().optional().openapi({ description: "Bible reference (e.g. 'John 3:16')", example: "John 3:16" }),
      version: z.string().optional().openapi({ description: "Version abbreviation(s), comma-separated for parallel", example: "KJV" }),
    }),
  },
  responses: {
    200: {
      description: "Verse(s) matching the reference",
      content: {
        "application/json": {
          schema: z.object({ data: z.any() }),
        },
      },
    },
    400: {
      description: "Invalid reference or missing parameters",
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

  const parsed = parseReference(ref);
  if (!parsed) {
    return errorResponse(
      c,
      400,
      "BAD_REQUEST",
      `Invalid reference format: '${ref}'. Expected format: 'Book Chapter:Verse' (e.g., 'John 3:16' or 'John 3:16-18')`
    );
  }

  const versionCodes = versionParam.split(",").map((v) => v.trim());
  const isParallel = versionCodes.length > 1;

  const result: Record<string, unknown> = {};

  for (const versionCode of versionCodes) {
    const ver = await db
      .select()
      .from(versions)
      .where(eq(versions.abbreviation, versionCode))
      .limit(1);

    if (ver.length === 0) {
      result[versionCode] = { error: `Version '${versionCode}' not found` };
      continue;
    }

    const v = ver[0];

    // Find book by name (case-insensitive)
    const book = await db
      .select()
      .from(books)
      .where(
        and(
          eq(books.versionId, v.id),
          ilike(books.name, parsed.book)
        )
      )
      .limit(1);

    if (book.length === 0) {
      result[versionCode] = { error: `Book '${parsed.book}' not found in ${versionCode}` };
      continue;
    }

    const chapter = await db
      .select()
      .from(chapters)
      .where(
        and(
          eq(chapters.bookId, book[0].id),
          eq(chapters.number, parsed.chapter)
        )
      )
      .limit(1);

    if (chapter.length === 0) {
      result[versionCode] = { error: `Chapter ${parsed.chapter} not found in ${parsed.book}` };
      continue;
    }

    let verseQuery;
    if (parsed.verseEnd) {
      verseQuery = await db
        .select({
          id: verses.id,
          number: verses.number,
          text: verses.text,
        })
        .from(verses)
        .where(
          and(
            eq(verses.chapterId, chapter[0].id),
            sql`${verses.number} >= ${parsed.verseStart}`,
            sql`${verses.number} <= ${parsed.verseEnd}`
          )
        )
        .orderBy(verses.number);
    } else {
      verseQuery = await db
        .select({
          id: verses.id,
          number: verses.number,
          text: verses.text,
        })
        .from(verses)
        .where(
          and(
            eq(verses.chapterId, chapter[0].id),
            eq(verses.number, parsed.verseStart)
          )
        );
    }

    const attribution =
      v.license && v.license.includes("CC")
        ? `${v.name}${v.sourceUrl ? ` (${v.sourceUrl})` : ""}`
        : undefined;

    result[versionCode] = {
      reference: ref,
      version: versionCode,
      verses: verseQuery.map((v: any) => ({ ...v, text: cleanVerseText(v.text) })),
      license: v.license,
      ...(attribution ? { attribution } : {}),
    };
  }

  if (isParallel) {
    return success(c, { reference: ref, versions: result });
  }

  // Single version — return the result directly
  const singleResult = result[versionCodes[0]];
  return success(c, singleResult);
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
