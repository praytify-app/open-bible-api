import type { ParsedBook } from "./usfm-parser.js";
import { parseUSFM } from "./usfm-parser.js";
import { parseUSX } from "./usx-parser.js";

/**
 * Auto-detect Bible file format and parse accordingly.
 * Detects USX (XML) if content starts with `<?xml` or `<usx`,
 * otherwise falls back to USFM.
 */
export function parseBibleFile(content: string): ParsedBook {
  const trimmed = content.trimStart();

  if (trimmed.startsWith("<?xml") || trimmed.startsWith("<usx")) {
    return parseUSX(content);
  }

  return parseUSFM(content);
}
