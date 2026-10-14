import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  // Must match src/db/run-migrations.ts so drizzle-kit and the app share one journal.
  migrations: { table: "__drizzle_migrations", schema: "drizzle" },
  dbCredentials: {
    url: process.env.DATABASE_URL || "postgresql://bible:bible@localhost:5433/open_bible",
  },
});
