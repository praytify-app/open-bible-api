import { cors } from "hono/cors";
import type { MiddlewareHandler } from "hono";

export function corsMiddleware(origins: string): MiddlewareHandler {
  const origin =
    origins === "*" ? "*" : origins.split(",").map((o) => o.trim());
  return cors({ origin, allowMethods: ["GET", "POST", "DELETE", "OPTIONS"] });
}
