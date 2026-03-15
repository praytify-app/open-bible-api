import { describe, it, expect } from "vitest";
import {
  LanguageSchema,
  VersionSchema,
  BookSchema,
  ChapterSchema,
  VerseSchema,
  PaginationQuerySchema,
  SearchQuerySchema,
  VerseRefQuerySchema,
  ErrorSchema,
  PaginationMetaSchema,
  successSchema,
  successListSchema,
  DailyVerseSchema,
  AdminStatsSchema,
  CreateVersionBodySchema,
} from "../../src/lib/openapi-schemas.js";

describe("LanguageSchema", () => {
  const valid = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    code: "eng",
    name: "English",
    nativeName: "English",
    script: "Latin",
    direction: "ltr" as const,
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  it("accepts a valid language", () => {
    expect(LanguageSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts nullable fields as null", () => {
    const result = LanguageSchema.safeParse({ ...valid, nativeName: null, script: null });
    expect(result.success).toBe(true);
  });

  it("rejects invalid direction", () => {
    expect(LanguageSchema.safeParse({ ...valid, direction: "up" }).success).toBe(false);
  });

  it("rejects missing code", () => {
    const { code, ...rest } = valid;
    expect(LanguageSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects code longer than 3 chars", () => {
    expect(LanguageSchema.safeParse({ ...valid, code: "toolong" }).success).toBe(false);
  });
});

describe("VersionSchema", () => {
  const valid = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    abbreviation: "KJV",
    name: "King James Version",
    description: null,
    license: "PD",
    sourceUrl: null,
    canonType: "protestant",
    verseCount: 31102,
    languageId: "550e8400-e29b-41d4-a716-446655440001",
    attribution: null,
    attributionUrl: null,
    licenseType: "PD",
    hasAudio: false,
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  it("accepts a valid version", () => {
    expect(VersionSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects non-integer verseCount", () => {
    expect(VersionSchema.safeParse({ ...valid, verseCount: 3.14 }).success).toBe(false);
  });

  it("rejects missing abbreviation", () => {
    const { abbreviation, ...rest } = valid;
    expect(VersionSchema.safeParse(rest).success).toBe(false);
  });
});

describe("BookSchema", () => {
  const valid = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    versionId: "550e8400-e29b-41d4-a716-446655440001",
    bookCode: "GEN",
    name: "Genesis",
    position: 1,
    chapterCount: 50,
    testament: "OT",
  };

  it("accepts a valid book", () => {
    expect(BookSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects testament longer than 2 chars", () => {
    expect(BookSchema.safeParse({ ...valid, testament: "OLD" }).success).toBe(false);
  });
});

describe("ChapterSchema", () => {
  it("accepts a valid chapter", () => {
    const result = ChapterSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      bookId: "550e8400-e29b-41d4-a716-446655440001",
      number: 3,
      verseCount: 36,
    });
    expect(result.success).toBe(true);
  });
});

describe("VerseSchema", () => {
  it("accepts a valid verse", () => {
    const result = VerseSchema.safeParse({
      id: 1,
      chapterId: "550e8400-e29b-41d4-a716-446655440000",
      number: 16,
      text: "For God so loved the world...",
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-integer id", () => {
    expect(VerseSchema.safeParse({ id: "abc", chapterId: "550e8400-e29b-41d4-a716-446655440000", number: 1, text: "hi" }).success).toBe(false);
  });
});

describe("PaginationQuerySchema", () => {
  it("accepts empty object (all optional)", () => {
    expect(PaginationQuerySchema.safeParse({}).success).toBe(true);
  });

  it("accepts page and limit as strings", () => {
    expect(PaginationQuerySchema.safeParse({ page: "2", limit: "50" }).success).toBe(true);
  });
});

describe("SearchQuerySchema", () => {
  it("requires q", () => {
    expect(SearchQuerySchema.safeParse({}).success).toBe(false);
  });

  it("accepts q with optional version", () => {
    expect(SearchQuerySchema.safeParse({ q: "love", version: "KJV" }).success).toBe(true);
  });

  it("rejects empty q", () => {
    expect(SearchQuerySchema.safeParse({ q: "" }).success).toBe(false);
  });
});

describe("VerseRefQuerySchema", () => {
  it("requires both ref and version", () => {
    expect(VerseRefQuerySchema.safeParse({}).success).toBe(false);
    expect(VerseRefQuerySchema.safeParse({ ref: "John 3:16" }).success).toBe(false);
  });

  it("accepts valid ref + version", () => {
    expect(VerseRefQuerySchema.safeParse({ ref: "John 3:16", version: "KJV" }).success).toBe(true);
  });
});

describe("ErrorSchema", () => {
  it("accepts a valid error", () => {
    const result = ErrorSchema.safeParse({
      error: { code: "NOT_FOUND", message: "Not found" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts error with optional status", () => {
    const result = ErrorSchema.safeParse({
      error: { code: "NOT_FOUND", message: "Not found", status: 404 },
    });
    expect(result.success).toBe(true);
  });
});

describe("PaginationMetaSchema", () => {
  it("accepts full meta", () => {
    const result = PaginationMetaSchema.safeParse({ page: 1, limit: 20, total: 100, totalPages: 5 });
    expect(result.success).toBe(true);
  });

  it("accepts minimal meta (page + limit only)", () => {
    const result = PaginationMetaSchema.safeParse({ page: 1, limit: 20 });
    expect(result.success).toBe(true);
  });
});

describe("successSchema", () => {
  it("wraps data in { data, meta? } shape", () => {
    const schema = successSchema(LanguageSchema);
    const result = schema.safeParse({
      data: {
        id: "550e8400-e29b-41d4-a716-446655440000",
        code: "eng",
        name: "English",
        nativeName: null,
        script: null,
        direction: "ltr",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    });
    expect(result.success).toBe(true);
  });
});

describe("successListSchema", () => {
  it("wraps array data in { data: [...], meta? }", () => {
    const schema = successListSchema(VerseSchema);
    const result = schema.safeParse({
      data: [
        { id: 1, chapterId: "550e8400-e29b-41d4-a716-446655440000", number: 1, text: "In the beginning..." },
        { id: 2, chapterId: "550e8400-e29b-41d4-a716-446655440000", number: 2, text: "And the earth..." },
      ],
      meta: { page: 1, limit: 20, total: 2, totalPages: 1 },
    });
    expect(result.success).toBe(true);
  });
});

describe("DailyVerseSchema", () => {
  it("accepts a daily verse", () => {
    const result = DailyVerseSchema.safeParse({
      dayOfYear: 74,
      reference: "John 3:16",
      text: "For God so loved...",
      version: "KJV",
    });
    expect(result.success).toBe(true);
  });

  it("accepts with optional fields", () => {
    const result = DailyVerseSchema.safeParse({
      dayOfYear: 74,
      reference: "John 3:16",
      text: "For God so loved...",
      version: "KJV",
      requestedVersion: "ESV",
      note: "Verse seeded in KJV",
    });
    expect(result.success).toBe(true);
  });
});

describe("AdminStatsSchema", () => {
  it("accepts valid stats", () => {
    const result = AdminStatsSchema.safeParse({
      languages: 100,
      versions: 600,
      verses: 5000000,
      databaseSizeBytes: 1073741824,
    });
    expect(result.success).toBe(true);
  });
});

describe("CreateVersionBodySchema", () => {
  it("accepts valid body with required fields", () => {
    const result = CreateVersionBodySchema.safeParse({
      abbreviation: "KJV",
      name: "King James Version",
      languageCode: "eng",
      license: "PD",
    });
    expect(result.success).toBe(true);
  });

  it("accepts with optional fields", () => {
    const result = CreateVersionBodySchema.safeParse({
      abbreviation: "KJV",
      name: "King James Version",
      languageCode: "eng",
      license: "PD",
      description: "A classic translation",
      sourceUrl: "https://example.com",
      canonType: "protestant",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing required fields", () => {
    expect(CreateVersionBodySchema.safeParse({ abbreviation: "KJV" }).success).toBe(false);
  });
});
