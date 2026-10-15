import { OpenAPIHono } from "@hono/zod-openapi";
import { etag } from "hono/etag";
import { serve } from "@hono/node-server";
import { apiReference } from "@scalar/hono-api-reference";
import { corsMiddleware } from "./middleware/cors.js";
import { rateLimit, rateLimitMaxFromEnv } from "./middleware/rate-limit.js";
import { CachePolicy, noStoreOnError } from "./middleware/cache.js";
import { languagesRouter } from "./routes/languages.js";
import { versionsRouter } from "./routes/versions.js";
import { booksRouter } from "./routes/books.js";
import { chaptersRouter } from "./routes/chapters.js";
import { versesRouter } from "./routes/verses.js";
import { searchRouter } from "./routes/search.js";
import { dailyRouter } from "./routes/daily.js";
import { adminRouter } from "./routes/admin.js";
import { esvAudioRouter } from "./routes/esv-audio.js";
import { runMigrations } from "./db/run-migrations.js";
import { queryClient } from "./db/client.js";
import { PACKAGE_VERSION } from "./lib/package-version.js";

const app = new OpenAPIHono();

// Global CORS middleware
app.use("*", corsMiddleware(process.env.CORS_ORIGINS || "*"));

// Per-client limiter for direct traffic. Requests carrying the gateway's
// token bypass it because the gateway enforces its own quotas.
app.use(
  "*",
  rateLimit({
    maxRequests: rateLimitMaxFromEnv(),
    windowMs: 60 * 60 * 1000, // 1 hour
    gatewayToken: process.env.GATEWAY_TOKEN || undefined,
  })
);

app.use("*", noStoreOnError());

// Strong ETags over the response body, with If-None-Match answered as 304.
// Bodies only change on a reseed, so a content hash is the right validator
// and no seed-version bookkeeping is needed. Applies to 2xx GET/HEAD only.
app.use("/api/v1/*", etag());

// Health check
app.get("/api/v1/health", (c) => {
  c.header("Cache-Control", CachePolicy.noStore);
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: PACKAGE_VERSION,
  });
});

// API routes
app.route("/api/v1/languages", languagesRouter);
app.route("/api/v1/versions", versionsRouter);
app.route("/api/v1/books", booksRouter);
app.route("/api/v1/chapters", chaptersRouter);
app.route("/api/v1/verses", versesRouter);
app.route("/api/v1/search", searchRouter);
app.route("/api/v1/daily", dailyRouter);
app.route("/api/v1/admin", adminRouter);
app.route("/api/v1/esv/audio", esvAudioRouter);

// The gateway enforces API keys and rewrites /api/v1 to /v1 for the public
// spec; the scheme is declared here so operations can reference it.
app.openAPIRegistry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
  description: "API key issued by the Praytify Bible portal, sent as a bearer token",
});

// OpenAPI spec endpoint
app.doc("/api/v1/openapi.json", {
  openapi: "3.1.0",
  info: {
    title: "Open Bible API",
    version: PACKAGE_VERSION,
    description: "Open-source REST API serving Bible text imported from eBible.org.",
    license: { name: "MIT", url: "https://opensource.org/licenses/MIT" },
    contact: { name: "Praytify", url: "https://praytify.bible" },
  },
  servers: [
    { url: "https://api.praytify.bible", description: "Production" },
    { url: "http://localhost:3100", description: "Local development" },
  ],
});

// Interactive API docs
app.get("/docs", apiReference({
  url: "/api/v1/openapi.json",
  theme: "purple",
  layout: "modern",
}));

// 404 handler
app.notFound((c) => {
  return c.json(
    {
      error: {
        code: "NOT_FOUND",
        message: "Route not found",
        status: 404,
      },
    },
    404
  );
});

// Error handler
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "Internal server error",
        status: 500,
      },
    },
    500
  );
});

// Only start the server when running as the main module
const isMainModule =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("index.ts") || process.argv[1].endsWith("index.js"));

async function start() {
  const port = parseInt(process.env.PORT || "3100", 10);
  const host = process.env.HOST || "0.0.0.0";

  // Opt-in so production keeps its explicit migrate step; self-hosters and
  // the local e2e stack get a database that is ready by the time we listen.
  if (process.env.MIGRATE_ON_BOOT === "true") {
    await runMigrations(process.env.DATABASE_URL!);
  }

  console.log(`Starting Open Bible API on ${host}:${port}`);

  const server = serve({
    fetch: app.fetch,
    port,
    hostname: host,
  });

  // Deploys send SIGTERM. Stop accepting, let in-flight requests finish,
  // then close the pool so Postgres sees clean disconnects instead of
  // dropped sockets. The hard deadline stays under Docker's 10 s default.
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received, shutting down`);

    setTimeout(() => {
      console.error("Shutdown deadline exceeded, exiting");
      process.exit(1);
    }, 8_000).unref();

    server.close(async () => {
      await queryClient.end({ timeout: 5 });
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

if (isMainModule) {
  start().catch((err) => {
    console.error("Startup failed:", err);
    process.exit(1);
  });
}

export { app };
