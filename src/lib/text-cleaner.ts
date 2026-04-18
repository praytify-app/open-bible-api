/**
 * Strip USFM/Strong's concordance markup from verse text.
 *
 * Patterns removed:
 *  - |strong="H1234" or |strong="G5678"  (Strong's concordance numbers)
 *  - \add, \wj, \nd, etc.                (USFM inline character markers)
 *  - ¶                                    (pilcrow paragraph markers)
 *  - Multiple consecutive spaces          (collapsed to single)
 */
export function cleanVerseText(text: string): string {
  return text
    .replace(/\|strong="[HG]\d+"/g, "") // Strong's concordance refs
    .replace(/\\[a-z]+\d?\*?/g, "")     // USFM character markers
    .replace(/¶\s*/g, "")               // Pilcrow paragraph markers
    .replace(/\s{2,}/g, " ")            // Collapse multiple spaces
    .trim();
}
