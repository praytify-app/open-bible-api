import { z } from "@hono/zod-openapi";

// --- Entity Schemas ---

export const LanguageSchema = z.object({
  id: z.string().uuid().openapi({ description: "Unique language identifier" }),
  code: z.string().min(2).max(3).openapi({ description: "ISO 639-2/3 language code", example: "eng" }),
  name: z.string().openapi({ description: "Language name in English", example: "English" }),
  nativeName: z.string().nullable().openapi({ description: "Language name in its own script" }),
  script: z.string().nullable().openapi({ description: "Script used (e.g. Latin, Cyrillic)" }),
  direction: z.enum(["ltr", "rtl"]).openapi({ description: "Text direction" }),
  createdAt: z.string().datetime().openapi({ description: "ISO 8601 creation timestamp" }),
});

export const VersionSchema = z.object({
  id: z.string().uuid().openapi({ description: "Unique version identifier" }),
  abbreviation: z.string().max(20).openapi({ description: "Short abbreviation", example: "KJV" }),
  name: z.string().max(200).openapi({ description: "Full version name", example: "King James Version" }),
  description: z.string().nullable().openapi({ description: "Version description" }),
  license: z.string().nullable().openapi({ description: "License type" }),
  sourceUrl: z.string().nullable().openapi({ description: "Source URL" }),
  canonType: z.string().openapi({ description: "Canon type", example: "protestant" }),
  verseCount: z.number().int().openapi({ description: "Total verse count" }),
  languageId: z.string().uuid().openapi({ description: "Associated language ID" }),
  attribution: z.string().nullable().openapi({ description: "Attribution text" }),
  attributionUrl: z.string().nullable().openapi({ description: "Attribution URL" }),
  licenseType: z.string().openapi({ description: "License type code", example: "PD" }),
  hasAudio: z.boolean().openapi({ description: "Whether audio is available" }),
  createdAt: z.string().datetime().openapi({ description: "ISO 8601 creation timestamp" }),
});

export const BookSchema = z.object({
  id: z.string().uuid().openapi({ description: "Unique book identifier" }),
  versionId: z.string().uuid().openapi({ description: "Parent version ID" }),
  bookCode: z.string().max(6).openapi({ description: "Standard book code", example: "GEN" }),
  name: z.string().max(100).openapi({ description: "Book name", example: "Genesis" }),
  position: z.number().int().openapi({ description: "Canonical position (1-based)" }),
  chapterCount: z.number().int().openapi({ description: "Number of chapters" }),
  testament: z.string().max(2).openapi({ description: "OT or NT", example: "OT" }),
});

export const ChapterSchema = z.object({
  id: z.string().uuid().openapi({ description: "Unique chapter identifier" }),
  bookId: z.string().uuid().openapi({ description: "Parent book ID" }),
  number: z.number().int().openapi({ description: "Chapter number" }),
  verseCount: z.number().int().openapi({ description: "Number of verses in this chapter" }),
});

export const VerseSchema = z.object({
  id: z.number().int().openapi({ description: "Unique verse identifier" }),
  chapterId: z.string().uuid().openapi({ description: "Parent chapter ID" }),
  number: z.number().int().openapi({ description: "Verse number" }),
  text: z.string().openapi({ description: "Verse text content" }),
});

// --- Query Parameter Schemas ---

export const PaginationQuerySchema = z.object({
  page: z.string().optional().openapi({ description: "Page number (default: 1)", example: "1" }),
  limit: z.string().optional().openapi({ description: "Items per page (default: 20, max: 100)", example: "20" }),
});

export const SearchQuerySchema = z.object({
  q: z.string().min(1).openapi({ description: "Search query text", example: "love" }),
  version: z.string().optional().openapi({ description: "Version abbreviation to search within", example: "KJV" }),
  language: z.string().optional().openapi({ description: "Language code to search within", example: "eng" }),
  limit: z.string().optional().openapi({ description: "Max results (default: 20, max: 100)", example: "20" }),
  offset: z.string().optional().openapi({ description: "Result offset for pagination", example: "0" }),
});

export const VerseRefQuerySchema = z.object({
  ref: z.string().openapi({ description: "Bible reference (e.g. 'John 3:16' or 'John 3:16-18')", example: "John 3:16" }),
  version: z.string().openapi({ description: "Version abbreviation(s), comma-separated for parallel", example: "KJV" }),
});

// --- Response Wrapper Schemas ---

export const ErrorSchema = z.object({
  error: z.object({
    code: z.string().openapi({ description: "Machine-readable error code", example: "NOT_FOUND" }),
    message: z.string().openapi({ description: "Human-readable error message" }),
    status: z.number().int().optional().openapi({ description: "HTTP status code" }),
  }),
});

export const PaginationMetaSchema = z.object({
  page: z.number().int().openapi({ description: "Current page number" }),
  limit: z.number().int().openapi({ description: "Items per page" }),
  total: z.number().int().optional().openapi({ description: "Total items" }),
  totalPages: z.number().int().optional().openapi({ description: "Total pages" }),
});

export function successSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    data: dataSchema,
    meta: PaginationMetaSchema.optional(),
  });
}

export function successListSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    data: z.array(itemSchema),
    meta: PaginationMetaSchema.optional(),
  });
}

// --- Daily Verse Schema ---

export const DailyVerseSchema = z.object({
  dayOfYear: z.number().int().openapi({ description: "Day of year (1-366)" }),
  reference: z.string().openapi({ description: "Bible reference", example: "John 3:16" }),
  text: z.string().openapi({ description: "Verse text" }),
  version: z.string().openapi({ description: "Version abbreviation", example: "KJV" }),
  requestedVersion: z.string().optional().openapi({ description: "Originally requested version (if different)" }),
  note: z.string().optional().openapi({ description: "Note about version mismatch" }),
});

// --- Admin Schemas ---

export const AdminStatsSchema = z.object({
  languages: z.number().int(),
  versions: z.number().int(),
  verses: z.number().int(),
  databaseSizeBytes: z.number().int(),
});

export const CreateVersionBodySchema = z.object({
  abbreviation: z.string().max(20).openapi({ description: "Short abbreviation", example: "KJV" }),
  name: z.string().max(200).openapi({ description: "Full version name" }),
  languageCode: z.string().min(2).max(3).openapi({ description: "ISO language code" }),
  license: z.string().max(100).openapi({ description: "License type" }),
  description: z.string().optional().openapi({ description: "Optional description" }),
  sourceUrl: z.string().optional().openapi({ description: "Source URL" }),
  canonType: z.string().optional().openapi({ description: "Canon type (default: protestant)" }),
});
