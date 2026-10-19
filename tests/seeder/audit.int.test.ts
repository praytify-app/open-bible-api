/**
 * auditData against a real Postgres seeded with the problems it reports.
 * Needs a Postgres the test may create databases on:
 *
 *   TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55432/postgres pnpm test
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../../src/db/run-migrations.js";
import { auditData } from "../../src/seeder/audit.js";

const ADMIN_URL = process.env.TEST_DATABASE_URL;
const suite = ADMIN_URL ? describe : describe.skip;
const DB = `eng_audit_${Date.now()}`;
const quiet = () => {};

function urlFor(db: string): string {
  const u = new URL(ADMIN_URL!);
  u.pathname = `/${db}`;
  return u.toString();
}

suite("auditData", () => {
  let admin: postgres.Sql;
  let client: postgres.Sql;

  beforeAll(async () => {
    admin = postgres(ADMIN_URL!, { max: 1, onnotice: quiet });
    await admin.unsafe(`CREATE DATABASE ${DB}`);
    await runMigrations(urlFor(DB), quiet);
    client = postgres(urlFor(DB), { max: 1, onnotice: quiet });

    const [lang] = await client`INSERT INTO languages (code, name) VALUES ('eng', 'English') RETURNING id`;
    const version = async (abbreviation: string, sourceUrl: string | null) => {
      const [v] = await client`
        INSERT INTO versions (language_id, abbreviation, name, source_url)
        VALUES (${lang.id}, ${abbreviation}, ${abbreviation}, ${sourceUrl}) RETURNING id`;
      const [book] = await client`
        INSERT INTO books (version_id, book_code, name, position, chapter_count, testament)
        VALUES (${v.id}, 'JHN', 'John', 43, 2, 'NT') RETURNING id`;
      return book.id as string;
    };
    const chapter = async (bookId: string, number: number, verseTexts: string[]) => {
      const [c] = await client`
        INSERT INTO chapters (book_id, number, verse_count) VALUES (${bookId}, ${number}, ${verseTexts.length}) RETURNING id`;
      for (const [i, text] of verseTexts.entries()) {
        await client`INSERT INTO verses (chapter_id, number, text) VALUES (${c.id}, ${i + 1}, ${text})`;
      }
    };

    // Clean: short abbreviation, both chapters filled.
    const web = await version("WEB", "https://ebible.org/Scriptures/engwebp_usfm.zip");
    await chapter(web, 1, ["In the beginning was the Word"]);
    await chapter(web, 2, ["On the third day"]);
    // A title for an abbreviation, with an eBible code, and one empty chapter.
    const titled = await version(" World Messianic Bible", "https://ebible.org/Scriptures/engwmb_usfm.zip");
    await chapter(titled, 1, ["In the beginning"]);
    await chapter(titled, 2, []);
    // A partial book stored with a chapter count instead of its highest number:
    // only Isaiah 41 exists, so a count of 1 hides it from readers.
    const [partial] = await client`
      INSERT INTO books (version_id, book_code, name, position, chapter_count, testament)
      SELECT version_id, 'ISA', 'Isaiah', 23, 1, 'OT' FROM books WHERE id = ${titled} RETURNING id`;
    await chapter(partial.id, 41, ["Keep silence before me"]);
    // A slash, and no code to fall back on.
    const slashed = await version("Bible/Testament", null);
    await chapter(slashed, 1, []);
  });

  afterAll(async () => {
    await client?.end({ timeout: 5 });
    await admin.unsafe(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
    await admin.end({ timeout: 5 });
  });

  it("finds empty chapters per version, with codes and samples", async () => {
    const report = await auditData(drizzle(client));
    expect(report.versions).toBe(3);
    expect(report.emptyChapters.total).toBe(2);
    expect(report.emptyChapters.byVersion).toHaveLength(2);
    expect(report.emptyChapters.byVersion).toEqual(
      expect.arrayContaining([
        { abbreviation: " World Messianic Bible", code: "engwmb", count: 1, sample: ["JHN 2"] },
        { abbreviation: "Bible/Testament", code: null, count: 1, sample: ["JHN 1"] },
      ])
    );
  });

  it("finds books whose highest chapter is above their stored count", async () => {
    const report = await auditData(drizzle(client));
    expect(report.countBelowHighest).toEqual({
      books: 1,
      hiddenChapters: 1,
      byVersion: [{ abbreviation: " World Messianic Bible", code: "engwmb", books: 1, sample: ["ISA 1 < 41"] }],
    });
  });

  it("lists abbreviations that need a code in URLs, and the ones that have none", async () => {
    const report = await auditData(drizzle(client));
    // Order follows the database collation, which differs between machines.
    expect(report.unsafeAbbreviations).toHaveLength(2);
    expect(report.unsafeAbbreviations).toEqual(
      expect.arrayContaining([
        { abbreviation: " World Messianic Bible", code: "engwmb" },
        { abbreviation: "Bible/Testament", code: null },
      ])
    );
    expect(report.unaddressable).toEqual(["Bible/Testament"]);
  });
});
