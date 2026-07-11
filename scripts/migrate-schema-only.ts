// Drizzle schema migrations only. The search extras from src/db/migrate.ts
// (pg_trgm, generated search_vector column, GIN indexes) are intentionally
// skipped locally: they are built once on prod after restore, which keeps
// the local seed fast and the dump small.
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

async function main() {
  const client = postgres(process.env.DATABASE_URL!, { max: 1 });
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  console.log("drizzle migrations complete");
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
