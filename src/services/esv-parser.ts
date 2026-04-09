// src/services/esv-parser.ts

export interface ParsedVerse {
  number: number;
  text: string;
}

/**
 * Parse ESV passage text into individual verse records.
 *
 * Input format: "[1] In the beginning God created... [2] The earth was without form..."
 * Some passages may have no verse markers (single-verse requests).
 */
export function parseEsvPassage(passageText: string): ParsedVerse[] {
  const verses: ParsedVerse[] = [];

  if (!passageText || passageText.trim().length === 0) {
    return verses;
  }

  // Split on verse number markers: [1], [2], etc.
  const versePattern = /\[(\d+)\]\s*/g;
  const markers: Array<{ number: number; index: number }> = [];

  let match: RegExpExecArray | null;
  while ((match = versePattern.exec(passageText)) !== null) {
    markers.push({
      number: parseInt(match[1], 10),
      index: match.index + match[0].length,
    });
  }

  if (markers.length === 0) {
    // No verse markers — treat entire text as verse 1
    const cleaned = passageText.trim();
    if (cleaned.length > 0) {
      verses.push({ number: 1, text: cleaned });
    }
    return verses;
  }

  for (let i = 0; i < markers.length; i++) {
    const start = markers[i].index;
    const end = i + 1 < markers.length
      ? passageText.lastIndexOf(`[${markers[i + 1].number}]`, markers[i + 1].index)
      : passageText.length;

    let text = passageText.slice(start, end).trim();
    // Remove trailing "(ESV)" copyright marker if present
    text = text.replace(/\s*\(ESV\)\s*$/, '').trim();

    if (text.length > 0) {
      verses.push({ number: markers[i].number, text });
    }
  }

  return verses;
}
