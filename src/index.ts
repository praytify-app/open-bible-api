import { Hono } from "hono";
import { serve } from "@hono/node-server";

const app = new Hono();

// Health check
app.get("/api/v1/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  });
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
