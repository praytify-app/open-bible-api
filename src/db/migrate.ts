import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { sql } from "drizzle-orm";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("DATABASE_URL environment variable is required");
  process.exit(1);
}

async function main() {
  const migrationClient = postgres(connectionString!, { max: 1 });
  const db = drizzle(migrationClient);

  console.log("Running migrations...");

  await migrate(db, { migrationsFolder: "./drizzle" });

  console.log("Migrations complete. Setting up extensions and indexes...");

  // Create pg_trgm extension for fuzzy text search
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

  // Plain (not generated) search_vector column: vectors use the language-
  // appropriate dictionary per version, which a generated expression cannot
  // do. Population happens in scripts/build-search-infra.ts after seeding.
  await db.execute(sql`
    ALTER TABLE verses ADD COLUMN IF NOT EXISTS search_vector tsvector
  `);

  // Create GIN indexes for full-text search
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_verses_search_vector
    ON verses USING GIN (search_vector)
  `);

  // Create trigram index for fuzzy matching
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_verses_text_trgm
    ON verses USING GIN (text gin_trgm_ops)
  `);

  console.log("Extensions and indexes created successfully.");

  await migrationClient.end();
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
