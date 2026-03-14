import { Hono } from "hono";
import { db } from "../db/client.js";
import { languages, versions, books, chapters, verses } from "../db/schema.js";
import { eq, count, sql } from "drizzle-orm";
import { success, errorResponse } from "../lib/responses.js";
import { adminAuth } from "../middleware/admin-auth.js";

const adminRouter = new Hono();

// All admin routes require auth
adminRouter.use("*", adminAuth());

// Stats
adminRouter.get("/stats", async (c) => {
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

// Add a version
adminRouter.post("/versions", async (c) => {
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

// Seed placeholder
adminRouter.post("/seed", async (c) => {
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

// Delete a version (CASCADE)
adminRouter.delete("/versions/:id", async (c) => {
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
