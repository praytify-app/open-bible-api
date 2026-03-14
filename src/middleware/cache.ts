import type { MiddlewareHandler } from "hono";

export function cacheControl(maxAgeSeconds: number): MiddlewareHandler {
  return async (c, next) => {
    await next();
    c.header("Cache-Control", `public, max-age=${maxAgeSeconds}`);
  };
}
