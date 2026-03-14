import { Hono } from "hono";
import { db } from "../db/client.js";
import { chapters, verses, books, versions } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { success, errorResponse } from "../lib/responses.js";
import { cacheControl } from "../middleware/cache.js";
import { cleanVerseText } from "../lib/text-cleaner.js";
import { isApiBibleVersion } from "../lib/api-bible-config.js";
import { fetchApiBibleVerses } from "../lib/api-bible.js";

const THIRTY_DAYS = 2592000;

function cleanVerseRows(rows: { id: number; chapterId: string; number: number; text: string }[]) {
  return rows.map((r) => ({ ...r, text: cleanVerseText(r.text) }));
}

const chaptersRouter = new Hono();

// Lookup verses by version/bookCode/chapter (e.g. /KJV/GEN/2/verses)
chaptersRouter.get(
  "/:version/:bookCode/:chapter/verses",
  cacheControl(THIRTY_DAYS),
  async (c) => {
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
  }
);

// List verses for a chapter by ID
chaptersRouter.get("/:id/verses", cacheControl(THIRTY_DAYS), async (c) => {
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
