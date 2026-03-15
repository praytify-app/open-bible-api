import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { db } from "../db/client.js";
import { dailyVerses, versions, verses, chapters, books } from "../db/schema.js";
import { eq, and, sql } from "drizzle-orm";
import { success, errorResponse } from "../lib/responses.js";
import { DailyVerseSchema, ErrorSchema } from "../lib/openapi-schemas.js";

const dailyRouter = new OpenAPIHono();

const dailyVerseRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Daily"],
  summary: "Verse of the day",
  description: "Returns the verse of the day based on the current day of the year. Optionally specify a preferred version.",
  request: {
    query: z.object({
      version: z.string().optional().openapi({ description: "Preferred version abbreviation", example: "KJV" }),
    }),
  },
  responses: {
    200: {
      description: "Verse of the day",
      content: {
        "application/json": {
          schema: z.object({ data: DailyVerseSchema }),
        },
      },
    },
    404: {
      description: "No verse seeded for this day",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

dailyRouter.openapi(dailyVerseRoute, async (c) => {
  const versionParam = c.req.query("version");

  // Calculate day of year
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  const dayOfYear = Math.floor(diff / oneDay);
  const index = (dayOfYear % 366) + 1;

  const daily = await db
    .select()
    .from(dailyVerses)
    .where(eq(dailyVerses.dayOfYear, index))
    .limit(1);

  if (daily.length === 0) {
    return errorResponse(
      c,
      404,
      "NOT_FOUND",
      "Verse of the day not seeded for this day"
    );
  }

  const entry = daily[0];

  // If specific version requested and differs from seeded version, try to look it up
  if (versionParam && versionParam !== entry.versionAbbreviation) {
    const result = {
      dayOfYear: index,
      reference: entry.reference,
      text: entry.text,
      version: entry.versionAbbreviation,
      requestedVersion: versionParam,
      note: `Verse of the day is seeded in ${entry.versionAbbreviation}. Requested version: ${versionParam}.`,
    };

    // Cache until midnight UTC
    const midnight = new Date();
    midnight.setUTCHours(24, 0, 0, 0);
    const secondsUntilMidnight = Math.floor(
      (midnight.getTime() - now.getTime()) / 1000
    );
    c.header(
      "Cache-Control",
      `public, max-age=${Math.max(secondsUntilMidnight, 60)}`
    );

    return success(c, result);
  }

  // Cache until midnight UTC
  const midnight = new Date();
  midnight.setUTCHours(24, 0, 0, 0);
  const secondsUntilMidnight = Math.floor(
    (midnight.getTime() - now.getTime()) / 1000
  );
  c.header(
    "Cache-Control",
    `public, max-age=${Math.max(secondsUntilMidnight, 60)}`
  );

  return success(c, {
    dayOfYear: index,
    reference: entry.reference,
    text: entry.text,
    version: entry.versionAbbreviation,
  });
});

export { dailyRouter };
