import { Hono } from "hono";
import { db } from "../db/client.js";
import { versions, languages, books, chapters, verses } from "../db/schema.js";
import { eq, count, sql, and } from "drizzle-orm";
import { success, errorResponse, parsePagination } from "../lib/responses.js";
import { cacheControl } from "../middleware/cache.js";

const TWENTY_FOUR_HOURS = 86400;
const SEVEN_DAYS = 604800;
const THIRTY_DAYS = 2592000;

const versionsRouter = new Hono();

// List versions with pagination, optional language filter
versionsRouter.get("/", cacheControl(TWENTY_FOUR_HOURS), async (c) => {
  const { page, limit, offset } = parsePagination(c);
  const languageFilter = c.req.query("language");

  let whereClause;
  if (languageFilter) {
    const lang = await db
      .select({ id: languages.id })
      .from(languages)
      .where(eq(languages.code, languageFilter))
      .limit(1);

    if (lang.length === 0) {
      return success(c, [], { page, limit, total: 0, totalPages: 0 });
    }
    whereClause = eq(versions.languageId, lang[0].id);
  }

  const [rows, totalResult] = await Promise.all([
    db
      .select({
        id: versions.id,
        abbreviation: versions.abbreviation,
        name: versions.name,
        description: versions.description,
        license: versions.license,
        sourceUrl: versions.sourceUrl,
        canonType: versions.canonType,
        verseCount: versions.verseCount,
        languageId: versions.languageId,
        createdAt: versions.createdAt,
      })
      .from(versions)
      .where(whereClause)
      .orderBy(versions.name)
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(versions)
      .where(whereClause),
  ]);

  const total = totalResult[0]?.total ?? 0;

  return success(c, rows, {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
});

// Single version
versionsRouter.get("/:id", cacheControl(TWENTY_FOUR_HOURS), async (c) => {
  const id = c.req.param("id");

  const version = await db
    .select()
    .from(versions)
    .where(eq(versions.id, id))
    .limit(1);

  if (version.length === 0) {
    return errorResponse(c, 404, "NOT_FOUND", `Version '${id}' not found`);
  }

  return success(c, version[0]);
});

// Books in a version
versionsRouter.get("/:id/books", cacheControl(SEVEN_DAYS), async (c) => {
  const id = c.req.param("id");

  const version = await db
    .select({ id: versions.id })
    .from(versions)
    .where(eq(versions.id, id))
    .limit(1);

  if (version.length === 0) {
    return errorResponse(c, 404, "NOT_FOUND", `Version '${id}' not found`);
  }

  const bookRows = await db
    .select()
    .from(books)
    .where(eq(books.versionId, id))
    .orderBy(books.position);

  return success(c, bookRows);
});

// Full Bible download as JSON
versionsRouter.get("/:id/download", cacheControl(THIRTY_DAYS), async (c) => {
  const id = c.req.param("id");

  const version = await db
    .select()
    .from(versions)
    .where(eq(versions.id, id))
    .limit(1);

  if (version.length === 0) {
    return errorResponse(c, 404, "NOT_FOUND", `Version '${id}' not found`);
  }

  const ver = version[0];

  const allBooks = await db
    .select()
    .from(books)
    .where(eq(books.versionId, id))
    .orderBy(books.position);

  const result: Record<string, Record<string, Record<string, string>>> = {};

  for (const book of allBooks) {
    const bookChapters = await db
      .select()
      .from(chapters)
      .where(eq(chapters.bookId, book.id))
      .orderBy(chapters.number);

    const chaptersObj: Record<string, Record<string, string>> = {};

    for (const chapter of bookChapters) {
      const chapterVerses = await db
        .select()
        .from(verses)
        .where(eq(verses.chapterId, chapter.id))
        .orderBy(verses.number);

      const versesObj: Record<string, string> = {};
      for (const verse of chapterVerses) {
        versesObj[String(verse.number)] = verse.text;
      }

      chaptersObj[String(chapter.number)] = versesObj;
    }

    result[book.bookCode] = chaptersObj;
  }

  const response: Record<string, unknown> = {
    version: {
      abbreviation: ver.abbreviation,
      name: ver.name,
      license: ver.license,
    },
    books: result,
  };

  // Include attribution for CC-licensed versions
  if (ver.license && ver.license.includes("CC")) {
    response.attribution = `${ver.name}${ver.sourceUrl ? ` (${ver.sourceUrl})` : ""}`;
  }

  return c.json({ data: response });
});

export { versionsRouter };
