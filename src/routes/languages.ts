import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { db } from "../db/client.js";
import { languages, versions } from "../db/schema.js";
import { eq, count, sql } from "drizzle-orm";
import { success, errorResponse, parsePagination } from "../lib/responses.js";
import { cacheControl } from "../middleware/cache.js";
import {
  LanguageSchema,
  VersionSchema,
  PaginationQuerySchema,
  ErrorSchema,
  PaginationMetaSchema,
} from "../lib/openapi-schemas.js";

const TWENTY_FOUR_HOURS = 86400;

const languagesRouter = new OpenAPIHono();

// --- Route definitions ---

const listLanguagesRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Languages"],
  summary: "List all languages",
  description: "Returns a paginated list of all available languages.",
  request: {
    query: PaginationQuerySchema,
  },
  responses: {
    200: {
      description: "Paginated list of languages",
      content: {
        "application/json": {
          schema: z.object({
            data: z.array(LanguageSchema),
            meta: PaginationMetaSchema.optional(),
          }),
        },
      },
    },
  },
});

const getLanguageRoute = createRoute({
  method: "get",
  path: "/{code}",
  tags: ["Languages"],
  summary: "Get a language by code",
  description: "Returns a single language with its available Bible versions.",
  request: {
    params: z.object({
      code: z.string().min(2).max(3).openapi({ description: "ISO 639-2/3 language code", example: "eng" }),
    }),
  },
  responses: {
    200: {
      description: "Language with versions",
      content: {
        "application/json": {
          schema: z.object({
            data: LanguageSchema.extend({
              versions: z.array(VersionSchema),
            }),
          }),
        },
      },
    },
    404: {
      description: "Language not found",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
});

// --- Handlers ---

languagesRouter.openapi(listLanguagesRoute, async (c) => {
  const { page, limit, offset } = parsePagination(c);

  const [rows, totalResult] = await Promise.all([
    db
      .select()
      .from(languages)
      .orderBy(languages.name)
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(languages),
  ]);

  const total = totalResult[0]?.total ?? 0;

  return success(c, rows, {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
});

languagesRouter.openapi(getLanguageRoute, async (c) => {
  const code = c.req.param("code");

  const language = await db
    .select()
    .from(languages)
    .where(eq(languages.code, code))
    .limit(1);

  if (language.length === 0) {
    return errorResponse(c, 404, "NOT_FOUND", `Language '${code}' not found`);
  }

  const languageVersions = await db
    .select()
    .from(versions)
    .where(eq(versions.languageId, language[0].id))
    .orderBy(versions.name);

  return success(c, {
    ...language[0],
    versions: languageVersions,
  });
});

export { languagesRouter };
