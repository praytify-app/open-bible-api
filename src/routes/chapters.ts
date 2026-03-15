import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { db } from "../db/client.js";
import { chapters, verses, books, versions } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { success, errorResponse } from "../lib/responses.js";
import { cacheControl } from "../middleware/cache.js";
import { cleanVerseText } from "../lib/text-cleaner.js";
import { isApiBibleVersion } from "../lib/api-bible-config.js";
import { fetchApiBibleVerses } from "../lib/api-bible.js";
import { VerseSchema, ErrorSchema } from "../lib/openapi-schemas.js";

const THIRTY_DAYS = 2592000;

function cleanVerseRows(rows: { id: number; chapterId: string; number: number; text: string }[]) {
  return rows.map((r) => ({ ...r, text: cleanVerseText(r.text) }));
}

const chaptersRouter = new OpenAPIHono();

const versesByRefRoute = createRoute({
  method: "get",
  path: "/{version}/{bookCode}/{chapter}/verses",
  tags: ["Chapters"],
  summary: "Get verses by version/book/chapter",
  description: "Lookup verses by version abbreviation, book code, and chapter number. Supports API Bible proxy for copyrighted versions.",
  request: {
    params: z.object({
      version: z.string().openapi({ description: "Version abbreviation", example: "KJV" }),
      bookCode: z.string().openapi({ description: "Book code", example: "GEN" }),
      chapter: z.string().openapi({ description: "Chapter number", example: "1" }),
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
  const bookCode = c.req.param("bookCode");
  const chapter = c.req.param("chapter");
  const chapterNum = parseInt(chapter, 10);

  if (isNaN(chapterNum)) {
    return errorResponse(c, 400, "BAD_REQUEST", "Chapter must be a number");
  }

  // --- api.bible proxy (copyrighted versions) ---
  if (isApiBibleVersion(versionAbbr)) {
    try {
      const proxyVerses = await fetchApiBibleVerses(versionAbbr, bookCode, chapterNum);
      c.header("Cache-Control", "no-store");
      return c.json({ data: proxyVerses });
    } catch (err) {
      const message = err instanceof Error ? err.message : "api.bible proxy error";
      return c.json({ error: message }, 502);
    }
  }

  // Find the version
  const ver = await db
    .select({ id: versions.id })
    .from(versions)
    .where(eq(versions.abbreviation, versionAbbr))
    .limit(1);

  if (ver.length === 0) {
    return errorResponse(
      c,
      404,
      "NOT_FOUND",
      `Version '${versionAbbr}' not found`
    );
  }

  // Find the book
  const book = await db
    .select({ id: books.id })
    .from(books)
    .where(
      and(eq(books.versionId, ver[0].id), eq(books.bookCode, bookCode))
    )
    .limit(1);

  if (book.length === 0) {
    return errorResponse(
      c,
      404,
      "NOT_FOUND",
      `Book '${bookCode}' not found in ${versionAbbr}`
    );
  }

  // Find the chapter
  const chapterRow = await db
    .select({ id: chapters.id })
    .from(chapters)
    .where(
      and(eq(chapters.bookId, book[0].id), eq(chapters.number, chapterNum))
    )
    .limit(1);

  if (chapterRow.length === 0) {
    return errorResponse(
      c,
      404,
      "NOT_FOUND",
      `Chapter ${chapterNum} not found in ${bookCode}`
    );
  }

  const verseRows = await db
    .select()
    .from(verses)
    .where(eq(verses.chapterId, chapterRow[0].id))
    .orderBy(verses.number);

  return success(c, cleanVerseRows(verseRows));
});

chaptersRouter.openapi(versesByChapterIdRoute, async (c) => {
  const id = c.req.param("id");

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
