import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { db } from "../db/client.js";
import { chapters, verses, books, versions, languages } from "../db/schema.js";
import { and, asc, eq, inArray } from "drizzle-orm";
import { success, errorResponse } from "../lib/responses.js";
import { cacheControl, CachePolicy } from "../middleware/cache.js";
import { getVersionAbbreviationCandidates } from "../lib/version-abbreviations.js";
import { cleanVerseText } from "../lib/text-cleaner.js";
import { toVersionMeta, versionMetaColumns } from "../lib/passages.js";
import { VerseSchema, ErrorSchema, ChapterMetaSchema } from "../lib/openapi-schemas.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cleanVerseRows(rows: { id: number; chapterId: string; number: number; text: string }[]) {
  return rows.map((r) => ({ ...r, text: cleanVerseText(r.text) }));
}

const chaptersRouter = new OpenAPIHono();
chaptersRouter.use("*", cacheControl(CachePolicy.scripture));

const versesByRefRoute = createRoute({
  method: "get",
  path: "/{version}/{bookCode}/{chapter}/verses",
  tags: ["Chapters"],
  summary: "Get verses by version/book/chapter",
  description:
    "All verses of one chapter, addressed by version abbreviation, USFM book code, and chapter number. " +
    "`meta` carries the book name and the version's license and attribution for display.",
  request: {
    params: z.object({
      version: z.string().openapi({ description: "Version abbreviation", example: "KJV" }),
      bookCode: z.string().openapi({ description: "USFM book code", example: "GEN" }),
      chapter: z.string().openapi({ description: "Chapter number", example: "1" }),
    }),
  },
  responses: {
    200: {
      description: "List of verses",
      content: {
        "application/json": {
          schema: z.object({ data: z.array(VerseSchema), meta: ChapterMetaSchema }),
        },
      },
    },
    400: {
      description: "Invalid chapter number",
      content: { "application/json": { schema: ErrorSchema } },
    },
    404: {
      description: "Version, book, or chapter not found",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

const versesByChapterIdRoute = createRoute({
  method: "get",
  path: "/{id}/verses",
  tags: ["Chapters"],
  summary: "Get verses by chapter ID",
  description: "Returns all verses for a chapter by its UUID.",
  request: {
    params: z.object({
      id: z.string().openapi({ description: "Chapter UUID" }),
    }),
  },
  responses: {
    200: {
      description: "List of verses",
      content: {
        "application/json": {
          schema: z.object({ data: z.array(VerseSchema) }),
        },
      },
    },
    404: {
      description: "Chapter not found",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

// --- Handlers ---

chaptersRouter.openapi(versesByRefRoute, async (c) => {
  const versionAbbr = c.req.param("version");
  const bookCode = c.req.param("bookCode").toUpperCase();
  const chapterNum = parseInt(c.req.param("chapter"), 10);

  if (isNaN(chapterNum) || chapterNum < 1) {
    return errorResponse(c, 400, "BAD_REQUEST", "Chapter must be a positive number");
  }

  // Query 1: the version and, via the join condition, its matching book.
  // A version row with a null book means the version exists but lacks it.
  const candidates = getVersionAbbreviationCandidates(versionAbbr);
  const found = await db
    .select({
      version: versionMetaColumns,
      bookId: books.id,
      bookName: books.name,
    })
    .from(versions)
    .leftJoin(languages, eq(versions.languageId, languages.id))
    .leftJoin(books, and(eq(books.versionId, versions.id), eq(books.bookCode, bookCode)))
    .where(inArray(versions.abbreviation, candidates));

  const match = candidates
    .map((abbr) => found.find((row) => row.version.abbreviation === abbr))
    .find(Boolean);

  if (!match) {
    return errorResponse(c, 404, "NOT_FOUND", `Version '${versionAbbr}' not found`);
  }
  if (!match.bookId || !match.bookName) {
    return errorResponse(c, 404, "NOT_FOUND", `Book '${bookCode}' not found in ${versionAbbr}`);
  }

  // Query 2: the chapter's verses through the (book_id, number) and
  // (chapter_id, number) unique indexes.
  const verseRows = await db
    .select({
      id: verses.id,
      chapterId: verses.chapterId,
      number: verses.number,
      text: verses.text,
    })
    .from(verses)
    .innerJoin(chapters, eq(verses.chapterId, chapters.id))
    .where(and(eq(chapters.bookId, match.bookId), eq(chapters.number, chapterNum)))
    .orderBy(asc(verses.number));

  if (verseRows.length === 0) {
    return errorResponse(c, 404, "NOT_FOUND", `Chapter ${chapterNum} not found in ${bookCode}`);
  }

  const version = toVersionMeta(match.version);
  return c.json(
    {
      data: cleanVerseRows(verseRows),
      meta: {
        version: version.abbreviation,
        versionName: version.name,
        bookCode,
        bookName: match.bookName,
        chapter: chapterNum,
        license: version.license,
        licenseType: version.licenseType,
        attribution: version.attribution,
        attributionUrl: version.attributionUrl,
        languageCode: version.languageCode,
        textDirection: version.textDirection,
      },
    },
    200
  );
});

chaptersRouter.openapi(versesByChapterIdRoute, async (c) => {
  const id = c.req.param("id");

  // A non-UUID would reach Postgres as an invalid cast and surface as a 500.
  if (!UUID.test(id)) {
    return errorResponse(c, 404, "NOT_FOUND", `Chapter '${id}' not found`);
  }

  const chapter = await db
    .select({ id: chapters.id })
    .from(chapters)
    .where(eq(chapters.id, id))
    .limit(1);

  if (chapter.length === 0) {
    return errorResponse(c, 404, "NOT_FOUND", `Chapter '${id}' not found`);
  }

  const verseRows = await db
    .select()
    .from(verses)
    .where(eq(verses.chapterId, id))
    .orderBy(verses.number);

  return success(c, cleanVerseRows(verseRows));
});

export { chaptersRouter };
