/**
 * Batch runner for orchestrating bulk eBible.org imports with error isolation.
 *
 * Each translation is imported independently so that a failure in one
 * does not block others.
 */

import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { versions } from "../db/schema.js";
import { downloadAndParseEbible } from "./sources/ebible.js";
import { seedVersion } from "./bulk-insert.js";
import type { CatalogEntry } from "./catalog.js";

export interface BatchResult {
  translationId: string;
  status: "imported" | "skipped" | "failed";
  verseCount?: number;
  reason?: string;
  error?: string;
}

export interface BatchReport {
  total: number;
  imported: number;
  skipped: number;
  failed: number;
  failures: BatchResult[];
}

export interface BatchOptions {
  /** Max concurrent imports (default: 1 — sequential) */
  concurrency?: number;
  /** Delay in ms between imports (default: 0) */
  delay?: number;
  /** Force re-import even if already exists */
  force?: boolean;
  /** Called after each translation completes */
  onProgress?: (result: BatchResult, index: number, total: number) => void;
}

/**
 * Pure function — summarize an array of BatchResult into a BatchReport.
 */
export function createBatchReport(results: BatchResult[]): BatchReport {
  const imported = results.filter((r) => r.status === "imported").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const failures = results.filter((r) => r.status === "failed");

  return {
    total: results.length,
    imported,
    skipped,
    failed,
    failures,
  };
}

/**
 * Import a single translation from eBible.org.
 *
 * Checks if the version already exists (by abbreviation), downloads,
 * parses, and seeds. Returns a BatchResult with status.
 */
export async function importSingleTranslation(
  entry: CatalogEntry,
  force = false
): Promise<BatchResult> {
  try {
    // Check if already imported
    if (!force) {
      const existing = await db
        .select({ id: versions.id })
        .from(versions)
        .where(eq(versions.abbreviation, entry.abbreviation))
        .limit(1);

      if (existing.length > 0) {
        return {
          translationId: entry.translationId,
          status: "skipped",
          reason: `Version "${entry.abbreviation}" already exists`,
        };
      }
    }

    // Download and parse
    const parsedBooks = await downloadAndParseEbible(entry.translationId);

    if (parsedBooks.length === 0) {
      return {
        translationId: entry.translationId,
        status: "failed",
        error: "No parseable books found in download",
      };
    }

    // Seed into DB
    await seedVersion({
      parsedBooks,
      languageCode: entry.languageCode,
      languageName: entry.languageName,
      languageNativeName: entry.languageNativeName,
      languageScript: entry.languageScript,
      languageDirection: entry.languageDirection,
      abbreviation: entry.abbreviation,
      name: entry.name,
      license: entry.license,
      sourceUrl: entry.sourceUrl,
      attribution: entry.attribution,
      attributionUrl: entry.attributionUrl,
      licenseType: entry.licenseType,
    });

    // Count verses from parsed data
    let verseCount = 0;
    for (const book of parsedBooks) {
      for (const chapter of book.chapters) {
        verseCount += chapter.verses.length;
      }
    }

    return {
      translationId: entry.translationId,
      status: "imported",
      verseCount,
    };
  } catch (err) {
    return {
      translationId: entry.translationId,
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Sleep helper for throttling.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run batch import for an array of catalog entries.
 *
 * Supports concurrency control and throttling. Each translation is
 * imported independently with error isolation — a failure in one
 * does not affect others.
 */
export async function runBatchImport(
  entries: CatalogEntry[],
  options: BatchOptions = {}
): Promise<BatchResult[]> {
  const { concurrency = 1, delay = 0, force = false, onProgress } = options;
  const results: BatchResult[] = [];

  if (concurrency <= 1) {
    // Sequential mode
    for (let i = 0; i < entries.length; i++) {
      const result = await importSingleTranslation(entries[i], force);
      results.push(result);

      if (onProgress) {
        onProgress(result, i, entries.length);
      }

      if (delay > 0 && i < entries.length - 1) {
        await sleep(delay);
      }
    }
  } else {
    // Concurrent mode with bounded parallelism
    let index = 0;

    async function worker(): Promise<void> {
      while (index < entries.length) {
        const currentIndex = index++;
        const entry = entries[currentIndex];

        const result = await importSingleTranslation(entry, force);
        results.push(result);

        if (onProgress) {
          onProgress(result, currentIndex, entries.length);
        }

        if (delay > 0) {
          await sleep(delay);
        }
      }
    }

    const workers = Array.from(
      { length: Math.min(concurrency, entries.length) },
      () => worker()
    );
    await Promise.all(workers);
  }

  return results;
}
