import { Hono } from "hono";
import { db } from "../db/client.js";
import { books, chapters } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { success, errorResponse } from "../lib/responses.js";
import { cacheControl } from "../middleware/cache.js";

const SEVEN_DAYS = 604800;

const booksRouter = new Hono();

// List chapters for a book
booksRouter.get("/:id/chapters", cacheControl(SEVEN_DAYS), async (c) => {
  const id = c.req.param("id");

  const book = await db
    .select({ id: books.id })
    .from(books)
    .where(eq(books.id, id))
    .limit(1);

  if (book.length === 0) {
    return errorResponse(c, 404, "NOT_FOUND", `Book '${id}' not found`);
  }

  const chapterRows = await db
    .select()
    .from(chapters)
    .where(eq(chapters.bookId, id))
    .orderBy(chapters.number);

  return success(c, chapterRows);
});

export { booksRouter };
