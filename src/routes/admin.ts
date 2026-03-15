import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { db } from "../db/client.js";
import { languages, versions, books, chapters, verses } from "../db/schema.js";
import { eq, count, sql } from "drizzle-orm";
import { success, errorResponse } from "../lib/responses.js";
import { adminAuth } from "../middleware/admin-auth.js";
import {
  AdminStatsSchema,
  CreateVersionBodySchema,
  VersionSchema,
  ErrorSchema,
} from "../lib/openapi-schemas.js";

const adminRouter = new OpenAPIHono();

// All admin routes require auth
adminRouter.use("*", adminAuth());

const adminStatsRoute = createRoute({
  method: "get",
  path: "/stats",
  tags: ["Admin"],
  summary: "Get database statistics",
  description: "Returns counts of languages, versions, verses, and database size. Requires admin authentication.",
  responses: {
    200: {
      description: "Database statistics",
      content: {
        "application/json": {
          schema: z.object({ data: AdminStatsSchema }),
        },
      },
    },
    401: {
      description: "Unauthorized",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

const createVersionRoute = createRoute({
  method: "post",
  path: "/versions",
  tags: ["Admin"],
  summary: "Create a new Bible version",
  description: "Add a new Bible version to the database. Requires admin authentication.",
  request: {
    body: {
      content: {
        "application/json": {
          schema: CreateVersionBodySchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: "Version created",
      content: {
        "application/json": {
          schema: z.object({ data: z.any() }),
        },
      },
    },
    400: {
      description: "Missing required fields",
      content: { "application/json": { schema: ErrorSchema } },
    },
    404: {
      description: "Language not found",
      content: { "application/json": { schema: ErrorSchema } },
    },
    409: {
      description: "Version already exists",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

const seedRoute = createRoute({
  method: "post",
  path: "/seed",
  tags: ["Admin"],
  summary: "Seed placeholder",
  description: "Returns instructions for seeding via CLI. Requires admin authentication.",
  responses: {
    202: {
      description: "Seeding instructions",
      content: {
        "application/json": {
          schema: z.object({
            data: z.object({
              message: z.string(),
              status: z.string(),
            }),
          }),
        },
      },
    },
  },
});

const deleteVersionRoute = createRoute({
  method: "delete",
  path: "/versions/{id}",
  tags: ["Admin"],
  summary: "Delete a Bible version",
  description: "Delete a version and all its associated books, chapters, and verses (CASCADE). Requires admin authentication.",
  request: {
    params: z.object({
      id: z.string().openapi({ description: "Version UUID" }),
    }),
  },
  responses: {
    200: {
      description: "Version deleted",
      content: {
        "application/json": {
          schema: z.object({
            data: z.object({ message: z.string() }),
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

adminRouter.openapi(adminStatsRoute, async (c) => {
  const [langCount, versionCount, verseCount, dbSizeResult] = await Promise.all([
    db.select({ total: count() }).from(languages),
    db.select({ total: count() }).from(versions),
    db.select({ total: count() }).from(verses),
    db.execute(sql`SELECT pg_database_size(current_database()) as size`),
  ]);

  const dbSize = (dbSizeResult as unknown as Record<string, unknown>[])[0]?.size ?? 0;

  return success(c, {
    languages: langCount[0]?.total ?? 0,
    versions: versionCount[0]?.total ?? 0,
    verses: verseCount[0]?.total ?? 0,
    databaseSizeBytes: Number(dbSize),
  });
});

adminRouter.openapi(createVersionRoute, async (c) => {
  const body = await c.req.json();

  const { abbreviation, name, languageCode, license, description, sourceUrl, canonType } = body;

  if (!abbreviation || !name || !languageCode || !license) {
    return errorResponse(
      c,
      400,
      "BAD_REQUEST",
      "Fields 'abbreviation', 'name', 'languageCode', and 'license' are required"
    );
  }

  // Find language
  const lang = await db
    .select({ id: languages.id })
    .from(languages)
    .where(eq(languages.code, languageCode))
    .limit(1);

  if (lang.length === 0) {
    return errorResponse(c, 404, "NOT_FOUND", `Language '${languageCode}' not found`);
  }

  // Check for duplicate abbreviation
  const existing = await db
    .select({ id: versions.id })
    .from(versions)
    .where(eq(versions.abbreviation, abbreviation))
    .limit(1);

  if (existing.length > 0) {
    return errorResponse(c, 409, "CONFLICT", `Version '${abbreviation}' already exists`);
  }

  const [newVersion] = await db
    .insert(versions)
    .values({
      abbreviation,
      name,
      languageId: lang[0].id,
      license,
      description: description ?? null,
      sourceUrl: sourceUrl ?? null,
      canonType: canonType ?? "protestant",
    })
    .returning();

  return c.json({ data: newVersion }, 201);
});

adminRouter.openapi(seedRoute, async (c) => {
  return c.json(
    {
      data: {
        message:
          "Seeding is handled via the CLI. Run: pnpm seed --source ebible --id engKJV",
        status: "accepted",
      },
    },
    202
  );
});

adminRouter.openapi(deleteVersionRoute, async (c) => {
  const id = c.req.param("id");

  const version = await db
    .select({ id: versions.id, abbreviation: versions.abbreviation })
    .from(versions)
    .where(eq(versions.id, id))
    .limit(1);

  if (version.length === 0) {
    return errorResponse(c, 404, "NOT_FOUND", `Version '${id}' not found`);
  }

  await db.delete(versions).where(eq(versions.id, id));

  return success(c, {
    message: `Version '${version[0].abbreviation}' deleted successfully`,
  });
});

export { adminRouter };
