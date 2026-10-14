import type { MiddlewareHandler } from "hono";

/**
 * Cache-Control values by kind of resource.
 *
 * Scripture and catalog data only change on a reseed, so shared caches (the
 * gateway, a CDN) may hold them for a day and serve stale for a week while
 * revalidating. Browsers get a shorter max-age so a reseed shows up within
 * the hour, and the ETag makes their revalidation a cheap 304.
 */
export const CachePolicy = {
  scripture: "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
  search: "public, max-age=300",
  noStore: "no-store",
} as const;

/**
 * Set Cache-Control on successful responses, unless the handler already
 * chose one (the daily verse expires at UTC midnight). Error responses are
 * always no-store so a transient 404 or 500 is never cached as the answer.
 */
export function cacheControl(policy: number | string): MiddlewareHandler {
  const value = typeof policy === "number" ? `public, max-age=${policy}` : policy;
  return async (c, next) => {
    await next();
    if (c.res.status >= 400) {
      c.header("Cache-Control", CachePolicy.noStore);
    } else if (!c.res.headers.has("Cache-Control")) {
      c.header("Cache-Control", value);
    }
  };
}

/**
 * App-wide guard for responses no router policy sees: unmatched routes,
 * the global error handler, and rate-limit rejections.
 */
export function noStoreOnError(): MiddlewareHandler {
  return async (c, next) => {
    await next();
    if (c.res.status >= 400) {
      c.header("Cache-Control", CachePolicy.noStore);
    }
  };
}
