import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { prepared } from "../db/prepared.js";
import { db } from "../db/client.js";
import { books, chapters, languages, verses, versions } from "../db/schema.js";
import { resolveBook } from "./book-names.js";
import type { ParsedReference } from "./reference-parser.js";
import { cleanVerseText } from "./text-cleaner.js";
import { canonicalizeVersionAbbreviation } from "./version-abbreviations.js";
import { pickVersion, versionCode, versionMatchParams, versionMatchSql } from "./version-lookup.js";

/** Licensing and display facts every scripture payload carries, read from the version row. */
export interface VersionMeta {
  id: string;
  abbreviation: string;
  /** Stable URL-safe code (the eBible translation id), or null for versions from other sources. */
  code: string | null;
  name: string;
  license: string | null;
  licenseType: string;
  attribution: string | null;
  attributionUrl: string | null;
  languageCode: string | null;
  textDirection: string | null;
}

export interface BookRow {
  id: string;
  bookCode: string;
  name: string;
  position: number;
  chapterCount: number;
  testament: string;
}

export interface VersionWithBooks {
  version: VersionMeta;
  books: BookRow[];
}

export interface PassageVerse {
  id: number;
  number: number;
  text: string;
}

export interface Passage {
  reference: string;
  version: string;
  verses: PassageVerse[];
  bookCode: string;
  bookName: string;
  chapter: number;
  verseStart: number;
  verseEnd: number;
  license: string | null;
  attribution: string | null;
  attributionUrl: string | null;
  languageCode: string | null;
  textDirection: string | null;
}

export const versionMetaColumns = {
  id: versions.id,
  abbreviation: versions.abbreviation,
  name: versions.name,
  license: versions.license,
  licenseType: versions.licenseType,
  attribution: versions.attribution,
  attributionUrl: versions.attributionUrl,
  languageCode: languages.code,
  textDirection: languages.direction,
  sourceUrl: versions.sourceUrl,
};

/** A row selected with versionMetaColumns. */
export type VersionMetaRow = Omit<VersionMeta, "code"> & { sourceUrl: string | null };

export function toVersionMeta(row: VersionMetaRow): VersionMeta {
  const { sourceUrl, ...rest } = row;
  return { ...rest, abbreviation: canonicalizeVersionAbbreviation(row.abbreviation), code: versionCode(sourceUrl) };
}

/**
 * Load several versions and their book lists in one query, keyed by the
 * code each caller asked for. Codes that match nothing are absent.
 */
// Every ?ref= lookup and daily verse runs these, so they are prepared once
// rather than rebuilt per request (see the note in routes/chapters.ts).
const versionsWithBooksQuery = prepared(() =>
  db
    .select({
      version: versionMetaColumns,
      book: {
        id: books.id,
        bookCode: books.bookCode,
        name: books.name,
        position: books.position,
        chapterCount: books.chapterCount,
        testament: books.testament,
      },
    })
    .from(versions)
    .leftJoin(languages, eq(versions.languageId, languages.id))
    .leftJoin(books, eq(books.versionId, versions.id))
    .where(versionMatchSql)
    .orderBy(asc(books.position))
    .prepare("versions_with_books")
);

const passageVerseColumns = { id: verses.id, number: verses.number, text: verses.text };
const chapterOfBook = and(eq(chapters.bookId, sql.placeholder("bookId")), eq(chapters.number, sql.placeholder("chapter")));

const wholeChapterQuery = prepared(() =>
  db
    .select(passageVerseColumns)
    .from(verses)
    .innerJoin(chapters, eq(verses.chapterId, chapters.id))
    .where(chapterOfBook)
    .orderBy(asc(verses.number))
    .prepare("passage_chapter")
);

const verseRangeQuery = prepared(() =>
  db
    .select(passageVerseColumns)
    .from(verses)
    .innerJoin(chapters, eq(verses.chapterId, chapters.id))
    .where(and(chapterOfBook, gte(verses.number, sql.placeholder("verseStart")), lte(verses.number, sql.placeholder("verseEnd"))))
    .orderBy(asc(verses.number))
    .prepare("passage_range")
);

export async function loadVersionsWithBooks(codes: string[]): Promise<Map<string, VersionWithBooks>> {
  const rows = await versionsWithBooksQuery().execute(versionMatchParams(codes));

  const byId = new Map<string, { key: { abbreviation: string; sourceUrl: string | null }; entry: VersionWithBooks }>();
  for (const row of rows) {
    let found = byId.get(row.version.id);
    if (!found) {
      found = {
        key: { abbreviation: row.version.abbreviation, sourceUrl: row.version.sourceUrl },
        entry: { version: toVersionMeta(row.version), books: [] },
      };
      byId.set(row.version.id, found);
    }
    if (row.book?.id) found.entry.books.push(row.book as BookRow);
  }

  const candidates = [...byId.values()];
  const result = new Map<string, VersionWithBooks>();
  for (const code of codes) {
    const match = pickVersion(candidates, code, (c) => c.key);
    if (match) result.set(code, match.entry);
  }
  return result;
}

/** Verses of one chapter, optionally narrowed to a range, in a single indexed join. */
export async function loadChapterVerses(
  bookId: string,
  chapter: number,
  verseStart?: number,
  verseEnd?: number
): Promise<PassageVerse[]> {
  const rows =
    verseStart === undefined
      ? await wholeChapterQuery().execute({ bookId, chapter })
      : await verseRangeQuery().execute({ bookId, chapter, verseStart, verseEnd: verseEnd ?? verseStart });

  return rows.map((r) => ({ ...r, text: cleanVerseText(r.text) }));
}

export type PassageResult = { ok: true; passage: Passage } | { ok: false; message: string };

/** Resolve a parsed reference inside one loaded version and fetch its verses. */
export async function loadPassage(
  reference: string,
  parsed: ParsedReference,
  loaded: VersionWithBooks
): Promise<PassageResult> {
  const { version, books: bookList } = loaded;
  const book = resolveBook(parsed.book, bookList);
  if (!book) {
    return { ok: false, message: `Book '${parsed.book}' not found in ${version.abbreviation}` };
  }
  const verseRows = await loadChapterVerses(book.id, parsed.chapter, parsed.verseStart, parsed.verseEnd);
  if (verseRows.length === 0) {
    const where = parsed.verseStart !== undefined ? `${parsed.chapter}:${parsed.verseStart}` : `${parsed.chapter}`;
    return { ok: false, message: `${book.name} ${where} not found in ${version.abbreviation}` };
  }

  return {
    ok: true,
    passage: {
      reference,
      version: version.abbreviation,
      verses: verseRows,
      bookCode: book.bookCode,
      bookName: book.name,
      chapter: parsed.chapter,
      verseStart: verseRows[0].number,
      verseEnd: verseRows[verseRows.length - 1].number,
      license: version.license,
      attribution: version.attribution,
      attributionUrl: version.attributionUrl,
      languageCode: version.languageCode,
      textDirection: version.textDirection,
    },
  };
}
