// src/lib/api-bible.ts
import { API_BIBLE_VERSIONS } from "./api-bible-config.js";

const API_BIBLE_BASE = "https://api.scripture.api.bible/v1";

export async function fetchApiBibleVerses(
  abbreviation: string,
  bookCode: string,
  chapter: number,
): Promise<{ id: number; chapterId: string; number: number; text: string }[]> {
  const apiKey = process.env.API_BIBLE_KEY;
  if (!apiKey) {
    throw new Error("API_BIBLE_KEY environment variable is not set");
  }

  const config = API_BIBLE_VERSIONS[abbreviation];
  if (!config) {
    throw new Error(`Unknown api.bible version: ${abbreviation}`);
  }

  const chapterId = `${bookCode}.${chapter}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  let res: Response;
  try {
    res = await fetch(
      `${API_BIBLE_BASE}/bibles/${config.bibleId}/chapters/${chapterId}/verses`,
      {
        headers: { "api-key": apiKey },
        signal: controller.signal,
      },
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `api.bible error ${res.status} for ${abbreviation} ${bookCode} ${chapter}: ${body}`,
    );
  }

  const json = (await res.json()) as {
    data: Array<{
      id: string;
      reference: string;
      content: string;
    }>;
  };

  return json.data.map((verse, idx) => ({
    id: idx + 1,
    chapterId: chapterId,
    number: extractVerseNumber(verse.id),
    text: stripHtml(verse.content).trim(),
  }));
}

function extractVerseNumber(verseId: string): number {
  const parts = verseId.split(".");
  return parseInt(parts[parts.length - 1], 10);
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/\s{2,}/g, " ")
    .trim();
}
