import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { db } from "../db/client.js";
import { versions, languages, books, chapters, verses } from "../db/schema.js";
import { eq, count, sql, and, asc, inArray, or, ilike } from "drizzle-orm";
import { success, errorResponse, parsePagination } from "../lib/responses.js";
import { cacheControl, CachePolicy } from "../middleware/cache.js";
import {
  canonicalizeVersionAbbreviation,
  getVersionAbbreviationCandidates,
} from "../lib/version-abbreviations.js";
import { cleanVerseText } from "../lib/text-cleaner.js";
import { toVersionMeta, versionMetaColumns } from "../lib/passages.js";
import {
  VersionSchema,
  BookSchema,
  PaginationQuerySchema,
  ErrorSchema,
  PaginationMetaSchema,
  DownloadBooksSchema,
  DownloadLegacySchema,
} from "../lib/openapi-schemas.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const versionsRouter = new OpenAPIHono();
versionsRouter.use("*", cacheControl(CachePolicy.scripture));

function mapVersionForResponse<T extends { abbreviation: string }>(version: T): T {
  return {
    ...version,
    abbreviation: canonicalizeVersionAbbreviation(version.abbreviation),
  };
}

// --- Route definitions ---

const listVersionsRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Versions"],
  summary: "List Bible versions",
  description: "Returns a paginated list of all available Bible versions, including self-hosted and API Bible proxy versions. Optionally filter by language.",
  request: {
    query: PaginationQuerySchema.extend({
      language: z.string().optional().openapi({ description: "Filter by language code", example: "eng" }),
      search: z.string().min(2).optional().openapi({ description: "Search versions by name or abbreviation", example: "web" }),
      hasAudio: z.coerce.boolean().optional().openapi({ description: "Filter to versions with audio available", example: "true" }),
    }),
  },
  responses: {
    200: {
      description: "Paginated list of versions",
      content: {
        "application/json": {
          schema: z.object({
            data: z.array(z.any()),
            meta: PaginationMetaSchema.optional(),
          }),
        },
      },
    },
  },
});

const getVersionRoute = createRoute({
  method: "get",
  path: "/{id}",
  tags: ["Versions"],
  summary: "Get a version by ID",
  description: "Returns a single Bible version by its UUID.",
  request: {
    params: z.object({
      id: z.string().openapi({ description: "Version UUID", example: "550e8400-e29b-41d4-a716-446655440000" }),
    }),
  },
  responses: {
    200: {
      description: "Version details",
      content: {
        "application/json": {
          schema: z.object({ data: VersionSchema }),
        },
      },
    },
    404: {
      description: "Version not found",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

const versionBooksRoute = createRoute({
  method: "get",
  path: "/{id}/books",
  tags: ["Versions"],
  summary: "List books in a version",
  description: "Returns all books for a Bible version. Accepts UUID or abbreviation.",
  request: {
    params: z.object({
      id: z.string().openapi({ description: "Version UUID or abbreviation", example: "KJV" }),
    }),
  },
  responses: {
    200: {
      description: "List of books",
      content: {
        "application/json": {
          schema: z.object({ data: z.array(BookSchema) }),
        },
      },
    },
    404: {
      description: "Version not found",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

export const DOWNLOAD_FORMATS = ["books", "legacy"] as const;
type DownloadFormat = (typeof DOWNLOAD_FORMATS)[number];

const downloadVersionRoute = createRoute({
  method: "get",
  path: "/{id}/download",
  tags: ["Versions"],
  summary: "Download a full Bible as JSON",
  description:
    "The entire text of one version in a single response. `format=books` (default) returns an ordered array of " +
    "books, each with its chapters and verses, plus the version's license and attribution. `format=legacy` " +
    "returns the earlier nested-object shape and is deprecated.",
  request: {
    params: z.object({
      id: z.string().openapi({ description: "Version UUID or abbreviation", example: "WEB" }),
    }),
    query: z.object({
      // Validated in the handler so a bad value gets the standard error envelope.
      format: z.string().optional().openapi({ description: "Response shape: books (default) or legacy (deprecated)", example: "books" }),
    }),
  },
  responses: {
    200: {
      description: "Full Bible text",
      content: {
        "application/json": {
          schema: z.object({ data: z.union([DownloadBooksSchema, DownloadLegacySchema]) }),
        },
      },
    },
    400: {
      description: "Unknown format",
      content: { "application/json": { schema: ErrorSchema } },
    },
    404: {
      description: "Version not found",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

// --- Handlers ---

versionsRouter.openapi(listVersionsRoute, async (c) => {
  // Versions are lightweight catalog metadata (~1,300 rows total); allow
  // clients like the portal's translation browser and the reader's version
  // picker to fetch the full catalog in one request.
  const { page, limit, offset } = parsePagination(c, 2000);
  const languageFilter = c.req.query("language");
  const searchFilter = c.req.query("search");
  const hasAudioFilter = c.req.query("hasAudio");

  const conditions = [];

  // Filter out phantom entries (no verse data)
  conditions.push(sql`${versions.verseCount} > 0`);

  if (hasAudioFilter === "true") {
    conditions.push(eq(versions.hasAudio, true));
  }

  if (languageFilter) {
    const lang = await db
      .select({ id: languages.id })
      .from(languages)
      .where(eq(languages.code, languageFilter))
      .limit(1);

    if (lang.length === 0) {
      return success(c, [], { page, limit, total: 0, totalPages: 0 });
    }
    conditions.push(eq(versions.languageId, lang[0].id));
  }

  // Search by name or abbreviation (case-insensitive)
  // Note: ilike with leading wildcard cannot use B-tree index.
  // At ~1000 versions this is <5ms. If scale increases to 10k+,
  // add a pg_trgm GIN index on name and abbreviation.
  if (searchFilter) {
    const pattern = `%${searchFilter}%`;
    const searchCandidates = getVersionAbbreviationCandidates(
      searchFilter.toUpperCase()
    );
    conditions.push(
      or(
        ilike(versions.name, pattern),
        ilike(versions.abbreviation, pattern),
        inArray(versions.abbreviation, searchCandidates)
      )!
    );
  }

  const whereClause = conditions.length > 0
    ? conditions.length === 1
      ? conditions[0]
      : and(...conditions)
    : undefined;

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
        attribution: versions.attribution,
        attributionUrl: versions.attributionUrl,
        licenseType: versions.licenseType,
        hasAudio: versions.hasAudio,
        createdAt: versions.createdAt,
        language: languages.name,
        languageCode: languages.code,
        languageNativeName: languages.nativeName,
        textDirection: languages.direction,
      })
      .from(versions)
      .leftJoin(languages, eq(versions.languageId, languages.id))
      .where(whereClause)
      .orderBy(versions.name)
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(versions)
      .where(whereClause),
  ]);

  const dbTotal = totalResult[0]?.total ?? 0;

  const dbVersionsWithSource = rows
    .map((v: any) => ({
      ...mapVersionForResponse(v),
      source: "self-hosted" as const,
      isOfflineCapable: true,
      attributionRequired: v.licenseType !== "PD",
    }));

  return success(c, dbVersionsWithSource, {
    page,
    limit,
    total: dbTotal,
    totalPages: Math.ceil(dbTotal / limit),
  });
});

versionsRouter.openapi(getVersionRoute, async (c) => {
  const id = c.req.param("id");
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  let version = [] as typeof versions.$inferSelect[];

  if (isUuid) {
    version = await db
      .select()
      .from(versions)
      .where(eq(versions.id, id))
      .limit(1);
  }

  if (version.length === 0) {
    version = await db
      .select()
      .from(versions)
      .where(inArray(versions.abbreviation, getVersionAbbreviationCandidates(id)))
      .limit(1);
  }

  if (version.length === 0) {
    return errorResponse(c, 404, "NOT_FOUND", `Version '${id}' not found`);
  }

  const [lang] = await db
    .select({
      name: languages.name,
      code: languages.code,
      nativeName: languages.nativeName,
      direction: languages.direction,
    })
    .from(languages)
    .where(eq(languages.id, version[0].languageId))
    .limit(1);

  return success(c, {
    ...mapVersionForResponse(version[0]),
    language: lang?.name ?? null,
    languageCode: lang?.code ?? null,
    languageNativeName: lang?.nativeName ?? null,
    textDirection: lang?.direction ?? null,
  });
});

versionsRouter.openapi(versionBooksRoute, async (c) => {
  const id = c.req.param("id");

  // UUID format check — avoid Postgres cast error on non-UUID strings
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  // Try by UUID first (if valid format), then by abbreviation
  let version: { id: string }[] = [];

  if (isUuid) {
    version = await db
      .select({ id: versions.id })
      .from(versions)
      .where(eq(versions.id, id))
      .limit(1);
  }

  if (version.length === 0) {
    version = await db
      .select({ id: versions.id })
      .from(versions)
      .where(inArray(versions.abbreviation, getVersionAbbreviationCandidates(id)))
      .limit(1);
  }

  if (version.length === 0) {
    return errorResponse(c, 404, "NOT_FOUND", `Version '${id}' not found`);
  }

  const versionId = version[0].id;

  const bookRows = await db
    .select()
    .from(books)
    .where(eq(books.versionId, versionId))
    .orderBy(books.position);

  return success(c, bookRows);
});

versionsRouter.openapi(downloadVersionRoute, async (c) => {
  const id = c.req.param("id");
  const formatParam = c.req.query("format") ?? "books";

  if (!DOWNLOAD_FORMATS.includes(formatParam as DownloadFormat)) {
    return errorResponse(c, 400, "BAD_REQUEST", `Unknown format '${formatParam}'. Use one of: ${DOWNLOAD_FORMATS.join(", ")}`);
  }
  const format = formatParam as DownloadFormat;

  // Query 1: the version by UUID or abbreviation, with its language.
  const isUuid = UUID.test(id);
  const candidates = getVersionAbbreviationCandidates(id);
  const found = await db
    .select({ ...versionMetaColumns, sourceUrl: versions.sourceUrl })
    .from(versions)
    .leftJoin(languages, eq(versions.languageId, languages.id))
    .where(
      isUuid
        ? or(eq(versions.id, id), inArray(versions.abbreviation, candidates))
        : inArray(versions.abbreviation, candidates)
    );

  const row =
    found.find((r) => r.id === id) ??
    candidates.map((abbr) => found.find((r) => r.abbreviation === abbr)).find(Boolean);

  if (!row) {
    return errorResponse(c, 404, "NOT_FOUND", `Version '${id}' not found`);
  }

  // Query 2: every verse in canonical order. This replaces one query per
  // book and one per chapter (about 1,256 round trips for a full Bible)
  // that held a pool connection for the whole download.
  const verseRows = await db
    .select({
      bookCode: books.bookCode,
      bookName: books.name,
      position: books.position,
      testament: books.testament,
      chapter: chapters.number,
      verse: verses.number,
      text: verses.text,
    })
    .from(books)
    .innerJoin(chapters, eq(chapters.bookId, books.id))
    .innerJoin(verses, eq(verses.chapterId, chapters.id))
    .where(eq(books.versionId, row.id))
    .orderBy(asc(books.position), asc(chapters.number), asc(verses.number));

  const version = toVersionMeta(row);

  if (format === "legacy") {
    const nested: Record<string, Record<string, Record<string, string>>> = {};
    for (const r of verseRows) {
      const book = (nested[r.bookCode] ??= {});
      const chapter = (book[String(r.chapter)] ??= {});
      chapter[String(r.verse)] = cleanVerseText(r.text);
    }
    // Kept byte-compatible with the old shape, including its attribution rule.
    const legacyAttribution =
      row.license && row.license.includes("CC")
        ? `${row.name}${row.sourceUrl ? ` (${row.sourceUrl})` : ""}`
        : undefined;
    return c.json(
      {
        data: {
          version: { abbreviation: version.abbreviation, name: version.name, license: version.license },
          books: nested,
          ...(legacyAttribution ? { attribution: legacyAttribution } : {}),
        },
      },
      200
    );
  }

  type DownloadBook = {
    bookCode: string;
    code: string;
    name: string;
    position: number;
    testament: string;
    chapters: { number: number; verses: { number: number; text: string }[] }[];
  };
  const bookList: DownloadBook[] = [];
  let book: DownloadBook | undefined;
  let chapter: DownloadBook["chapters"][number] | undefined;

  // Rows arrive ordered, so grouping is a single pass with no lookups.
  for (const r of verseRows) {
    if (!book || book.bookCode !== r.bookCode) {
      book = {
        bookCode: r.bookCode,
        code: r.bookCode,
        name: r.bookName,
        position: r.position,
        testament: r.testament,
        chapters: [],
      };
      bookList.push(book);
      chapter = undefined;
    }
    if (!chapter || chapter.number !== r.chapter) {
      chapter = { number: r.chapter, verses: [] };
      book.chapters.push(chapter);
    }
    chapter.verses.push({ number: r.verse, text: cleanVerseText(r.text) });
  }

  return c.json(
    {
      data: {
        version: {
          id: version.id,
          abbreviation: version.abbreviation,
          name: version.name,
          license: version.license,
          licenseType: version.licenseType,
          attribution: version.attribution,
          attributionUrl: version.attributionUrl,
          languageCode: version.languageCode,
          textDirection: version.textDirection,
        },
        name: version.name,
        languageCode: version.languageCode,
        books: bookList,
      },
    },
    200
  );
});

export { versionsRouter };
