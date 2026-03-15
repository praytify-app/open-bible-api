import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { db } from "../db/client.js";
import { books, chapters } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { success, errorResponse } from "../lib/responses.js";
import { cacheControl } from "../middleware/cache.js";
import { ChapterSchema, ErrorSchema } from "../lib/openapi-schemas.js";

const SEVEN_DAYS = 604800;

const booksRouter = new OpenAPIHono();

const bookChaptersRoute = createRoute({
  method: "get",
  path: "/{id}/chapters",
  tags: ["Books"],
  summary: "List chapters in a book",
  description: "Returns all chapters for a given book by its UUID.",
  request: {
    params: z.object({
      id: z.string().openapi({ description: "Book UUID" }),
    }),
  },
  responses: {
    200: {
      description: "List of chapters",
      content: {
        "application/json": {
          schema: z.object({ data: z.array(ChapterSchema) }),
        },
      },
    },
    404: {
      description: "Book not found",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

booksRouter.openapi(bookChaptersRoute, async (c) => {
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
