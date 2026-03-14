export interface ParsedVerse {
  number: number;
  text: string;
}

export interface ParsedChapter {
  number: number;
  verses: ParsedVerse[];
}

export interface ParsedBook {
  bookCode: string;
  bookName: string;
  chapters: ParsedChapter[];
}

/**
 * Parse USFM (Unified Standard Format Markers) Bible content.
 * Handles \id, \h, \c, \v markers and strips formatting markers
 * like \p, \q, \b, \f, \x, \wj, etc.
 */
export function parseUSFM(content: string): ParsedBook {
  let bookCode = "";
  let bookName = "";
  const chapters: ParsedChapter[] = [];
  let currentChapter: ParsedChapter | null = null;

  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // \id marker — extract book code
    const idMatch = trimmed.match(/^\\id\s+(\S+)/);
    if (idMatch) {
      bookCode = idMatch[1].toUpperCase();
      continue;
    }

    // \h marker — extract book name
    const hMatch = trimmed.match(/^\\h\s+(.+)/);
    if (hMatch) {
      bookName = hMatch[1].trim();
      continue;
    }

    // \c marker — new chapter
    const cMatch = trimmed.match(/^\\c\s+(\d+)/);
    if (cMatch) {
      currentChapter = { number: parseInt(cMatch[1], 10), verses: [] };
      chapters.push(currentChapter);
      continue;
    }

    // \v marker — verse(s) on this line
    if (trimmed.startsWith("\\v ") && currentChapter) {
      // A line may contain multiple \v markers (rare but possible)
      const verseSegments = trimmed.split(/(?=\\v\s+\d+\s)/);
      for (const segment of verseSegments) {
        const vMatch = segment.match(/^\\v\s+(\d+)\s+(.*)/);
        if (vMatch) {
          const verseNumber = parseInt(vMatch[1], 10);
          const verseText = stripMarkers(vMatch[2]);
          if (verseText) {
            currentChapter.verses.push({ number: verseNumber, text: verseText });
          }
        }
      }
      continue;
    }

    // Skip all other markers (\p, \q, \b, \toc, \mt, etc.)
  }

  return { bookCode, bookName, chapters };
}

/**
 * Strip USFM inline markers from verse text.
 * Removes markers like \f ...\f*, \x ...\x*, \wj ...\wj*, \add ...\add*,
 * \nd ...\nd*, \+w ...\+w*, etc. Preserves the text content within.
 */
function stripMarkers(text: string): string {
  let result = text;

  // Remove footnotes and cross-references entirely (content between \f ... \f* and \x ... \x*)
  result = result.replace(/\\f\s.*?\\f\*/g, "");
  result = result.replace(/\\x\s.*?\\x\*/g, "");

  // Remove closing markers like \wj*, \add*, \nd*, etc.
  result = result.replace(/\\\+?\w+\*/g, "");

  // Remove opening inline markers like \wj, \add, \nd, \+w, etc.
  // These are followed by a space and text content we want to keep
  result = result.replace(/\\\+?\w+\s?/g, "");

  // Clean up extra whitespace
  result = result.replace(/\s+/g, " ").trim();

  return result;
}
