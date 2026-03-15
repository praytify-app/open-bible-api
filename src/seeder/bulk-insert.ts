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
export async function seedVersion(options: SeedVersionOptions): Promise<void> {
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
  } = options;

  // 1. Upsert language
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

  // 2. Check version doesn't already exist
  const existingVersions = await db
    .select()
    .from(versions)
    .where(eq(versions.abbreviation, abbreviation))
    .limit(1);

  if (existingVersions.length > 0) {
    console.log(
      `Version "${abbreviation}" already exists, skipping.`
    );
    return;
  }

  // 3. Insert version, books, chapters, verses in a transaction
  let totalVerseCount = 0;

  const [version] = await db
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
      console.warn(
        `Skipping unknown book code: ${parsedBook.bookCode}`
      );
      continue;
    }

    const [book] = await db
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
      const [chapter] = await db
        .insert(chapters)
        .values({
          bookId: book.id,
          number: parsedChapter.number,
          verseCount: parsedChapter.verses.length,
        })
        .returning({ id: chapters.id });

      if (parsedChapter.verses.length > 0) {
        await db.insert(verses).values(
          parsedChapter.verses.map((v) => ({
            chapterId: chapter.id,
            number: v.number,
            text: v.text,
          }))
        );

        totalVerseCount += parsedChapter.verses.length;
      }
    }
  }

  // 4. search_vector is a GENERATED ALWAYS STORED column (created by migration),
  //    so it auto-populates from the 'text' column. No manual update needed.

  // 5. Update verse count on version
  await db
    .update(versions)
    .set({ verseCount: totalVerseCount })
    .where(eq(versions.id, versionId));

  console.log(
    `Seeded ${abbreviation}: ${parsedBooks.length} books, ${totalVerseCount} verses`
  );
}
