import type { ParsedBook, ParsedChapter, ParsedVerse } from "./usfm-parser.js";

/**
 * Parse USX (XML) Bible content using regex.
 * Handles <book>, <para style="h">, <chapter>, and <verse> elements.
 */
export function parseUSX(content: string): ParsedBook {
  let bookCode = "";
  let bookName = "";
  const chapters: ParsedChapter[] = [];

  // Extract book code from <book code="XXX" ...>
  const bookMatch = content.match(/<book\s+code="([^"]+)"/);
  if (bookMatch) {
    bookCode = bookMatch[1].toUpperCase();
  }

  // Extract book name from <para style="h">Name</para>
  const nameMatch = content.match(/<para\s+style="h">\s*(.*?)\s*<\/para>/);
  if (nameMatch) {
    bookName = nameMatch[1].trim();
  }

  // Split content by chapter markers
  const chapterRegex = /<chapter\s+number="(\d+)"/g;
  const chapterPositions: { number: number; index: number }[] = [];
  let match: RegExpExecArray | null;

  while ((match = chapterRegex.exec(content)) !== null) {
    chapterPositions.push({
      number: parseInt(match[1], 10),
      index: match.index,
    });
  }

  for (let i = 0; i < chapterPositions.length; i++) {
    const start = chapterPositions[i].index;
    const end =
      i + 1 < chapterPositions.length
        ? chapterPositions[i + 1].index
        : content.length;
    const chapterContent = content.slice(start, end);

    const verses: ParsedVerse[] = [];

    // Find verse markers and extract text between them
    const verseRegex = /<verse\s+number="(\d+)"[^/]*\/>/g;
    const versePositions: { number: number; index: number; length: number }[] =
      [];
    let vMatch: RegExpExecArray | null;

    while ((vMatch = verseRegex.exec(chapterContent)) !== null) {
      versePositions.push({
        number: parseInt(vMatch[1], 10),
        index: vMatch.index + vMatch[0].length,
        length: vMatch[0].length,
      });
    }

    for (let j = 0; j < versePositions.length; j++) {
      const vStart = versePositions[j].index;
      const vEnd =
        j + 1 < versePositions.length
          ? versePositions[j + 1].index - versePositions[j + 1].length
          : chapterContent.length;

      let verseText = chapterContent.slice(vStart, vEnd);

      // Strip XML tags
      verseText = verseText.replace(/<[^>]+>/g, "");
      // Clean whitespace
      verseText = verseText.replace(/\s+/g, " ").trim();

      if (verseText) {
        verses.push({ number: versePositions[j].number, text: verseText });
      }
    }

    chapters.push({ number: chapterPositions[i].number, verses });
  }

  return { bookCode, bookName, chapters };
}
