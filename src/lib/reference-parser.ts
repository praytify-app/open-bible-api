export interface ParsedReference {
  book: string;
  chapter: number;
  verseStart: number;
  verseEnd: number | undefined;
}

const REFERENCE_REGEX = /^(\d?\s?[A-Za-z\s]+?)\s+(\d+):(\d+)(?:-(\d+))?$/;

export function parseReference(ref: string): ParsedReference | null {
  const match = ref.trim().match(REFERENCE_REGEX);
  if (!match) return null;
  return {
    book: match[1].trim(),
    chapter: parseInt(match[2], 10),
    verseStart: parseInt(match[3], 10),
    verseEnd: match[4] ? parseInt(match[4], 10) : undefined,
  };
}
