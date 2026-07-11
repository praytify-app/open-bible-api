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
 * Paragraph and poetry markers whose trailing text is canonical scripture
 * belonging to the verse that is currently open. USFM wraps poetry as:
 *
 *   \q1
 *   \v 2 He maketh me to lie down in green pastures;
 *   \q1 He leadeth me beside still waters.
 *
 * The second \q1 line is a continuation of verse 2, not a new marker to
 * discard. Dropping these lines silently truncates every multi-line verse
 * in Psalms, Proverbs, Job, and most prophets.
 */
const CONTINUATION_MARKER =
  /^\\(?:q[1-4]?|qr|qc|qm[1-3]?|qd|p|m|po|pr|cls|pmo|pm|pmc|pmr|pi[1-3]?|mi|nb|pc|ph[1-3]?|li[1-4]?|lh|lf|lim[1-4]?)(?:\s+(.*))?$/;

/**
 * Heading-like markers (section heads, Psalm superscriptions, speaker
 * labels, etc.). Their text is not verse content, and any continuation
 * line after them belongs to no verse until the next \v.
 */
const HEADING_MARKER =
  /^\\(?:d|s[1-4]?|sr|r|sp|ms[1-4]?|mr|sd[1-4]?|qa|cl|cp|cd|mt[1-4]?|mte|is[1-2]?|ip|ib|rem|toc[1-3]|toca[1-3])(?:\s|$)/;

/**
 * Parse USFM (Unified Standard Format Markers) Bible content.
 * Handles \id, \h, \c, \v markers, joins poetry/paragraph continuation
 * lines into their verse, and strips inline formatting markers.
 */
export function parseUSFM(content: string): ParsedBook {
  let bookCode = "";
  let bookName = "";
  const chapters: ParsedChapter[] = [];
  let currentChapter: ParsedChapter | null = null;
  let currentVerse: ParsedVerse | null = null;

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

    // \c marker — new chapter. A repeated chapter number (seen in some
    // Septuagint-derived files) continues the existing chapter instead of
    // duplicating it, which would violate the (book, number) unique index.
    const cMatch = trimmed.match(/^\\c\s+(\d+)/);
    if (cMatch) {
      const chapterNumber = parseInt(cMatch[1], 10);
      const existingChapter = chapters.find((ch) => ch.number === chapterNumber);
      if (existingChapter) {
        currentChapter = existingChapter;
      } else {
        currentChapter = { number: chapterNumber, verses: [] };
        chapters.push(currentChapter);
      }
      currentVerse = null;
      continue;
    }

    // \v marker — verse(s) on this line
    if (trimmed.startsWith("\\v ") && currentChapter) {
      // A line may contain multiple \v markers (rare but possible)
      const verseSegments = trimmed.split(/(?=\\v\s+\d+)/);
      for (const segment of verseSegments) {
        // Sub-verses ("\v 4a", "\v 4b-5") and bridges ("\v 1-2") all file
        // their text under the base number — the schema is one row per
        // (chapter, number), so segments of a split verse must merge, never
        // duplicate.
        const vMatch = segment.match(
          /^\\v\s+(\d+)[a-d]?(?:[-–]\d+[a-d]?)?(?:\s+(.*))?$/
        );
        if (vMatch) {
          const number = parseInt(vMatch[1], 10);
          const text = stripMarkers(vMatch[2] ?? "");
          const existing = currentChapter.verses.find(
            (v) => v.number === number
          );
          if (existing) {
            if (text) {
              existing.text = existing.text ? `${existing.text} ${text}` : text;
            }
            currentVerse = existing;
          } else {
            // Push even when the \v line itself is empty: the text often
            // arrives on the next \q/\p continuation line. Empty verses are
            // dropped at the end.
            const verse: ParsedVerse = { number, text };
            currentChapter.verses.push(verse);
            currentVerse = verse;
          }
        }
      }
      continue;
    }

    // Headings close the current verse; nothing after them is continuation
    if (HEADING_MARKER.test(trimmed)) {
      currentVerse = null;
      continue;
    }

    // Poetry/paragraph continuation — append trailing text to the open verse
    const contMatch = trimmed.match(CONTINUATION_MARKER);
    if (contMatch && currentVerse) {
      const continuation = stripMarkers(contMatch[1] ?? "");
      if (continuation) {
        currentVerse.text = currentVerse.text
          ? `${currentVerse.text} ${continuation}`
          : continuation;
      }
      continue;
    }

    // Skip all other markers (\b, \ide, \usfm, etc.)
  }

  // Drop verses that never received text (e.g. \v followed only by \b)
  for (const chapter of chapters) {
    chapter.verses = chapter.verses.filter((v) => v.text.length > 0);
  }

  return { bookCode, bookName, chapters };
}

/**
 * Strip USFM inline markers from verse text, storing clean text at seed
 * time. Word-level attribute markup (\w He|strong="H5921"\w*) is reduced
 * to its display text so search vectors never index Strong's numbers.
 */
function stripMarkers(text: string): string {
  let result = text;

  // Remove footnotes, cross-references, and figures entirely
  result = result.replace(/\\f\s.*?\\f\*/g, "");
  result = result.replace(/\\x\s.*?\\x\*/g, "");
  result = result.replace(/\\fig\s.*?\\fig\*/g, "");

  // Remove paired alternate verse/chapter number markers with their content
  // (\va 1\va*, \vp 1b\vp*, \ca 2\ca*) — the numbers are not verse text
  result = result.replace(/\\(?:va|vp|ca)\s.*?\\(?:va|vp|ca)\*/g, "");

  // Word markers: keep display text, drop |attribute payloads
  // \w He|strong="H5921"\w*  →  He
  result = result.replace(/\\\+?w\s+([^\\|]*?)\s*(?:\|[^\\]*?)?\\\+?w\*/g, "$1");

  // Remove closing markers like \wj*, \add*, \nd*, etc.
  result = result.replace(/\\\+?\w+\*/g, "");

  // Remove opening inline markers like \wj, \add, \nd, \+w, etc.
  // These are followed by a space and text content we want to keep
  result = result.replace(/\\\+?\w+\s?/g, "");

  // Residual attribute payloads and pilcrows
  result = result.replace(/\|[^\s|]*/g, "");
  result = result.replace(/¶\s*/g, "");

  // Clean up extra whitespace
  result = result.replace(/\s+/g, " ").trim();

  return result;
}
