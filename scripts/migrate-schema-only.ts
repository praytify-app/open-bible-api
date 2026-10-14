// Drizzle schema migrations only. The search extras from src/db/migrate.ts
// (pg_trgm, search_vector column, GIN indexes) are intentionally skipped
// locally: they are built by scripts/build-search-infra.ts, which keeps the
// local seed fast and the dump small.
import { runMigrations } from "../src/db/run-migrations.js";

runMigrations(process.env.DATABASE_URL!).catch((err) => {
  console.error(err);
  process.exit(1);
});
