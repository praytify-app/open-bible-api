// Build full-text search infrastructure on an existing database. Idempotent
// and resumable — safe to re-run after a data restore or partial run.
//
// What it does:
//   1. CREATE EXTENSION pg_trgm (serves the ILIKE/similarity fallback path)
//   2. Ensure verses.search_vector is a plain tsvector column. A legacy
//      GENERATED column (old migrate.ts hardcoded 'english' for every
//      language) is dropped and replaced — generated columns cannot hold
//      per-language vectors.
//   3. Populate search_vector per version with the language-appropriate
//      dictionary from PG_DICTIONARIES. Languages without a PG dictionary
//      stay NULL: the search route serves them through the trigram path.
//   4. CREATE GIN indexes (search_vector + text trigram), after population
//      so index maintenance doesn't slow the bulk updates.
//
// New translations seeded after this ran need step 3 again for their rows;
// re-running the whole script does exactly that (WHERE search_vector IS NULL).
//
// Usage: DATABASE_URL=postgres://... npx tsx scripts/build-search-infra.ts
import postgres from "postgres";
import { getPgDictionary } from "../src/lib/pg-dictionaries.js";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

  console.log("1/4 extension...");
  await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`;

  console.log("2/4 search_vector column...");
  const [col] = await sql`
    SELECT is_generated FROM information_schema.columns
    WHERE table_name = 'verses' AND column_name = 'search_vector'
  `;
  if (col?.is_generated === "ALWAYS") {
    console.log("  dropping legacy generated column");
    await sql`ALTER TABLE verses DROP COLUMN search_vector`;
  }
  await sql`ALTER TABLE verses ADD COLUMN IF NOT EXISTS search_vector tsvector`;

  console.log("3/4 populating vectors per version...");
  const versionRows = await sql`
    SELECT v.id, v.abbreviation, l.code
    FROM versions v JOIN languages l ON v.language_id = l.id
    ORDER BY l.code, v.abbreviation
  `;
  let populated = 0;
  let skipped = 0;
  for (const v of versionRows) {
    const dict = getPgDictionary(v.code);
    if (dict === "simple") {
      skipped++;
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
    populated++;
    if (populated % 25 === 0) {
      console.log(`  ${populated} versions vectorized...`);
    }
  }
  console.log(`  vectorized ${populated} versions, ${skipped} on trigram path`);

  console.log("4/4 GIN indexes...");
  await sql`CREATE INDEX IF NOT EXISTS idx_verses_search_vector ON verses USING GIN (search_vector)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_verses_text_trgm ON verses USING GIN (text gin_trgm_ops)`;

  await sql.end();
  console.log("search infrastructure ready");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
