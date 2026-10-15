# Open Bible API

A free, open-source REST API serving Bible text. Built as a gift to the Christian developer community.

Powered by [Hono](https://hono.dev), [Drizzle ORM](https://orm.drizzle.team), and PostgreSQL. Ships with a seeder that imports translations directly from [eBible.org](https://ebible.org).

## Features

- Passage lookup by human reference: `John 3:16`, `John 3:16-18`, `John 3` (whole chapter), `1 John 1:9`, `JHN 3:16`, `Jn 3:16`, or the version's own book name in any script
- Parallel passages across up to five versions
- Full-text search: stemmed `tsvector` ranking where Postgres has a dictionary for the language, trigram matching elsewhere
- Verse of the day (366 curated verses) in any seeded version, for today or any date
- Full Bible download as an ordered array of books, for offline readers
- Strong `ETag`s and `Cache-Control` on every scripture and catalog response, with `304 Not Modified` on revalidation
- License and attribution on every scripture payload, read from the version record
- OpenAPI 3.1 spec and interactive docs at `/docs`
- Docker image on Node 24, migrations safe to run from several replicas at once

## Quick start

### Prerequisites

- [Node.js](https://nodejs.org) 22.13 or newer (the image runs Node 24 LTS)
- pnpm, at the version pinned in `package.json` (`corepack enable` picks it up)
- [Docker](https://www.docker.com) for PostgreSQL

### 1. Install

```bash
git clone https://github.com/praytify-app/open-bible-api.git
cd open-bible-api
corepack enable
pnpm install
cp .env.example .env
```

### 2. Start PostgreSQL

```bash
docker compose up db -d
```

This listens on `localhost:5433`, which is what `.env.example` points at.

### 3. Seed the sample corpus

```bash
pnpm seed:sample
```

One command that runs migrations, imports three public-domain translations, seeds the daily verses, and builds the search indexes:

| Version | Abbreviation | eBible id | Why it is in the sample |
|---|---|---|---|
| World English Bible | `WEB` | `engwebp` | Modern English |
| King James Version (1769 text) | `KJV` | `eng-kjv2006` | The version the daily verses are curated in |
| Arabic Van Dyck Bible | `AVD` | `arb-vd` | Right-to-left, non-Latin script, localized book names |

Each translation is read from `.cache/ebible/<id>_usfm.zip` when present and downloaded from eBible.org otherwise, so after the first run the sample seeds offline. Re-running skips versions that already exist; `--force` re-imports them:

```bash
pnpm seed:sample --force
```

Each translation is about 31,000 verses inserted in batches. Against a remote or tunnelled database this is slow (roughly ten minutes per translation in one measurement over an SSH tunnel), because every batch is a round trip.

### 4. Start the API

```bash
pnpm dev
```

The API runs at `http://localhost:3100` and the interactive docs at `http://localhost:3100/docs`.

```bash
curl "http://localhost:3100/api/v1/verses?ref=John+3:16&version=WEB"
```

### Docker (full stack)

```bash
docker compose up --build -d
docker compose exec api node dist/seeder/cli.js seed-sample
```

The compose file sets `MIGRATE_ON_BOOT=true`, so the API container applies migrations before it listens. The image ships only `dist/`, so the seed command is `node dist/seeder/cli.js seed-sample` there (from a checkout, `tsx src/seeder/cli.ts seed-sample` or `pnpm seed:sample`). The image has no eBible cache, so the first run downloads the three zips. They land in `EBIBLE_CACHE_DIR` (default `/app/.cache/ebible`, the one writable path in the image). To keep the root filesystem read-only, mount a volume or tmpfs there or point `EBIBLE_CACHE_DIR` at one; mounting a host `.cache/ebible` makes the seed offline.

## Search needs its indexes

Every seeder writes verses with an empty `search_vector`. Until the search infrastructure is built, the stemmed search path silently returns no results for every language that has a Postgres dictionary (English, French, Spanish, and 12 others).

```bash
pnpm search:build
```

`seed-sample` runs the same build as its last step, scoped to the three sample versions. The script is idempotent and only vectorizes rows whose `search_vector` is still empty, so run it again after importing more translations. It:

1. creates the `pg_trgm` extension (the trigram fallback for languages without a dictionary);
2. ensures `verses.search_vector` is a plain `tsvector` column;
3. fills it per version with that language's dictionary;
4. creates the GIN indexes on `search_vector` and on `text` (trigram).

On a full corpus (about 15 million verses) step 3 and the indexes take a long time and need disk headroom. Run it out of band, never on container start.

## API

All engine routes live under `/api/v1`. The OpenAPI document is served at `/api/v1/openapi.json`, and `/docs` renders it. Admin routes are served but deliberately left out of the published spec.

### Passages

```bash
curl "http://localhost:3100/api/v1/verses?ref=John+3:16-18&version=WEB"
curl "http://localhost:3100/api/v1/verses?ref=Psalm+23&version=KJV"           # whole chapter
curl "http://localhost:3100/api/v1/verses?ref=John+3:16&version=WEB,KJV,AVD"  # parallel, up to 5
```

References are capped at 100 characters. Books resolve in this order: USFM code (`JHN`, `1JN`), the version's own book name compared without case or accents (`إنجيل يوحنا`, `Evangile selon Jean`), then common English names and abbreviations (`Jn`, `Ps`, `1 Cor`, `I John`). Ranges accept any dash.

A single-version response:

```json
{
  "data": {
    "reference": "John 3:16",
    "version": "WEB",
    "verses": [{ "id": 26136, "number": 16, "text": "For God so loved the world, that he gave his only born Son, ..." }],
    "bookCode": "JHN",
    "bookName": "John",
    "chapter": 3,
    "verseStart": 16,
    "verseEnd": 16,
    "license": "Public Domain",
    "attribution": "Public Domain. \"World English Bible\" is a trademark of eBible.org.",
    "attributionUrl": "https://ebible.org/find/details.php?id=engwebp",
    "languageCode": "eng",
    "textDirection": "ltr"
  }
}
```

A miss is a `404` with the standard error envelope. Parallel requests return `{ reference, versions: { [code]: passage | { error } } }` so one missing version does not fail the rest.

### Chapters

```bash
curl http://localhost:3100/api/v1/chapters/KJV/JHN/3/verses
```

`data` is the verse array. `meta` carries `version`, `versionName`, `bookCode`, `bookName`, `chapter`, `license`, `licenseType`, `attribution`, `attributionUrl`, `languageCode`, and `textDirection`, so a reader can show attribution without a second request.

### Catalog

```bash
curl "http://localhost:3100/api/v1/languages?page=1&limit=20"
curl http://localhost:3100/api/v1/languages/eng
curl "http://localhost:3100/api/v1/versions?language=eng&limit=2000"
curl http://localhost:3100/api/v1/versions/WEB          # UUID or abbreviation
curl http://localhost:3100/api/v1/versions/WEB/books
curl http://localhost:3100/api/v1/books/{bookId}/chapters
```

### Search

```bash
curl "http://localhost:3100/api/v1/search?q=love&version=KJV&limit=10&offset=0"
curl "http://localhost:3100/api/v1/search?q=amour&language=fra"
```

`q` must be 2-200 characters. `limit` is 1-100 (default 20) and `offset` 0-1000 (default 0); invalid values fall back to the defaults. Results carry `id`, `text`, `verseNumber`, `chapterNumber`, `bookName`, `bookCode`, `versionAbbreviation`, `license`, `attribution`, `attributionUrl`, and `rank`. The snake_case fields from earlier releases (`verse_number`, `chapter_number`, `book_name`, `book_code`, `version_abbreviation`) are still present and deprecated.

The trigram path matches text as stored. Fully vocalized texts such as the Arabic Van Dyck carry diacritics between letters, so a query typed without them can miss (`الله` does not match `ٱللهُ`).

### Verse of the day

```bash
curl http://localhost:3100/api/v1/daily
curl "http://localhost:3100/api/v1/daily?version=WEB"
curl "http://localhost:3100/api/v1/daily?date=2026-12-25"
```

Days are selected in UTC on a leap-year calendar, so a date always gets the same verse (Feb 29 is slot 60, Dec 31 is slot 366). With `version`, the day's reference is read from that version and the response includes its book, chapter, verse range, and licensing. If that version lacks the verse, the curated KJV text is returned with `requestedVersion` and `note` set. Today's verse expires at the next UTC midnight; a pinned `date` is cached like scripture.

### Full download

```bash
curl http://localhost:3100/api/v1/versions/WEB/download
```

```json
{
  "data": {
    "version": { "id": "…", "abbreviation": "WEB", "name": "World English Bible", "license": "Public Domain", "licenseType": "PD", "attribution": "…", "attributionUrl": "…", "languageCode": "eng", "textDirection": "ltr" },
    "name": "World English Bible",
    "languageCode": "eng",
    "books": [
      { "bookCode": "GEN", "code": "GEN", "name": "Genesis", "position": 1, "testament": "OT",
        "chapters": [{ "number": 1, "verses": [{ "number": 1, "text": "In the beginning, God created the heavens and the earth." }] }] }
    ]
  }
}
```

`name`, `languageCode`, and `books[].code` are deprecated aliases kept for existing offline clients. `?format=legacy` returns the earlier `bookCode -> chapter -> verse -> text` object and is deprecated.

### Caching

Scripture and catalog responses send `Cache-Control: public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800` and a strong `ETag`; send `If-None-Match` to get a `304`. Search sends `public, max-age=300`. Errors, health, and admin responses are `no-store`. The engine does not compress responses: put compression in exactly one layer in front of it.

### Admin

Admin routes require `Authorization: Bearer $ADMIN_TOKEN` and are disabled when `ADMIN_TOKEN` is unset.

```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:3100/api/v1/admin/stats
curl -X DELETE -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:3100/api/v1/admin/versions/{id}
```

## Configuration

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | (required) | PostgreSQL connection string |
| `PORT` | `3100` | Server port |
| `HOST` | `0.0.0.0` | Bind address |
| `ADMIN_TOKEN` | (unset: admin disabled) | Bearer token for admin routes, compared in constant time |
| `CORS_ORIGINS` | `*` | Comma-separated allowed origins |
| `RATE_LIMIT_MAX` | `1000` | Requests per hour per client IP for direct traffic. `RATE_LIMIT` is read as a legacy alias |
| `GATEWAY_TOKEN` | (unset) | Shared secret a fronting gateway sends as `X-Gateway-Token`. Matching requests skip the per-IP limiter because the gateway enforces its own quotas. Without it, nothing bypasses |
| `MIGRATE_ON_BOOT` | `false` | Apply migrations (under a Postgres advisory lock) before listening |
| `DB_POOL_MAX` | `10` | Postgres connection pool size |
| `DB_STATEMENT_TIMEOUT_MS` | `15000` | Per-statement timeout; `0` disables. Full-Bible downloads get at least 60 seconds. The seed scripts set `0` |
| `DOWNLOAD_CONCURRENCY` | `2` | Full-Bible downloads built at once per process. Up to 16 more wait their turn; past that the API answers `503` with `Retry-After` |
| `ESV_API_TOKEN` | (unset) | Crossway token for the ESV audio route and `seed-esv` |
| `EBIBLE_CACHE_DIR` | `./.cache/ebible` | Where the seeder caches eBible.org zips and extracted USFM |

Behind a proxy, the rate limiter keys on the last `X-Forwarded-For` entry, which is the one the nearest proxy appended, and falls back to the socket address. The server drains in-flight requests and closes its pool on `SIGTERM`.

## Seeding more translations

```bash
pnpm seed discover                      # eligible eBible.org translations
pnpm seed seed-translation spaRV1909    # one translation by eBible id
pnpm seed seed-language fra             # every eligible translation in a language
pnpm seed seed-daily                    # (re)seed the 366 curated daily verses
pnpm seed stats
pnpm seed audit-data                    # empty chapters, abbreviations to link by code (read-only; --json)
pnpm search:build                       # then vectorize the new rows
```

That eBible id is also the version's `code` in API responses, accepted anywhere an abbreviation is. `audit-data` lists the versions whose abbreviation is a title or carries a slash, so clients should link them by code, and the chapters that imported with no verses.

`seed-translation`, `seed-language`, and `discover` read the live eBible.org catalog, so they need network access. Translation ids are in eBible.org detail URLs: `ebible.org/find/details.php?id=engwebp` is `engwebp`.

## Migrations

```bash
pnpm db:generate   # after changing src/db/schema.ts; commit drizzle/ including drizzle/meta
pnpm db:migrate    # schema migrations, then the search extension and indexes
```

Migrations are tracked in `drizzle.__drizzle_migrations` and run under a Postgres advisory lock, so replicas booting together with `MIGRATE_ON_BOOT=true` apply each migration once. `MIGRATE_ON_BOOT` applies schema migrations only; the search indexes stay with `pnpm search:build`.

For the canonical English abbreviation rollout on production, see [PRODUCTION_CANONICAL_ENGLISH_ROLLOUT.md](PRODUCTION_CANONICAL_ENGLISH_ROLLOUT.md).

## Development

```bash
pnpm dev                 # hot reload
pnpm test                # vitest
pnpm exec tsc --noEmit   # typecheck
```

Route tests run against a queued drizzle mock (`tests/helpers/mock-db.ts`) and assert query counts where round trips matter.

## Project structure

```
src/
  index.ts               Hono app, middleware order, OpenAPI document, server start and shutdown
  db/
    schema.ts            Drizzle tables
    client.ts            Pool, statement timeout
    run-migrations.ts    Locked migration runner (CLI and MIGRATE_ON_BOOT)
    migrate.ts           pnpm db:migrate
    search-infra.ts      tsvector population and GIN indexes
  routes/                languages, versions (incl. download), books, chapters, verses, search, daily, admin, esv-audio
  middleware/            cors, rate-limit, cache, admin-auth
  lib/
    reference-parser.ts  Linear-time reference parsing
    book-names.ts        USFM code, localized, and English book resolution
    passages.ts          Shared version, book, and verse loading
    openapi-schemas.ts   Response schemas published in the spec
  seeder/                eBible download, USFM/USX parsing, bulk insert, CLI, sample corpus, daily verses
scripts/                 build-search-infra, migrate-schema-only, operational SQL
drizzle/                 SQL migrations and drizzle/meta journal
```

## Contributing

Contributions are welcome: fork, branch, add tests with the change, and open a pull request.

## License

MIT
