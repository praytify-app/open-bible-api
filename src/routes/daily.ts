import { Hono } from "hono";
import { db } from "../db/client.js";
import { dailyVerses, versions, verses, chapters, books } from "../db/schema.js";
import { eq, and, sql } from "drizzle-orm";
import { success, errorResponse } from "../lib/responses.js";

const dailyRouter = new Hono();

// Verse of the day
dailyRouter.get("/", async (c) => {
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
    // Parse the reference to find the verse in the requested version
    // For now, return the seeded version with a note
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
