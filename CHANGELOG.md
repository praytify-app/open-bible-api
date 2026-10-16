# Changelog

## [1.5.1] - 2026-10-16

### Added

- The version book list returns `missingChapters` per book: chapter numbers from 1 to `chapterCount` that have no text. Partial translations import with gaps, and clients that list `1..chapterCount` can now skip them. Computed per request from the `(book_id, number)` index; no migration.

## [1.5.0] - 2026-10-16

### Added

- Version codes: every eBible import exposes `code`, its eBible translation id (`engwebp`, `eng-kjv2006`), on version objects, chapter `meta` (`versionCode`), and download metadata. A code is accepted anywhere a version abbreviation is: version detail, books, chapters, `?ref=` and parallel lookups, search, daily, and download. Imported abbreviations are often full titles with spaces, and one contains a slash, so codes are the URL-safe way to name a version. Abbreviations still win when a value matches both, so existing URLs keep resolving to the same version. Derived from `source_url`; no migration.
- Version abbreviations and codes match in any case (`kjv`, `ENGWEBP`); an exact-case match is preferred.
- `?ref=` lookups accept book names in any script, common abbreviations (`Jn 3:16`), USFM codes (`JHN 3:16`), and whole chapters (`Psalm 23`). Passages return `bookCode`, `bookName`, `chapter`, `verseStart`, `verseEnd`, licensing, `languageCode`, and `textDirection`.
- Chapter responses carry a top-level `meta` with the translation's licensing and language.
- The daily verse honours `?version=` and accepts `?date=YYYY-MM-DD` (UTC).
- Full-Bible download returns `{ version, books: [...] }` (`format=books`, the default); `format=legacy` keeps the old shape.
- `audit-data` CLI command (read-only): chapters with no verses per version, abbreviations that are not URL-safe with their codes, and versions addressable only by id.
- `seed-sample` CLI command: seeds WEB, KJV, and the Arabic Van Dyck, the daily verses, and search indexes for them, offline from `EBIBLE_CACHE_DIR` when cached.
- `MIGRATE_ON_BOOT`, `DB_POOL_MAX`, `DB_STATEMENT_TIMEOUT_MS`, `GATEWAY_TOKEN`; graceful shutdown.
- `DOWNLOAD_CONCURRENCY` (default 2): full-Bible downloads past it wait their turn, up to 16, then get `503` with `Retry-After`.
- `Cache-Control` and strong `ETag` on catalog and scripture responses, with `304` for `If-None-Match`.
- Typed OpenAPI responses; admin routes hidden from the published spec.
- CI, Renovate, CONTRIBUTING, and SECURITY.

### Changed

- A single-version `?ref=` lookup that matches nothing returns `404` instead of `200` with `data.error`.
- The daily verse is chosen by UTC calendar date. Dates from March onwards are unchanged; January and February shift by one day.
- Search clamps `limit` (1 to 100) and `offset` (0 to 1000), requires 2 to 200 characters, matches `%` and `_` literally, and returns camelCase fields alongside the deprecated snake_case ones.
- Chapters read in two queries instead of four; the full-Bible download in two instead of about 1,256.
- The hot read queries (chapter, `?ref=` and daily passages, book lists) are prepared once instead of rebuilt per request. In an in-process benchmark against Postgres, engine CPU per request fell 32 to 56% on those routes (43% overall), with byte-identical responses.
- Health, the OpenAPI document, and the CLI report the package version.
- Node 24, pnpm 12, TypeScript 7, and current releases of every dependency. Transitive `nanoid` and `yaml` are floored at patched versions.

### Fixed

- The reference parser could block the event loop for over a second on hostile input; it is now linear time.
- The per-IP limiter never evicted entries and ignored `RATE_LIMIT_MAX`.
- The migration journal (`drizzle/meta`) was gitignored, so fresh clones could not migrate.
- `MIGRATE_ON_BOOT` failed on a database restored from a dump (tables present, no migration journal). The migrator now records the migrations a restored schema already reflects, then applies anything newer.
- Search in one version, and every search on the trigram path, now matches only the requested versions' chapters before ranking. On the full 14.8M-verse corpus, common words took 2 to 46 seconds or hit the 15-second timeout; they now return in under a second once cached.
- Concurrent full-Bible downloads under load ran past the 15-second statement timeout and failed with `500` (38 to 57% of them in a load test) while slowing chapter reads. Downloads now build two at a time per process with a 60-second budget; none failed in the same test.

### Security

- Constant-time comparison for the admin token.
- Requests carrying the gateway token skip the engine's per-IP limiter; others are keyed on the last `X-Forwarded-For` entry.

### Deprecated

- snake_case fields in search results (`verse_number`, `chapter_number`, `book_name`, `book_code`, `version_abbreviation`). Use the camelCase fields.
