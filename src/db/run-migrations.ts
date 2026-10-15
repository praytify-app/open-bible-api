import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
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
 * How to tell that a migration's changes are already in a database that was
 * restored from a dump (production's data refreshes are pg_dump restores) and
 * so carries the tables but no migration journal. Only migrations listed here
 * can be baselined; anything newer is applied normally.
 */
const BASELINE_MARKERS: Record<string, string> = {
  "0000_brown_sleepwalker": "SELECT to_regclass('public.versions') IS NOT NULL AS present",
  "0001_brief_meteorite": `SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'versions' AND column_name = 'license_type'
    ) AS present`,
};

interface JournalEntry {
  idx: number;
  tag: string;
  when: number;
}

/**
 * Record migrations whose changes a restored database already has, so the
 * migrator does not try to recreate existing tables. Runs only when the
 * engine's tables exist and its journal is empty.
 */
async function baselineRestoredSchema(client: postgres.Sql, log: (message: string) => void): Promise<void> {
  const [state] = await client`
    SELECT to_regclass('public.versions') IS NOT NULL AS has_tables,
           to_regclass(${`${MIGRATIONS_SCHEMA}.${MIGRATIONS_TABLE}`}) IS NOT NULL AS has_journal
  `;
  if (!state?.has_tables) return;
  if (state.has_journal) {
    const [{ n }] = await client.unsafe(`SELECT COUNT(*)::int AS n FROM "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}"`);
    if (n > 0) return;
  }

  const journal = JSON.parse(await readFile(join(MIGRATIONS_FOLDER, "meta", "_journal.json"), "utf8")) as {
    entries: JournalEntry[];
  };
  const present: JournalEntry[] = [];
  for (const entry of [...journal.entries].sort((a, b) => a.idx - b.idx)) {
    const marker = BASELINE_MARKERS[entry.tag];
    if (!marker) break;
    const [row] = await client.unsafe(marker);
    if (!row?.present) break;
    present.push(entry);
  }
  if (present.length === 0) return;

  await client.unsafe(`CREATE SCHEMA IF NOT EXISTS "${MIGRATIONS_SCHEMA}"`);
  await client.unsafe(
    `CREATE TABLE IF NOT EXISTS "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)`
  );
  for (const entry of present) {
    const query = await readFile(join(MIGRATIONS_FOLDER, `${entry.tag}.sql`), "utf8");
    const hash = createHash("sha256").update(query).digest("hex");
    await client.unsafe(`INSERT INTO "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}" (hash, created_at) VALUES ($1, $2)`, [
      hash,
      entry.when,
    ]);
  }
  log(`Baselined restored schema at ${present.map((e) => e.tag).join(", ")}.`);
}

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
      await baselineRestoredSchema(client, log);
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
