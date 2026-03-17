import { eq } from "drizzle-orm";
import type { ParsedBook } from "./usfm-parser.js";
import { getBookMeta } from "./book-metadata.js";
import {
  languages,
  versions,
  books,
  chapters,
  verses,
} from "../db/schema.js";
import { db } from "../db/client.js";

export interface SeedVersionOptions {
  /** Parsed books from Bible files */
  parsedBooks: ParsedBook[];
  /** ISO 639-3 language code (e.g. "eng") */
  languageCode: string;
  /** Language name in English */
  languageName: string;
  /** Language name in native script */
  languageNativeName?: string;
  /** Script system (e.g. "Latin", "Cyrillic") */
  languageScript?: string;
  /** Text direction: "ltr" or "rtl" */
  languageDirection?: string;
  /** Version abbreviation (e.g. "KJV") */
  abbreviation: string;
  /** Full version name */
  name: string;
  /** License information */
  license?: string;
  /** Source URL */
  sourceUrl?: string;
  /** Attribution text (e.g. copyright holder) */
  attribution?: string;
  /** Attribution URL */
  attributionUrl?: string;
  /** License type: PD, CC_BY, CC_BY_SA, OTHER */
  licenseType?: string;
}

/**
 * Seed a complete Bible version into the database.
 *
 * 1. Upserts language
 * 2. Checks version doesn't already exist
 * 3. Inserts version, books, chapters, verses in a transaction
 * 4. Builds tsvector search index using PG_DICTIONARIES map
 * 5. Updates verse count on the version
 */
export async function seedVersion(options: SeedVersionOptions & { force?: boolean }): Promise<void> {
  const {
    parsedBooks,
    languageCode,
    languageName,
    languageNativeName,
    languageScript,
    languageDirection = "ltr",
    abbreviation,
    name,
    license,
    sourceUrl,
    attribution,
    attributionUrl,
    licenseType,
    force = false,
  } = options;

  // 1. Upsert language (intentionally outside transaction — idempotent, shared across versions)
  const existingLangs = await db
    .select()
    .from(languages)
    .where(eq(languages.code, languageCode))
    .limit(1);

  let languageId: string;

  if (existingLangs.length > 0) {
    languageId = existingLangs[0].id;
  } else {
    const [inserted] = await db
      .insert(languages)
      .values({
        code: languageCode,
        name: languageName,
        nativeName: languageNativeName ?? null,
        script: languageScript ?? null,
        direction: languageDirection,
      })
      .returning({ id: languages.id });
    languageId = inserted.id;
  }

  // 2. Check version doesn't already exist (unless force mode)
  const existingVersions = await db
    .select()
    .from(versions)
    .where(eq(versions.abbreviation, abbreviation))
    .limit(1);

  if (existingVersions.length > 0) {
    if (!force) {
      console.log(`Version "${abbreviation}" already exists, skipping.`);
      return;
    }
    // Force mode: delete existing version (cascades to books/chapters/verses)
    console.log(`Force mode: deleting existing "${abbreviation}" before re-import...`);
    await db.delete(versions).where(eq(versions.id, existingVersions[0].id));
  }

  // 3. Insert version + all books/chapters/verses inside a transaction
  let totalVerseCount = 0;

  await db.transaction(async (tx) => {
    const [version] = await tx
      .insert(versions)
      .values({
        languageId,
        abbreviation,
        name,
        license: license ?? null,
        sourceUrl: sourceUrl ?? null,
        attribution: attribution ?? null,
        attributionUrl: attributionUrl ?? null,
        licenseType: licenseType ?? "PD",
        verseCount: 0,
      })
      .returning({ id: versions.id });

    const versionId = version.id;

    for (const parsedBook of parsedBooks) {
      const meta = getBookMeta(parsedBook.bookCode);
      if (!meta) {
        console.warn(`Skipping unknown book code: ${parsedBook.bookCode}`);
        continue;
      }

      const [book] = await tx
        .insert(books)
        .values({
          versionId,
          bookCode: meta.code,
          name: parsedBook.bookName || meta.englishName,
          position: meta.position,
          chapterCount: parsedBook.chapters.length,
          testament: meta.testament,
        })
        .returning({ id: books.id });

      for (const parsedChapter of parsedBook.chapters) {
        const [chapter] = await tx
          .insert(chapters)
          .values({
            bookId: book.id,
            number: parsedChapter.number,
            verseCount: parsedChapter.verses.length,
          })
          .returning({ id: chapters.id });

        // Chunk verse inserts at 500 rows to avoid query size limits
        if (parsedChapter.verses.length > 0) {
          const verseRows = parsedChapter.verses.map((v) => ({
            chapterId: chapter.id,
            number: v.number,
            text: v.text,
          }));

          for (let i = 0; i < verseRows.length; i += 500) {
            const chunk = verseRows.slice(i, i + 500);
            await tx.insert(verses).values(chunk);
          }

          totalVerseCount += parsedChapter.verses.length;
        }
      }
    }

    // Update verse count on version
    await tx
      .update(versions)
      .set({ verseCount: totalVerseCount })
      .where(eq(versions.id, versionId));
  });

  console.log(
    `Seeded ${abbreviation}: ${parsedBooks.length} books, ${totalVerseCount} verses`
  );
}
