// Full-text search infrastructure. Idempotent and resumable: safe to re-run
// after a data restore, a partial run, or new imports.
//
//   1. CREATE EXTENSION pg_trgm (serves the ILIKE/similarity fallback path)
//   2. Ensure verses.search_vector is a plain tsvector column. A legacy
//      GENERATED column (an old migrate.ts hardcoded 'english' for every
//      language) is dropped and replaced: generated columns cannot hold
//      per-language vectors.
//   3. Populate search_vector per version with the language-appropriate
//      dictionary from PG_DICTIONARIES. Languages without a PG dictionary
//      stay NULL: the search route serves them through the trigram path.
//   4. CREATE GIN indexes (search_vector + text trigram), after population
//      so index maintenance does not slow the bulk updates.
//
// Without this, the stemmed search path finds nothing: search_vector is
// NULL for every verse a seeder inserts.
import postgres from "postgres";
import { getPgDictionary } from "../lib/pg-dictionaries.js";

export interface SearchInfraOptions {
  /**
   * Vectorize only versions imported from these source URLs. The sample
   * seed uses this so running it against a large database does not
   * vectorize every other version too. Default: all versions.
   */
  sourceUrls?: string[];
  log?: (message: string) => void;
}

export async function buildSearchInfra(
  connectionString: string,
  { sourceUrls, log = console.log }: SearchInfraOptions = {}
): Promise<{ vectorized: number; trigramOnly: number }> {
  // Its own client with no statement timeout: vectorizing a large version
  // is a long UPDATE by design.
  const sql = postgres(connectionString, { max: 1, onnotice: () => {} });

  try {
    log("1/4 extension...");
    await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`;

    log("2/4 search_vector column...");
    const [col] = await sql`
      SELECT is_generated FROM information_schema.columns
      WHERE table_name = 'verses' AND column_name = 'search_vector'
    `;
    if (col?.is_generated === "ALWAYS") {
      log("  dropping legacy generated column");
      await sql`ALTER TABLE verses DROP COLUMN search_vector`;
    }
    await sql`ALTER TABLE verses ADD COLUMN IF NOT EXISTS search_vector tsvector`;

    log("3/4 populating vectors per version...");
    const versionRows = await sql`
      SELECT v.id, v.abbreviation, l.code
      FROM versions v JOIN languages l ON v.language_id = l.id
      ${sourceUrls ? sql`WHERE v.source_url = ANY(${sourceUrls})` : sql``}
      ORDER BY l.code, v.abbreviation
    `;
    let vectorized = 0;
    let trigramOnly = 0;
    for (const v of versionRows) {
      const dict = getPgDictionary(v.code);
      if (dict === "simple") {
        trigramOnly++;
        continue;
      }
      await sql`
        UPDATE verses SET search_vector = to_tsvector(${dict}::regconfig, text)
        WHERE search_vector IS NULL AND chapter_id IN (
          SELECT c.id FROM chapters c
          JOIN books b ON c.book_id = b.id
          WHERE b.version_id = ${v.id}
        )
      `;
      vectorized++;
      if (vectorized % 25 === 0) {
        log(`  ${vectorized} versions vectorized...`);
      }
    }
    log(`  vectorized ${vectorized} versions, ${trigramOnly} on trigram path`);

    log("4/4 GIN indexes...");
    await sql`CREATE INDEX IF NOT EXISTS idx_verses_search_vector ON verses USING GIN (search_vector)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_verses_text_trgm ON verses USING GIN (text gin_trgm_ops)`;

    log("search infrastructure ready");
    return { vectorized, trigramOnly };
  } finally {
    await sql.end();
  }
}
