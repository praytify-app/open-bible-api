# Changelog

## [1.5.0] - Unreleased

### Added

- `?ref=` lookups accept book names in any script, common abbreviations (`Jn 3:16`), USFM codes (`JHN 3:16`), and whole chapters (`Psalm 23`). Passages return `bookCode`, `bookName`, `chapter`, `verseStart`, `verseEnd`, licensing, `languageCode`, and `textDirection`.
- Chapter responses carry a top-level `meta` with the translation's licensing and language.
- The daily verse honours `?version=` and accepts `?date=YYYY-MM-DD` (UTC).
- Full-Bible download returns `{ version, books: [...] }` (`format=books`, the default); `format=legacy` keeps the old shape.
- `seed-sample` CLI command: seeds WEB, KJV, and the Arabic Van Dyck, the daily verses, and search indexes for them, offline from `EBIBLE_CACHE_DIR` when cached.
- `MIGRATE_ON_BOOT`, `DB_POOL_MAX`, `DB_STATEMENT_TIMEOUT_MS`, `GATEWAY_TOKEN`; graceful shutdown.
- `Cache-Control` and strong `ETag` on catalog and scripture responses, with `304` for `If-None-Match`.
- Typed OpenAPI responses; admin routes hidden from the published spec.
- CI, Renovate, CONTRIBUTING, and SECURITY.

### Changed

- A single-version `?ref=` lookup that matches nothing returns `404` instead of `200` with `data.error`.
- The daily verse is chosen by UTC calendar date. Dates from March onwards are unchanged; January and February shift by one day.
- Search clamps `limit` (1 to 100) and `offset` (0 to 1000), requires 2 to 200 characters, matches `%` and `_` literally, and returns camelCase fields alongside the deprecated snake_case ones.
- Chapters read in two queries instead of four; the full-Bible download in two instead of about 1,256.
- Health, the OpenAPI document, and the CLI report the package version.
- Node 24, pnpm 12, TypeScript 7, and current releases of every dependency. Transitive `nanoid` and `yaml` are floored at patched versions.

### Fixed

- The reference parser could block the event loop for over a second on hostile input; it is now linear time.
- The per-IP limiter never evicted entries and ignored `RATE_LIMIT_MAX`.
- The migration journal (`drizzle/meta`) was gitignored, so fresh clones could not migrate.

### Security

- Constant-time comparison for the admin token.
- Requests carrying the gateway token skip the engine's per-IP limiter; others are keyed on the last `X-Forwarded-For` entry.

### Deprecated

- snake_case fields in search results (`verse_number`, `chapter_number`, `book_name`, `book_code`, `version_abbreviation`). Use the camelCase fields.
