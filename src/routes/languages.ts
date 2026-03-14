import { Hono } from "hono";
import { db } from "../db/client.js";
import { languages, versions } from "../db/schema.js";
import { eq, count, sql } from "drizzle-orm";
import { success, errorResponse, parsePagination } from "../lib/responses.js";
import { cacheControl } from "../middleware/cache.js";

const TWENTY_FOUR_HOURS = 86400;

const languagesRouter = new Hono();

// List all languages with pagination
languagesRouter.get("/", cacheControl(TWENTY_FOUR_HOURS), async (c) => {
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

// Single language + its versions
languagesRouter.get("/:code", cacheControl(TWENTY_FOUR_HOURS), async (c) => {
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
