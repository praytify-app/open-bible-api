import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { versionCode } from "../lib/version-lookup.js";

/**
 * Read-only checks on an imported corpus, for operators deciding what to
 * clean up. An empty chapter returns 404 with a clear message, and every eBible
 * version can be addressed by its code. A chapter count below the highest
 * chapter number is worse: readers list 1..chapterCount, so the chapters above
 * it are served by direct URL but cannot be reached from a reader.
 */
export interface DataAudit {
  versions: number;
  emptyChapters: {
    total: number;
    byVersion: { abbreviation: string; code: string | null; count: number; sample: string[] }[];
  };
  /** Books whose chapter_count is below their highest chapter number (the seeder stored a count until October 2026). */
  countBelowHighest: {
    books: number;
    hiddenChapters: number;
    byVersion: { abbreviation: string; code: string | null; books: number; sample: string[] }[];
  };
  /** Abbreviations that are not short and URL-safe, so links should use the code. */
  unsafeAbbreviations: { abbreviation: string; code: string | null }[];
  /** Versions with an unsafe abbreviation and no code: only their id addresses them cleanly. */
  unaddressable: string[];
}

// Matches versionSlug() in the gateway's SDK and portal.
const SHORT_SAFE = "^[A-Za-z0-9-]{1,12}$";

export async function auditData(db: PostgresJsDatabase<Record<string, unknown>>): Promise<DataAudit> {
  const [{ count: versionCount }] = (await db.execute(sql`SELECT count(*)::int AS count FROM versions`)) as unknown as {
    count: number;
  }[];

  // verses(chapter_id, number) is unique, so NOT EXISTS probes an index per chapter.
  const empty = (await db.execute(sql`
    SELECT v.abbreviation, v.source_url, count(*)::int AS count,
           (array_agg(b.book_code || ' ' || c.number ORDER BY b.position, c.number))[1:5] AS sample
    FROM chapters c
    JOIN books b ON b.id = c.book_id
    JOIN versions v ON v.id = b.version_id
    WHERE NOT EXISTS (SELECT 1 FROM verses x WHERE x.chapter_id = c.id)
    GROUP BY v.abbreviation, v.source_url
    ORDER BY count DESC, v.abbreviation
  `)) as unknown as { abbreviation: string; source_url: string | null; count: number; sample: string[] }[];

  const low = (await db.execute(sql`
    SELECT v.abbreviation, v.source_url, count(*)::int AS books, sum(m.above)::int AS hidden,
           (array_agg(b.book_code || ' ' || b.chapter_count || ' < ' || m.highest ORDER BY b.position))[1:5] AS sample
    FROM books b
    JOIN (SELECT c.book_id, max(c.number) AS highest, count(*) FILTER (WHERE c.number > bb.chapter_count) AS above
          FROM chapters c JOIN books bb ON bb.id = c.book_id GROUP BY c.book_id) m ON m.book_id = b.id
    JOIN versions v ON v.id = b.version_id
    WHERE m.highest > b.chapter_count
    GROUP BY v.abbreviation, v.source_url
    ORDER BY books DESC, v.abbreviation
  `)) as unknown as { abbreviation: string; source_url: string | null; books: number; hidden: number; sample: string[] }[];

  const unsafe = (await db.execute(sql`
    SELECT abbreviation, source_url FROM versions
    WHERE abbreviation !~ ${SHORT_SAFE}
    ORDER BY abbreviation
  `)) as unknown as { abbreviation: string; source_url: string | null }[];

  const unsafeAbbreviations = unsafe.map((r) => ({ abbreviation: r.abbreviation, code: versionCode(r.source_url) }));
  return {
    versions: versionCount,
    emptyChapters: {
      total: empty.reduce((sum, r) => sum + r.count, 0),
      byVersion: empty.map((r) => ({
        abbreviation: r.abbreviation,
        code: versionCode(r.source_url),
        count: r.count,
        sample: r.sample,
      })),
    },
    countBelowHighest: {
      books: low.reduce((sum, r) => sum + r.books, 0),
      hiddenChapters: low.reduce((sum, r) => sum + r.hidden, 0),
      byVersion: low.map((r) => ({ abbreviation: r.abbreviation, code: versionCode(r.source_url), books: r.books, sample: r.sample })),
    },
    unsafeAbbreviations,
    unaddressable: unsafeAbbreviations.filter((v) => v.code === null).map((v) => v.abbreviation),
  };
}
