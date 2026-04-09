// src/services/esv-client.ts

const ESV_API_BASE = "https://api.esv.org/v3/passage";

interface EsvTextResponse {
  query: string;
  canonical: string;
  parsed: number[][];
  passage_meta: Array<{
    canonical: string;
    chapter_start: number[];
    chapter_end: number[];
    prev_verse: number | null;
    next_verse: number | null;
    prev_chapter: number[] | null;
    next_chapter: number[] | null;
  }>;
  passages: string[];
}

interface EsvClientOptions {
  apiToken: string;
  /** Delay between requests in ms to respect 60/min limit. Default: 1100 */
  requestDelayMs?: number;
}

let lastRequestTime = 0;

async function throttle(delayMs: number): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < delayMs) {
    await new Promise((resolve) => setTimeout(resolve, delayMs - elapsed));
  }
  lastRequestTime = Date.now();
}

export async function fetchPassageText(
  reference: string,
  options: EsvClientOptions,
): Promise<EsvTextResponse> {
  await throttle(options.requestDelayMs ?? 1100);

  const params = new URLSearchParams({
    q: reference,
    "include-verse-numbers": "true",
    "include-first-verse-numbers": "true",
    "include-headings": "false",
    "include-footnotes": "false",
    "include-footnote-body": "false",
    "include-short-copyright": "false",
    "include-passage-references": "false",
    "include-passage-horizontal-lines": "false",
    "indent-paragraphs": "0",
    "indent-poetry": "false",
    "line-length": "0",
  });

  const response = await fetch(`${ESV_API_BASE}/text/?${params}`, {
    headers: { Authorization: `Token ${options.apiToken}` },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`ESV API ${response.status}: ${body} (ref: ${reference})`);
  }

  return response.json() as Promise<EsvTextResponse>;
}

export async function fetchAudioUrl(
  reference: string,
  apiToken: string,
): Promise<string> {
  const params = new URLSearchParams({ q: reference });

  // The audio endpoint returns a redirect to the MP3 file.
  // Fetch with redirect: "manual" to capture the Location header.
  const response = await fetch(`${ESV_API_BASE}/audio/?${params}`, {
    headers: { Authorization: `Token ${apiToken}` },
    redirect: "manual",
  });

  const location = response.headers.get("Location");
  if (location) return location;

  // If no redirect, return the direct URL
  if (response.ok) {
    return `${ESV_API_BASE}/audio/?${params}`;
  }

  throw new Error(`ESV audio API ${response.status} for "${reference}"`);
}

export type { EsvTextResponse, EsvClientOptions };
