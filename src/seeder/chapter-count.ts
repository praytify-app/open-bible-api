/**
 * The value stored in books.chapter_count: the highest chapter number present.
 *
 * Not the number of chapters. Partial translations skip chapters, and readers
 * list 1..chapterCount and skip the numbers in missingChapters, so a count would
 * cut off every chapter numbered above it.
 */
export function highestChapterNumber(chapters: ReadonlyArray<{ number: number }>): number {
  let highest = 0;
  for (const { number } of chapters) if (number > highest) highest = number;
  return highest;
}
