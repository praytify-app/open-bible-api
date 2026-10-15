export interface ParsedReference {
  /** The book as the caller wrote it, trimmed. Resolved against a version by resolveBook(). */
  book: string;
  chapter: number;
  /** Absent for a chapter-only reference such as "John 3". */
  verseStart?: number;
  verseEnd?: number;
}

export const MAX_REFERENCE_LENGTH = 100;

// Hyphen, non-breaking hyphen, figure dash, en dash, em dash, horizontal bar, minus sign.
const DASHES = /[‐-―−]/g;

// Characters that may appear in the trailing "3:16-18" part.
const TAIL_CHARS = new Set("0123456789:.- ");

// Every quantifier here is separated by a required literal or a disjoint
// character class, so matching is linear in the (already capped) input.
const TAIL = /^[.\s]*(\d{1,3})(?:\s*[:.]\s*(\d{1,3})(?:\s*-\s*(\d{1,3}))?)?\s*$/;
const NUMBERED_BOOK = /^([1-4])\s?(.*)$/su;
const BOOK_CHARS = /^[\p{L}\p{M}\s.'’-]+$/u;
const HAS_LETTER = /\p{L}/u;

/**
 * Parse a human Bible reference into book, chapter, and optional verse range.
 *
 * Accepts "John 3:16", "John 3:16-18", "John 3:16–18" (any dash), "John 3"
 * (whole chapter), "1 John 1:9", "1John 1:9", "I John 1:9", "JHN 3:16",
 * "Jn. 3.16", and book names in any script ("إنجيل يوحنا 3:16").
 *
 * The old single regex backtracked quadratically on long runs of spaces
 * (about 0.6 s per request at the query-string limit). This version caps
 * the input and splits it with a right-to-left scan instead: the trailing
 * run of digits and separators is the locator, everything before it is the
 * book. Nothing here can backtrack more than a constant amount.
 */
export function parseReference(input: string): ParsedReference | null {
  if (typeof input !== "string" || input.length > MAX_REFERENCE_LENGTH) return null;

  const s = input.replace(DASHES, "-").replace(/\s+/g, " ").trim();

  let split = s.length;
  while (split > 0 && TAIL_CHARS.has(s[split - 1])) split--;

  const book = s.slice(0, split).trim();
  const tail = TAIL.exec(s.slice(split));
  if (!book || !tail || !isBookName(book)) return null;

  const chapter = parseInt(tail[1], 10);
  const verseStart = tail[2] !== undefined ? parseInt(tail[2], 10) : undefined;
  const verseEnd = tail[3] !== undefined ? parseInt(tail[3], 10) : undefined;

  if (chapter < 1) return null;
  if (verseStart !== undefined && verseStart < 1) return null;
  if (verseStart !== undefined && verseEnd !== undefined && verseEnd < verseStart) return null;

  return { book, chapter, verseStart, verseEnd };
}

function isBookName(book: string): boolean {
  // A numbered-book prefix ("1 John", "2Kings") is the only place a digit may appear.
  const numbered = NUMBERED_BOOK.exec(book);
  const name = numbered ? numbered[2] : book;
  return BOOK_CHARS.test(name) && HAS_LETTER.test(name);
}
