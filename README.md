# Open Bible API

A free, open-source REST API serving Bible scripture data. Built as a gift to the Christian developer community.

Powered by [Hono](https://hono.dev), [Drizzle ORM](https://orm.drizzle.team), and PostgreSQL. Ships with a seeder that imports translations directly from [eBible.org](https://ebible.org).

## Features

- Full-text search with PostgreSQL tsvector ranking
- Verse lookup by reference (e.g., `John 3:16`) with parallel version support
- Verse of the day (366 curated daily verses)
- Pagination on all list endpoints
- Multi-translation support (seed as many versions as you need)
- Cache-friendly responses with appropriate `Cache-Control` headers
- IP-based rate limiting
- Admin endpoints for managing versions
- Full Bible download as JSON
- Docker-ready with a single `docker compose up`

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org) 22+
- [pnpm](https://pnpm.io) 9.15+
- [Docker](https://www.docker.com) and Docker Compose

### 1. Clone and install

```bash
git clone https://github.com/your-org/open-bible-api.git
cd open-bible-api
pnpm install
```

### 2. Start the database

```bash
docker compose up db -d
```

This starts PostgreSQL on port 5433 (mapped from container port 5432).

### 3. Set up environment

```bash
cp .env.example .env
```

The defaults work out of the box for local development.

### 4. Run migrations

```bash
pnpm db:migrate
```

This creates all tables and sets up full-text search indexes.

### 5. Seed a Bible translation

```bash
# Seed the World English Bible (Public Domain)
pnpm seed seed \
  --source ebible \
  --translation engwebpb \
  --abbreviation WEB \
  --name "World English Bible" \
  --license "Public Domain" \
  --language eng \
  --lang-name English \
  --lang-native English \
  --lang-script Latin \
  --lang-direction ltr

# Seed the King James Version (Public Domain)
pnpm seed seed \
  --source ebible \
  --translation eng-kjv2006 \
  --abbreviation KJV \
  --name "King James Version" \
  --license "Public Domain" \
  --language eng \
  --lang-name English \
  --lang-native English \
  --lang-script Latin \
  --lang-direction ltr
```

### 6. Seed daily verses

```bash
pnpm seed seed-daily
```

### 7. Start the API

```bash
pnpm dev
```

The API is now running at `http://localhost:3100`.

### Docker (full stack)

To run everything in Docker:

```bash
docker compose up --build -d
```

This starts both PostgreSQL and the API. You still need to run migrations and seeding against the running containers.

## API Documentation

All endpoints are prefixed with `/api/v1`.

### Health Check

```bash
curl http://localhost:3100/api/v1/health
```

```json
{
  "status": "ok",
  "timestamp": "2025-01-15T12:00:00.000Z",
  "version": "1.0.0"
}
```

### Languages

**List all languages**

```bash
curl "http://localhost:3100/api/v1/languages?page=1&limit=20"
```

**Get a language and its versions**

```bash
curl http://localhost:3100/api/v1/languages/eng
```

### Versions

**List all versions**

```bash
curl "http://localhost:3100/api/v1/versions?page=1&limit=20"

# Filter by language
curl "http://localhost:3100/api/v1/versions?language=eng"
```

**Get a single version**

```bash
curl http://localhost:3100/api/v1/versions/{id}
```

**List books in a version**

```bash
curl http://localhost:3100/api/v1/versions/{id}/books
```

**Download full Bible as JSON**

```bash
curl http://localhost:3100/api/v1/versions/{id}/download
```

### Books

**List chapters in a book**

```bash
curl http://localhost:3100/api/v1/books/{id}/chapters
```

### Chapters

**List verses in a chapter**

```bash
curl http://localhost:3100/api/v1/chapters/{id}/verses
```

### Verses

**Look up a verse by reference**

```bash
# Single verse
curl "http://localhost:3100/api/v1/verses?ref=John+3:16&version=KJV"

# Verse range
curl "http://localhost:3100/api/v1/verses?ref=Psalm+23:1-6&version=KJV"

# Parallel versions
curl "http://localhost:3100/api/v1/verses?ref=John+3:16&version=KJV,WEB"
```

**Get a verse by ID**

```bash
curl http://localhost:3100/api/v1/verses/12345
```

### Search

Full-text search with PostgreSQL tsvector ranking.

```bash
# Search within a version
curl "http://localhost:3100/api/v1/search?q=love&version=KJV&limit=10&offset=0"

# Search within a language
curl "http://localhost:3100/api/v1/search?q=faith&language=eng&limit=10"
```

### Verse of the Day

Returns a curated verse based on the current day of the year (366 verses covering the full year).

```bash
curl http://localhost:3100/api/v1/daily
```

```json
{
  "data": {
    "dayOfYear": 1,
    "reference": "Lamentations 3:22-23",
    "text": "It is of the LORD's mercies that we are not consumed...",
    "version": "KJV"
  }
}
```

### Admin Endpoints

Admin endpoints require a Bearer token set via the `ADMIN_TOKEN` environment variable.

**Get database stats**

```bash
curl -H "Authorization: Bearer your-admin-token" \
  http://localhost:3100/api/v1/admin/stats
```

**Add a version**

```bash
curl -X POST -H "Authorization: Bearer your-admin-token" \
  -H "Content-Type: application/json" \
  -d '{"abbreviation":"ESV","name":"English Standard Version","languageCode":"eng","license":"Crossway"}' \
  http://localhost:3100/api/v1/admin/versions
```

**Delete a version (cascades to books, chapters, verses)**

```bash
curl -X DELETE -H "Authorization: Bearer your-admin-token" \
  http://localhost:3100/api/v1/admin/versions/{id}
```

## Seeding Translations

The seeder downloads Bible translations from eBible.org in USFM format, parses them, and inserts them into the database.

### Finding translation IDs

Visit [ebible.org](https://ebible.org) and look for the translation detail page. The translation ID is in the URL, e.g., `ebible.org/find/details.php?id=engwebpb` means the ID is `engwebpb`.

### Seeder CLI commands

```bash
# Seed a translation
pnpm seed seed --source ebible --translation <id> \
  --abbreviation <ABBR> --name "<Full Name>" \
  --license "<License>" --language <iso639-3> \
  --lang-name "<Language Name>" --lang-native "<Native Name>" \
  --lang-script "<Script>" --lang-direction <ltr|rtl>

# Seed daily verses (366 curated KJV verses)
pnpm seed seed-daily

# View database stats
pnpm seed stats
```

### Example translations

| Translation | ID | Abbreviation |
|---|---|---|
| World English Bible | `engwebpb` | WEB |
| King James Version | `eng-kjv2006` | KJV |
| Reina-Valera 1909 (Spanish) | `spa-rv1909` | RV09 |
| Louis Segond 1910 (French) | `fraLSG` | LSG |

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql://bible:bible@localhost:5433/open_bible` | PostgreSQL connection string |
| `PORT` | `3100` | Server port |
| `HOST` | `0.0.0.0` | Server bind address |
| `ADMIN_TOKEN` | `your-admin-token-here` | Bearer token for admin endpoints |
| `CORS_ORIGINS` | `*` | Comma-separated allowed origins |
| `RATE_LIMIT` | `100` | Max requests per hour per IP |

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 22 |
| Framework | [Hono](https://hono.dev) |
| ORM | [Drizzle](https://orm.drizzle.team) |
| Database | PostgreSQL 16 |
| Search | tsvector + pg_trgm |
| Package Manager | pnpm 9.15 |
| Container | Docker + Docker Compose |
| Language | TypeScript (strict mode) |

## Project Structure

```
src/
  index.ts              — Hono app entry point
  db/
    schema.ts           — Drizzle table definitions
    client.ts           — Database connection
    migrate.ts          — Migration runner + search indexes
  routes/
    languages.ts        — GET /languages, /languages/:code
    versions.ts         — GET /versions, /versions/:id, /versions/:id/books, /versions/:id/download
    books.ts            — GET /books/:id/chapters
    chapters.ts         — GET /chapters/:id/verses
    verses.ts           — GET /verses, /verses/:id
    search.ts           — GET /search
    daily.ts            — GET /daily
    admin.ts            — Admin CRUD endpoints
  middleware/
    cors.ts             — CORS configuration
    rate-limit.ts       — IP-based rate limiting
    cache.ts            — Cache-Control headers
    admin-auth.ts       — Bearer token auth
  seeder/
    cli.ts              — CLI entry point (commander)
    sources/ebible.ts   — eBible.org downloader
    usfm-parser.ts      — USFM format parser
    usx-parser.ts       — USX (XML) format parser
    parser.ts           — Auto-detecting parser
    bulk-insert.ts      — Database insertion
    book-metadata.ts    — Canonical book info
    daily-verses-seed.ts — 366 curated daily verses
  lib/
    responses.ts        — Standardized JSON responses
    reference-parser.ts — Bible reference parsing
    pg-dictionaries.ts  — Language-to-PG dictionary map
drizzle/                — SQL migration files
docker-compose.yml      — PostgreSQL + API services
Dockerfile              — Multi-stage production build
```

## Development

```bash
# Start database
docker compose up db -d

# Run migrations
pnpm db:migrate

# Generate new migration after schema changes
pnpm db:generate

# Start dev server with hot reload
pnpm dev

# Run tests
pnpm test
```

## Contributing

Contributions are welcome. Please:

1. Fork the repository
2. Create a feature branch
3. Write tests for new functionality
4. Submit a pull request

## License

MIT
