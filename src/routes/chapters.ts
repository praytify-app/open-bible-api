import { Hono } from "hono";
import { db } from "../db/client.js";
import { chapters, verses } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { success, errorResponse } from "../lib/responses.js";
import { cacheControl } from "../middleware/cache.js";

const THIRTY_DAYS = 2592000;

const chaptersRouter = new Hono();

// List verses for a chapter
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

  return success(c, verseRows);
});

export { chaptersRouter };
