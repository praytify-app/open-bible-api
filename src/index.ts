import { OpenAPIHono } from "@hono/zod-openapi";
import { serve } from "@hono/node-server";
import { apiReference } from "@scalar/hono-api-reference";
import { corsMiddleware } from "./middleware/cors.js";
import { rateLimit } from "./middleware/rate-limit.js";
import { languagesRouter } from "./routes/languages.js";
import { versionsRouter } from "./routes/versions.js";
import { booksRouter } from "./routes/books.js";
import { chaptersRouter } from "./routes/chapters.js";
import { versesRouter } from "./routes/verses.js";
import { searchRouter } from "./routes/search.js";
import { dailyRouter } from "./routes/daily.js";
import { adminRouter } from "./routes/admin.js";

const app = new OpenAPIHono();

// Global CORS middleware
app.use("*", corsMiddleware(process.env.CORS_ORIGINS || "*"));

// Global rate limiter
const maxRequests = parseInt(process.env.RATE_LIMIT_MAX || "1000", 10);
app.use(
  "*",
  rateLimit({
    maxRequests,
    windowMs: 60 * 60 * 1000, // 1 hour
  })
);

// Health check
app.get("/api/v1/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
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

// OpenAPI spec endpoint
app.doc("/api/v1/openapi.json", {
  openapi: "3.1.0",
  info: {
    title: "Open Bible API",
    version: "1.0.0",
    description: "Open-source REST API serving Bible data from eBible.org. 600+ translations, 100+ languages.",
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

if (isMainModule) {
  const port = parseInt(process.env.PORT || "3100", 10);
  const host = process.env.HOST || "0.0.0.0";

  console.log(`Starting Open Bible API on ${host}:${port}`);

  serve({
    fetch: app.fetch,
    port,
    hostname: host,
  });
}

export { app };
