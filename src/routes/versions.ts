import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { db } from "../db/client.js";
import { versions, languages, books, chapters, verses } from "../db/schema.js";
import { eq, count, sql, and } from "drizzle-orm";
import { success, errorResponse, parsePagination } from "../lib/responses.js";
import { cacheControl } from "../middleware/cache.js";
import {
  VersionSchema,
  BookSchema,
  PaginationQuerySchema,
  ErrorSchema,
  PaginationMetaSchema,
} from "../lib/openapi-schemas.js";

const TWENTY_FOUR_HOURS = 86400;
const SEVEN_DAYS = 604800;
const THIRTY_DAYS = 2592000;

const versionsRouter = new OpenAPIHono();

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

const downloadVersionRoute = createRoute({
  method: "get",
  path: "/{id}/download",
  tags: ["Versions"],
  summary: "Download full Bible as JSON",
  description: "Returns the entire Bible text for a version as a structured JSON object.",
  request: {
    params: z.object({
      id: z.string().openapi({ description: "Version UUID" }),
    }),
  },
  responses: {
    200: {
      description: "Full Bible data",
      content: {
        "application/json": {
          schema: z.object({
            data: z.object({
              version: z.object({
                abbreviation: z.string(),
                name: z.string(),
                license: z.string().nullable(),
              }),
              books: z.record(z.string(), z.record(z.string(), z.record(z.string(), z.string()))),
              attribution: z.string().optional(),
            }),
          }),
        },
      },
    },
    404: {
      description: "Version not found",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

// --- Handlers ---

versionsRouter.openapi(listVersionsRoute, async (c) => {
  const { page, limit, offset } = parsePagination(c);
  const languageFilter = c.req.query("language");
  const searchFilter = c.req.query("search");

  const conditions = [];

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
    conditions.push(
      sql`(${versions.name} ILIKE ${pattern} OR ${versions.abbreviation} ILIKE ${pattern})`
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

  const dbTotal = totalResult[0]?.total ?? 0;

  // Filter out self-hosted versions that have no verse data (phantom entries)
  const dbVersionsWithSource = rows
    .filter((v: any) => v.verseCount > 0)
    .map((v: any) => ({
      ...v,
      source: "self-hosted" as const,
      isOfflineCapable: true,
      attributionRequired: v.licenseType !== "PD",
    }));

  const allVersions = dbVersionsWithSource;
  const total = dbVersionsWithSource.length;

  return success(c, allVersions, {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
});

versionsRouter.openapi(getVersionRoute, async (c) => {
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
      .where(eq(versions.abbreviation, id))
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

versionsRouter.openapi(downloadVersionRoute, async (c): Promise<any> => {
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
