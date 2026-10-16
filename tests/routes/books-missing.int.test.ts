/**
 * The version book list reports chapter gaps, against a real Postgres. A mock
 * database cannot catch this: the first version of the query bound a bare
 * "id" to the wrong table and reported every chapter missing.
 *
 *   TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55432/postgres pnpm test
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../../src/db/run-migrations.js";

const ADMIN_URL = process.env.TEST_DATABASE_URL;
const suite = ADMIN_URL ? describe : describe.skip;
const DB = `eng_books_${Date.now()}`;
const quiet = () => {};

function urlFor(db: string): string {
  const u = new URL(ADMIN_URL!);
  u.pathname = `/${db}`;
  return u.toString();
}

suite("GET /api/v1/versions/{id}/books missingChapters", () => {
  let admin: postgres.Sql;
  let app: { request: (path: string) => Promise<Response> };
  let closeApp: () => Promise<void>;

  beforeAll(async () => {
    admin = postgres(ADMIN_URL!, { max: 1, onnotice: quiet });
    await admin.unsafe(`CREATE DATABASE ${DB}`);
    await runMigrations(urlFor(DB), quiet);

    const seed = postgres(urlFor(DB), { max: 1, onnotice: quiet });
    const [lang] = await seed`INSERT INTO languages (code, name) VALUES ('eng', 'English') RETURNING id`;
    const [v] = await seed`INSERT INTO versions (language_id, abbreviation, name) VALUES (${lang.id}, 'GAP', 'Gap Bible') RETURNING id`;
    const book = async (code: string, position: number, count: number, present: number[]) => {
      const [b] = await seed`
        INSERT INTO books (version_id, book_code, name, position, chapter_count, testament)
        VALUES (${v.id}, ${code}, ${code}, ${position}, ${count}, 'NT') RETURNING id`;
      for (const n of present) await seed`INSERT INTO chapters (book_id, number, verse_count) VALUES (${b.id}, ${n}, 1)`;
    };
    await book("MRK", 41, 6, [1, 3, 5]);
    await book("JHN", 43, 2, [1, 2]);
    await seed.end({ timeout: 5 });

    // The app reads DATABASE_URL when its client module loads.
    process.env.DATABASE_URL = urlFor(DB);
    ({ app } = await import("../../src/index.js"));
    const { queryClient } = await import("../../src/db/client.js");
    closeApp = () => queryClient.end({ timeout: 5 });
  });

  afterAll(async () => {
    await closeApp?.();
    await admin.unsafe(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
    await admin.end({ timeout: 5 });
  });

  it("lists the numbers in a book's range that have no chapter, and nothing for complete books", async () => {
    const res = await app.request("/api/v1/versions/GAP/books");
    expect(res.status).toBe(200);
    const { data } = await res.json();
    const byCode = Object.fromEntries(data.map((b: { bookCode: string; missingChapters: number[] }) => [b.bookCode, b.missingChapters]));
    expect(byCode).toEqual({ MRK: [2, 4, 6], JHN: [] });
  });
});
