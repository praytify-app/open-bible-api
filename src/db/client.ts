import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required");
}

function intFromEnv(name: string, fallback: number): number {
  const parsed = parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

// A runaway query (an unbounded search, a full-Bible download) must not hold
// a pool slot forever and starve the chapter-read hot path. 0 disables it,
// which the seeder uses for long batch work.
const statementTimeoutMs = intFromEnv("DB_STATEMENT_TIMEOUT_MS", 15_000);

const queryClient = postgres(connectionString, {
  max: Math.max(1, intFromEnv("DB_POOL_MAX", 10)),
  // Seconds. Release idle connections so a traffic spike does not pin
  // DB_POOL_MAX backends on the shared cluster indefinitely.
  idle_timeout: 30,
  connect_timeout: 10,
  connection: {
    application_name: "open-bible-api",
    statement_timeout: statementTimeoutMs,
  },
});

export const db = drizzle(queryClient, { schema });
export { queryClient };
