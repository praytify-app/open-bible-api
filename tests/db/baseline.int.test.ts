/**
 * Proves runMigrations boots against a database restored from a dump (tables
 * present, no migration journal) as well as a fresh one. Needs a Postgres the
 * test may create databases on:
 *
 *   TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55432/postgres pnpm test
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../../src/db/run-migrations.js";

const ADMIN_URL = process.env.TEST_DATABASE_URL;
const suite = ADMIN_URL ? describe : describe.skip;
const stamp = Date.now();
const DBS = { fresh: `eng_fresh_${stamp}`, restored: `eng_restored_${stamp}`, older: `eng_older_${stamp}` };
const FOLDER = join(process.cwd(), "drizzle");
const quiet = () => {};

function urlFor(db: string): string {
  const u = new URL(ADMIN_URL!);
  u.pathname = `/${db}`;
  return u.toString();
}

async function applyFile(db: string, file: string): Promise<void> {
  const sql = postgres(urlFor(db), { max: 1, onnotice: quiet });
  try {
    const text = await readFile(join(FOLDER, file), "utf8");
    for (const stmt of text.split("--> statement-breakpoint")) if (stmt.trim()) await sql.unsafe(stmt);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function journalCount(db: string): Promise<number> {
  const sql = postgres(urlFor(db), { max: 1, onnotice: quiet });
  try {
    const [row] = await sql`SELECT COUNT(*)::int AS n FROM drizzle.__drizzle_migrations`;
    return row!.n;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

suite("migrations on fresh and restored databases", () => {
  let admin: postgres.Sql;

  beforeAll(async () => {
    admin = postgres(ADMIN_URL!, { max: 1, onnotice: quiet });
    for (const db of Object.values(DBS)) await admin.unsafe(`CREATE DATABASE ${db}`);
  });

  afterAll(async () => {
    for (const db of Object.values(DBS)) await admin.unsafe(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`);
    await admin.end({ timeout: 5 });
  });

  it("migrates a fresh database and records every migration", async () => {
    await runMigrations(urlFor(DBS.fresh), quiet);
    expect(await journalCount(DBS.fresh)).toBe(2);
  });

  it("boots on a full restore without trying to recreate existing tables", async () => {
    await applyFile(DBS.restored, "0000_brown_sleepwalker.sql");
    await applyFile(DBS.restored, "0001_brief_meteorite.sql");
    const logs: string[] = [];
    await runMigrations(urlFor(DBS.restored), (m) => logs.push(m));
    expect(logs.some((m) => m.includes("Baselined restored schema at 0000_brown_sleepwalker, 0001_brief_meteorite"))).toBe(true);
    expect(await journalCount(DBS.restored)).toBe(2);
    // Safe to run again.
    await runMigrations(urlFor(DBS.restored), quiet);
    expect(await journalCount(DBS.restored)).toBe(2);
  });

  it("baselines what a restore has and applies the rest", async () => {
    await applyFile(DBS.older, "0000_brown_sleepwalker.sql");
    await runMigrations(urlFor(DBS.older), quiet);
    expect(await journalCount(DBS.older)).toBe(2);
    const sql = postgres(urlFor(DBS.older), { max: 1, onnotice: quiet });
    try {
      const cols = await sql`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'versions' AND column_name IN ('license_type', 'has_audio', 'attribution')
      `;
      expect(cols).toHaveLength(3);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });
});
