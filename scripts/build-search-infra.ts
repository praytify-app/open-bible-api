// Build full-text search infrastructure on an existing database. See
// src/db/search-infra.ts for what it does; it is idempotent and resumable.
//
// New translations seeded after this ran need it again for their rows;
// re-running only vectorizes verses whose search_vector is still NULL.
//
// Usage: DATABASE_URL=postgres://... npx tsx scripts/build-search-infra.ts
import { buildSearchInfra } from "../src/db/search-infra.js";

buildSearchInfra(process.env.DATABASE_URL!).catch((err) => {
  console.error(err);
  process.exit(1);
});
