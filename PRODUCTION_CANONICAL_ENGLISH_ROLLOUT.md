# Production Rollout: Canonical English Bible Abbreviations

This rollout normalizes the production Bible database and deploys the API code
that accepts both legacy and canonical abbreviations while returning canonical
English codes in responses.

Target canonical abbreviations:

- `ASV`
- `BSB`
- `MSB`
- `OEB`
- `OEB-CW`
- `WEBU`

## Files included in this rollout

- [src/lib/version-abbreviations.ts](/Users/jkolade/sireskay/github/open-bible-api/src/lib/version-abbreviations.ts)
- [src/seeder/catalog.ts](/Users/jkolade/sireskay/github/open-bible-api/src/seeder/catalog.ts)
- [src/routes/versions.ts](/Users/jkolade/sireskay/github/open-bible-api/src/routes/versions.ts)
- [src/routes/chapters.ts](/Users/jkolade/sireskay/github/open-bible-api/src/routes/chapters.ts)
- [src/routes/verses.ts](/Users/jkolade/sireskay/github/open-bible-api/src/routes/verses.ts)
- [src/routes/search.ts](/Users/jkolade/sireskay/github/open-bible-api/src/routes/search.ts)
- [src/routes/daily.ts](/Users/jkolade/sireskay/github/open-bible-api/src/routes/daily.ts)
- [scripts/normalize-canonical-english-abbreviations.sql](/Users/jkolade/sireskay/github/open-bible-api/scripts/normalize-canonical-english-abbreviations.sql)
- [scripts/smoke-test-canonical-english-versions.sh](/Users/jkolade/sireskay/github/open-bible-api/scripts/smoke-test-canonical-english-versions.sh)

## Important deployment detail

Production compose is image-based, not source-build-based:

```yaml
image: ${OPEN_BIBLE_API_IMAGE:-novashock/open-bible-api:1.3.0}
```

That means repo changes do nothing in production until you either:

1. build and push a new Docker image, then deploy with `OPEN_BIBLE_API_IMAGE=<new-tag>`, or
2. temporarily change production to build from source on the server.

The commands below assume the normal image rollout path.

## 1. Build and push a new image

From the `open-bible-api` repo:

```bash
cd /Users/jkolade/sireskay/github/open-bible-api

git status
git add \
  docker-compose.prod.yml \
  src/lib/version-abbreviations.ts \
  src/seeder/catalog.ts \
  src/routes/versions.ts \
  src/routes/chapters.ts \
  src/routes/verses.ts \
  src/routes/search.ts \
  src/routes/daily.ts \
  scripts/normalize-canonical-english-abbreviations.sql \
  scripts/smoke-test-canonical-english-versions.sh \
  tests/lib/version-abbreviations.test.ts \
  tests/seeder/catalog.test.ts
git commit -m "Normalize canonical English Bible abbreviations"
```

Build and push a release image:

```bash
export RELEASE_TAG="1.3.1-canonical-abbreviations"
docker build -t "novashock/open-bible-api:${RELEASE_TAG}" .
docker push "novashock/open-bible-api:${RELEASE_TAG}"
```

## 2. Back up the production database

On the production host, or from any machine with direct production DB access:

```bash
export DATABASE_URL="postgresql://user:password@host:5432/praytify_bible"
export BACKUP_FILE="praytify_bible_$(date +%F_%H%M%S)_before_canonical_english.sql"

pg_dump "$DATABASE_URL" > "$BACKUP_FILE"
```

## 3. Run the scoped normalization script

This script only updates the six known English rows and is safe to run on an
already-seeded database without touching unrelated abbreviations.

```bash
cd /Users/jkolade/sireskay/github/open-bible-api
psql "$DATABASE_URL" -f scripts/normalize-canonical-english-abbreviations.sql
```

Expected output should include these abbreviations:

```text
ASV
BSB
MSB
OEB
OEB-CW
WEBU
```

## 4. Deploy the new image

On the Dokploy or Docker Compose host:

```bash
export OPEN_BIBLE_API_IMAGE="novashock/open-bible-api:${RELEASE_TAG}"
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps
```

If Dokploy manages environment variables through the UI, set
`OPEN_BIBLE_API_IMAGE=novashock/open-bible-api:${RELEASE_TAG}` there and
redeploy the service.

## 5. Smoke test production

The Praytify gateway uses `/v1` and requires a bearer token for API calls.
Health remains on `/health`.

```bash
cd /Users/jkolade/sireskay/github/open-bible-api

export BASE_URL="https://api.praytify.bible/v1"
export HEALTH_URL="https://api.praytify.bible/health"
export BIBLE_API_BEARER_TOKEN="your-praytify-bible-api-token"

bash scripts/smoke-test-canonical-english-versions.sh
```

Expected checks:

- `versions?language=eng&search=BSB` returns `BSB`
- `versions?language=eng&search=OEB` returns `OEB` and `OEB-CW`
- `verses?ref=John 3:16&version=WEBU` returns `WEBU`
- `versions/OEB-CW/books` resolves successfully

## 6. Mobile verification

After production API rollout, re-open the mobile Bible picker and verify:

- default English starter set includes the expanded canonical codes
- `ASV`, `BSB`, `MSB`, `OEB`, and `WEBU` load chapters successfully
- searching `OEB` shows the expected English OEB options
- existing users keep their current default version

## Rollback

If the rollout needs to be reversed:

1. redeploy the previous image tag
2. restore the DB backup created in step 2

Example:

```bash
export PREVIOUS_IMAGE="novashock/open-bible-api:1.3.0"
export OPEN_BIBLE_API_IMAGE="$PREVIOUS_IMAGE"
docker compose -f docker-compose.prod.yml up -d

psql "$DATABASE_URL" < "$BACKUP_FILE"
```

## Notes

- The compatibility layer in the API accepts both legacy and canonical forms,
  so code deploy and DB normalization are independently safe.
- Local verification already passed against the patched API and normalized local
  database.
- Full `bun test` and `bun run build` in this repo still have unrelated
  pre-existing failures outside this rollout.
