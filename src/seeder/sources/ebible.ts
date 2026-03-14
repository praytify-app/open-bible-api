import { mkdirSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import type { ParsedBook } from "../usfm-parser.js";
import { parseBibleFile } from "../parser.js";
import { getBookMeta } from "../book-metadata.js";

const CACHE_DIR = join(process.cwd(), ".cache", "ebible");
const EBIBLE_BASE_URL = "https://ebible.org/Scriptures/content";

/**
 * Download and parse a Bible translation from eBible.org.
 *
 * Downloads the USFM zip from eBible.org, caches locally, extracts,
 * parses all Bible files, and returns books sorted by canonical position.
 *
 * @param translationId - eBible.org translation identifier (e.g. "engkjv")
 * @returns Parsed books sorted by canonical position
 */
export async function downloadAndParseEbible(
  translationId: string
): Promise<ParsedBook[]> {
  const translationDir = join(CACHE_DIR, translationId);
  const zipPath = join(CACHE_DIR, `${translationId}_usfm.zip`);
  const extractDir = join(translationDir, "usfm");

  // Ensure cache directory exists
  mkdirSync(CACHE_DIR, { recursive: true });

  // Download if not cached
  if (!existsSync(extractDir)) {
    const zipUrl = `${EBIBLE_BASE_URL}/${translationId}_usfm.zip`;

    console.log(`Downloading ${zipUrl}...`);

    if (!existsSync(zipPath)) {
      const response = await fetch(zipUrl);
      if (!response.ok) {
        throw new Error(
          `Failed to download ${zipUrl}: ${response.status} ${response.statusText}`
        );
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      writeFileSync(zipPath, buffer);
      console.log(`Downloaded ${buffer.length} bytes to ${zipPath}`);
    }

    // Extract zip
    mkdirSync(extractDir, { recursive: true });
    console.log(`Extracting to ${extractDir}...`);
    execSync(`unzip -o "${zipPath}" -d "${extractDir}"`, {
      stdio: "pipe",
    });
  } else {
    console.log(`Using cached files in ${extractDir}`);
  }

  // Find all Bible files (.usfm, .sfm, .usx, .xml)
  const files = findBibleFiles(extractDir);

  if (files.length === 0) {
    throw new Error(
      `No Bible files found in ${extractDir}. Check the translation ID.`
    );
  }

  console.log(`Parsing ${files.length} Bible files...`);

  // Parse each file
  const parsedBooks: ParsedBook[] = [];

  for (const filePath of files) {
    try {
      const content = readFileSync(filePath, "utf-8");
      const parsed = parseBibleFile(content);

      // Only include books we recognize (skip introductions, etc.)
      if (parsed.bookCode && getBookMeta(parsed.bookCode)) {
        parsedBooks.push(parsed);
      }
    } catch (err) {
      console.warn(`Failed to parse ${filePath}: ${err}`);
    }
  }

  // Sort by canonical position
  parsedBooks.sort((a, b) => {
    const metaA = getBookMeta(a.bookCode);
    const metaB = getBookMeta(b.bookCode);
    return (metaA?.position ?? 999) - (metaB?.position ?? 999);
  });

  console.log(`Parsed ${parsedBooks.length} canonical books`);

  return parsedBooks;
}

/**
 * Recursively find Bible files in a directory.
 */
function findBibleFiles(dir: string): string[] {
  const results: string[] = [];
  const extensions = new Set([".usfm", ".sfm", ".usx", ".xml"]);

  function walk(currentDir: string) {
    const entries = readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else {
        const ext = entry.name.substring(entry.name.lastIndexOf(".")).toLowerCase();
        if (extensions.has(ext)) {
          results.push(fullPath);
        }
      }
    }
  }

  walk(dir);
  return results;
}
