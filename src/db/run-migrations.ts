import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// Explicit values equal to drizzle's defaults, so databases migrated before
// this was set keep their history. Spelled out so a drizzle default change
// cannot silently point us at an empty journal and replay every migration.
export const MIGRATIONS_TABLE = "__drizzle_migrations";
export const MIGRATIONS_SCHEMA = "drizzle";

// Resolved from this file rather than the working directory, so the same
// path works from src/ under tsx and from dist/ in the container.
const MIGRATIONS_FOLDER = fileURLToPath(new URL("../../drizzle", import.meta.url));

// The gateway shares this Postgres cluster and runs its own migrations, so
// the lock key is namespaced to this service rather than a bare integer.
const LOCK_NAME = "open-bible-api:migrations";

/**
 * Apply pending drizzle migrations while holding a session advisory lock.
 *
 * Two replicas booting together would otherwise both read an unapplied
 * journal and race to run the same DDL. The second waits on the lock, then
 * finds nothing to do.
 */
export async function runMigrations(
  connectionString: string,
  log: (message: string) => void = console.log
): Promise<void> {
  // max: 1 pins the lock, the migration, and the unlock to one session.
  const client = postgres(connectionString, { max: 1, onnotice: () => {} });

  try {
    log("Waiting for migration lock...");
    await client`SELECT pg_advisory_lock(hashtextextended(${LOCK_NAME}, 0))`;
    try {
      log("Applying migrations...");
      await migrate(drizzle(client), {
        migrationsFolder: MIGRATIONS_FOLDER,
        migrationsTable: MIGRATIONS_TABLE,
        migrationsSchema: MIGRATIONS_SCHEMA,
      });
      log("Migrations up to date.");
    } finally {
      await client`SELECT pg_advisory_unlock(hashtextextended(${LOCK_NAME}, 0))`;
    }
  } finally {
    await client.end();
  }
}
