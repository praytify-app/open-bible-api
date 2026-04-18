// src/seeder/sources/esv.ts

import { fetchPassageText, type EsvClientOptions } from "../../services/esv-client.js";
import { parseEsvPassage } from "../../services/esv-parser.js";
import { BOOK_METADATA } from "../book-metadata.js";
import type { ParsedBook, ParsedChapter, ParsedVerse } from "../usfm-parser.js";

// Re-export the ParsedBook type structure for reference.
// The actual type comes from usfm-parser.ts but we match its shape.

// Chapter counts for the 66-book Protestant canon
const CHAPTER_COUNTS: Record<string, number> = {
  GEN: 50, EXO: 40, LEV: 27, NUM: 36, DEU: 34, JOS: 24, JDG: 21, RUT: 4,
  "1SA": 31, "2SA": 24, "1KI": 22, "2KI": 25, "1CH": 29, "2CH": 36,
  EZR: 10, NEH: 13, EST: 10, JOB: 42, PSA: 150, PRO: 31, ECC: 12, SNG: 8,
  ISA: 66, JER: 52, LAM: 5, EZK: 48, DAN: 12, HOS: 14, JOL: 3, AMO: 9,
  OBA: 1, JON: 4, MIC: 7, NAM: 3, HAB: 3, ZEP: 3, HAG: 2, ZEC: 14, MAL: 4,
  MAT: 28, MRK: 16, LUK: 24, JHN: 21, ACT: 28, ROM: 16, "1CO": 16, "2CO": 13,
  GAL: 6, EPH: 6, PHP: 4, COL: 4, "1TH": 5, "2TH": 3, "1TI": 6, "2TI": 4,
  TIT: 3, PHM: 1, HEB: 13, JAS: 5, "1PE": 5, "2PE": 3, "1JN": 5, "2JN": 1,
  "3JN": 1, JUD: 1, REV: 22,
};

// Map our book codes to ESV-friendly book names for API queries
const BOOK_NAMES: Record<string, string> = {
  GEN: "Genesis", EXO: "Exodus", LEV: "Leviticus", NUM: "Numbers",
  DEU: "Deuteronomy", JOS: "Joshua", JDG: "Judges", RUT: "Ruth",
  "1SA": "1 Samuel", "2SA": "2 Samuel", "1KI": "1 Kings", "2KI": "2 Kings",
  "1CH": "1 Chronicles", "2CH": "2 Chronicles", EZR: "Ezra", NEH: "Nehemiah",
  EST: "Esther", JOB: "Job", PSA: "Psalm", PRO: "Proverbs",
  ECC: "Ecclesiastes", SNG: "Song of Solomon", ISA: "Isaiah", JER: "Jeremiah",
  LAM: "Lamentations", EZK: "Ezekiel", DAN: "Daniel", HOS: "Hosea",
  JOL: "Joel", AMO: "Amos", OBA: "Obadiah", JON: "Jonah", MIC: "Micah",
  NAM: "Nahum", HAB: "Habakkuk", ZEP: "Zephaniah", HAG: "Haggai",
  ZEC: "Zechariah", MAL: "Malachi", MAT: "Matthew", MRK: "Mark",
  LUK: "Luke", JHN: "John", ACT: "Acts", ROM: "Romans",
  "1CO": "1 Corinthians", "2CO": "2 Corinthians", GAL: "Galatians",
  EPH: "Ephesians", PHP: "Philippians", COL: "Colossians",
  "1TH": "1 Thessalonians", "2TH": "2 Thessalonians",
  "1TI": "1 Timothy", "2TI": "2 Timothy", TIT: "Titus", PHM: "Philemon",
  HEB: "Hebrews", JAS: "James", "1PE": "1 Peter", "2PE": "2 Peter",
  "1JN": "1 John", "2JN": "2 John", "3JN": "3 John", JUD: "Jude",
  REV: "Revelation",
};

export interface EsvSeederProgress {
  booksCompleted: number;
  totalBooks: number;
  chaptersCompleted: number;
  totalChapters: number;
  currentBook: string;
}

/**
 * Fetch all ESV chapters from the Crossway API and return ParsedBook[]
 * compatible with the existing seedVersion bulk-insert infrastructure.
 */
export async function fetchAllEsvChapters(
  apiToken: string,
  onProgress?: (progress: EsvSeederProgress) => void,
  startFromBook?: string,
) : Promise<ParsedBook[]> {
  const options: EsvClientOptions = { apiToken, requestDelayMs: 1100 };
  const books: ParsedBook[] = [];
  const totalChapters = Object.values(CHAPTER_COUNTS).reduce((a, b) => a + b, 0);
  let chaptersCompleted = 0;
  let started = !startFromBook;

  for (const meta of BOOK_METADATA) {
    if (!started) {
      if (meta.code === startFromBook) started = true;
      else continue;
    }

    const chapterCount = CHAPTER_COUNTS[meta.code];
    if (!chapterCount) {
      console.warn(`No chapter count for ${meta.code}, skipping`);
      continue;
    }

    const bookName = BOOK_NAMES[meta.code] ?? meta.englishName;
    const parsedChapters: ParsedChapter[] = [];

    for (let ch = 1; ch <= chapterCount; ch++) {
      const reference = `${bookName} ${ch}`;
      try {
        const response = await fetchPassageText(reference, options);
        const passageText = response.passages[0] ?? "";
        const verses = parseEsvPassage(passageText);
        const parsedVerses: ParsedVerse[] = verses.map((v) => ({
          number: v.number,
          text: v.text,
        }));

        parsedChapters.push({
          number: ch,
          verses: parsedVerses,
        });

        chaptersCompleted++;
        if (onProgress) {
          onProgress({
            booksCompleted: books.length,
            totalBooks: BOOK_METADATA.length,
            chaptersCompleted,
            totalChapters,
            currentBook: `${bookName} ${ch}`,
          });
        }
      } catch (err) {
        console.error(`Failed to fetch ${reference}:`, err);
        throw err;
      }
    }

    books.push({ bookCode: meta.code, bookName, chapters: parsedChapters });
  }

  return books;
}

export { CHAPTER_COUNTS, BOOK_NAMES };
