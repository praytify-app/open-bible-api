import { createRoute, z } from "@hono/zod-openapi";
import { db } from "../db/client.js";
import { dailyVerses } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { success, errorResponse } from "../lib/responses.js";
import { cacheControl, CachePolicy } from "../middleware/cache.js";
import { canonicalizeVersionAbbreviation } from "../lib/version-abbreviations.js";
import { parseReference } from "../lib/reference-parser.js";
import { englishAliasToCode } from "../lib/book-names.js";
import { loadPassage, loadVersionsWithBooks } from "../lib/passages.js";
import { DailyVerseSchema, ErrorSchema } from "../lib/openapi-schemas.js";
import { createRouter } from "../lib/router.js";

const dailyRouter = createRouter();
// The handler sets its own expiry; this covers errors.
dailyRouter.use("*", cacheControl(CachePolicy.search));

const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * The curated slot for a UTC calendar date, counted on a leap-year calendar:
 * Jan 1 is 1, Feb 29 is 60, Dec 31 is 366. A date always gets the same
 * verse whatever the year, which is what month-themed curation needs. In a
 * common year slot 60 is skipped, and from March on this equals the old
 * `dayOfYear % 366 + 1` index, so existing rotations are unchanged.
 */
export function dailySlot(date: Date): number {
  return (Date.UTC(2000, date.getUTCMonth(), date.getUTCDate()) - Date.UTC(2000, 0, 1)) / DAY_MS + 1;
}

/** Parse YYYY-MM-DD as a UTC date, rejecting impossible dates like 2026-02-30. */
export function parseUtcDate(value: string): Date | null {
  const m = ISO_DATE.exec(value);
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  const roundTrips =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return roundTrips ? date : null;
}

const dailyVerseRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Daily"],
  summary: "Verse of the day",
  description:
    "The verse of the day for today (UTC) or a given date. With `version`, the day's reference is read from that " +
    "version; if it lacks the verse, the curated text is returned with `requestedVersion` and `note` set.",
  request: {
    query: z.object({
      version: z.string().optional().openapi({ description: "Version abbreviation to read the day's reference in", example: "WEB" }),
      date: z.string().optional().openapi({ description: "UTC date, YYYY-MM-DD (default: today)", example: "2026-12-25" }),
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
    400: {
      description: "Malformed date",
      content: { "application/json": { schema: ErrorSchema } },
    },
    404: {
      description: "No verse seeded for this day",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

dailyRouter.openapi(dailyVerseRoute, async (c) => {
  const versionParam = c.req.query("version")?.trim() || undefined;
  const dateParam = c.req.query("date");

  const now = new Date();
  let date = now;
  if (dateParam !== undefined) {
    const parsedDate = parseUtcDate(dateParam);
    if (!parsedDate) {
      return errorResponse(c, 400, "BAD_REQUEST", "Query parameter 'date' must be a valid YYYY-MM-DD date");
    }
    date = parsedDate;
  }

  const slot = dailySlot(date);
  const [entry] = await db.select().from(dailyVerses).where(eq(dailyVerses.dayOfYear, slot)).limit(1);

  if (!entry) {
    return errorResponse(c, 404, "NOT_FOUND", "Verse of the day not seeded for this day");
  }

  // A pinned date never changes; "today" expires at the next UTC midnight.
  if (dateParam !== undefined) {
    c.header("Cache-Control", CachePolicy.scripture);
  } else {
    const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
    const seconds = Math.max(Math.floor((midnight - now.getTime()) / 1000), 60);
    c.header("Cache-Control", `public, max-age=${seconds}, s-maxage=${seconds}`);
  }

  const curatedVersion = canonicalizeVersionAbbreviation(entry.versionAbbreviation);
  const parsed = parseReference(entry.reference);
  const curated = {
    dayOfYear: slot,
    date: date.toISOString().slice(0, 10),
    reference: entry.reference,
    text: entry.text,
    version: curatedVersion,
    ...(parsed
      ? {
          bookCode: englishAliasToCode(parsed.book),
          chapter: parsed.chapter,
          verseStart: parsed.verseStart,
          verseEnd: parsed.verseEnd ?? parsed.verseStart,
        }
      : {}),
  };

  if (!versionParam) {
    return success(c, curated);
  }

  const loaded = parsed ? (await loadVersionsWithBooks([versionParam])).get(versionParam) : undefined;
  const result = loaded && parsed ? await loadPassage(entry.reference, parsed, loaded) : undefined;

  if (result?.ok) {
    const { passage } = result;
    return success(c, {
      dayOfYear: slot,
      date: curated.date,
      reference: entry.reference,
      text: passage.verses.map((v) => v.text).join(" "),
      version: passage.version,
      bookCode: passage.bookCode,
      bookName: passage.bookName,
      chapter: passage.chapter,
      verseStart: passage.verseStart,
      verseEnd: passage.verseEnd,
      license: passage.license,
      attribution: passage.attribution,
      attributionUrl: passage.attributionUrl,
      languageCode: passage.languageCode,
      textDirection: passage.textDirection,
    });
  }

  // Asking for the curated version itself is not a mismatch worth a note.
  if (canonicalizeVersionAbbreviation(versionParam) === curatedVersion) {
    return success(c, curated);
  }

  const reason = loaded ? `does not contain ${entry.reference}` : "is not available";
  return success(c, {
    ...curated,
    requestedVersion: versionParam,
    note: `${versionParam} ${reason}, so the curated ${curatedVersion} text is shown.`,
  });
});

export { dailyRouter };
