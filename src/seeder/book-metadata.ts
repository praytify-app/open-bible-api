export interface BookMeta {
  code: string;
  position: number;
  testament: "OT" | "NT";
  englishName: string;
}

export const BOOK_METADATA: BookMeta[] = [
  // Old Testament
  { code: "GEN", position: 1, testament: "OT", englishName: "Genesis" },
  { code: "EXO", position: 2, testament: "OT", englishName: "Exodus" },
  { code: "LEV", position: 3, testament: "OT", englishName: "Leviticus" },
  { code: "NUM", position: 4, testament: "OT", englishName: "Numbers" },
  { code: "DEU", position: 5, testament: "OT", englishName: "Deuteronomy" },
  { code: "JOS", position: 6, testament: "OT", englishName: "Joshua" },
  { code: "JDG", position: 7, testament: "OT", englishName: "Judges" },
  { code: "RUT", position: 8, testament: "OT", englishName: "Ruth" },
  { code: "1SA", position: 9, testament: "OT", englishName: "1 Samuel" },
  { code: "2SA", position: 10, testament: "OT", englishName: "2 Samuel" },
  { code: "1KI", position: 11, testament: "OT", englishName: "1 Kings" },
  { code: "2KI", position: 12, testament: "OT", englishName: "2 Kings" },
  { code: "1CH", position: 13, testament: "OT", englishName: "1 Chronicles" },
  { code: "2CH", position: 14, testament: "OT", englishName: "2 Chronicles" },
  { code: "EZR", position: 15, testament: "OT", englishName: "Ezra" },
  { code: "NEH", position: 16, testament: "OT", englishName: "Nehemiah" },
  { code: "EST", position: 17, testament: "OT", englishName: "Esther" },
  { code: "JOB", position: 18, testament: "OT", englishName: "Job" },
  { code: "PSA", position: 19, testament: "OT", englishName: "Psalms" },
  { code: "PRO", position: 20, testament: "OT", englishName: "Proverbs" },
  { code: "ECC", position: 21, testament: "OT", englishName: "Ecclesiastes" },
  { code: "SNG", position: 22, testament: "OT", englishName: "Song of Solomon" },
  { code: "ISA", position: 23, testament: "OT", englishName: "Isaiah" },
  { code: "JER", position: 24, testament: "OT", englishName: "Jeremiah" },
  { code: "LAM", position: 25, testament: "OT", englishName: "Lamentations" },
  { code: "EZK", position: 26, testament: "OT", englishName: "Ezekiel" },
  { code: "DAN", position: 27, testament: "OT", englishName: "Daniel" },
  { code: "HOS", position: 28, testament: "OT", englishName: "Hosea" },
  { code: "JOL", position: 29, testament: "OT", englishName: "Joel" },
  { code: "AMO", position: 30, testament: "OT", englishName: "Amos" },
  { code: "OBA", position: 31, testament: "OT", englishName: "Obadiah" },
  { code: "JON", position: 32, testament: "OT", englishName: "Jonah" },
  { code: "MIC", position: 33, testament: "OT", englishName: "Micah" },
  { code: "NAM", position: 34, testament: "OT", englishName: "Nahum" },
  { code: "HAB", position: 35, testament: "OT", englishName: "Habakkuk" },
  { code: "ZEP", position: 36, testament: "OT", englishName: "Zephaniah" },
  { code: "HAG", position: 37, testament: "OT", englishName: "Haggai" },
  { code: "ZEC", position: 38, testament: "OT", englishName: "Zechariah" },
  { code: "MAL", position: 39, testament: "OT", englishName: "Malachi" },
  // New Testament
  { code: "MAT", position: 40, testament: "NT", englishName: "Matthew" },
  { code: "MRK", position: 41, testament: "NT", englishName: "Mark" },
  { code: "LUK", position: 42, testament: "NT", englishName: "Luke" },
  { code: "JHN", position: 43, testament: "NT", englishName: "John" },
  { code: "ACT", position: 44, testament: "NT", englishName: "Acts" },
  { code: "ROM", position: 45, testament: "NT", englishName: "Romans" },
  { code: "1CO", position: 46, testament: "NT", englishName: "1 Corinthians" },
  { code: "2CO", position: 47, testament: "NT", englishName: "2 Corinthians" },
  { code: "GAL", position: 48, testament: "NT", englishName: "Galatians" },
  { code: "EPH", position: 49, testament: "NT", englishName: "Ephesians" },
  { code: "PHP", position: 50, testament: "NT", englishName: "Philippians" },
  { code: "COL", position: 51, testament: "NT", englishName: "Colossians" },
  { code: "1TH", position: 52, testament: "NT", englishName: "1 Thessalonians" },
  { code: "2TH", position: 53, testament: "NT", englishName: "2 Thessalonians" },
  { code: "1TI", position: 54, testament: "NT", englishName: "1 Timothy" },
  { code: "2TI", position: 55, testament: "NT", englishName: "2 Timothy" },
  { code: "TIT", position: 56, testament: "NT", englishName: "Titus" },
  { code: "PHM", position: 57, testament: "NT", englishName: "Philemon" },
  { code: "HEB", position: 58, testament: "NT", englishName: "Hebrews" },
  { code: "JAS", position: 59, testament: "NT", englishName: "James" },
  { code: "1PE", position: 60, testament: "NT", englishName: "1 Peter" },
  { code: "2PE", position: 61, testament: "NT", englishName: "2 Peter" },
  { code: "1JN", position: 62, testament: "NT", englishName: "1 John" },
  { code: "2JN", position: 63, testament: "NT", englishName: "2 John" },
  { code: "3JN", position: 64, testament: "NT", englishName: "3 John" },
  { code: "JUD", position: 65, testament: "NT", englishName: "Jude" },
  { code: "REV", position: 66, testament: "NT", englishName: "Revelation" },
];

const bookMetaMap = new Map<string, BookMeta>(
  BOOK_METADATA.map((b) => [b.code.toUpperCase(), b])
);

/**
 * Look up book metadata by code (case-insensitive).
 * Returns undefined for unknown book codes.
 */
export function getBookMeta(code: string): BookMeta | undefined {
  return bookMetaMap.get(code.toUpperCase());
}
