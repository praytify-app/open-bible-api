import type { Context, MiddlewareHandler } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";
import { secretsMatch } from "../lib/secure-compare.js";

interface RateLimitOptions {
  maxRequests: number;
  windowMs: number;
  /**
   * Shared secret the Praytify gateway sends as X-Gateway-Token. Matching
   * requests skip this limiter: the gateway already enforces per-key,
   * per-user, and per-IP quotas, and counting all of its traffic against
   * its own egress IP would throttle every user behind it at once.
   */
  gatewayToken?: string;
  /** Upper bound on tracked clients, so a flood of unique IPs cannot grow memory without limit. */
  maxEntries?: number;
  /** Injectable for tests; a shared store (e.g. Redis) would replace this for multi-replica setups. */
  store?: Map<string, RateLimitEntry>;
}

export interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/**
 * Resolve the per-hour request budget from the environment.
 *
 * RATE_LIMIT_MAX is the documented name. RATE_LIMIT is what the compose
 * files shipped with, so it is honoured too rather than silently ignored.
 */
export function rateLimitMaxFromEnv(
  env: Record<string, string | undefined> = process.env,
  fallback = 1000
): number {
  for (const raw of [env.RATE_LIMIT_MAX, env.RATE_LIMIT]) {
    const parsed = parseInt(raw ?? "", 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return fallback;
}

/**
 * The client address to bucket on.
 *
 * Each proxy appends the peer it received the request from, so the LAST
 * X-Forwarded-For entry is the one our own gateway wrote and the only one a
 * client cannot forge. Earlier entries are whatever the caller claimed.
 */
export function clientKey(c: Context): string {
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) {
    const entries = forwarded.split(",").map((s) => s.trim()).filter(Boolean);
    const last = entries[entries.length - 1];
    if (last) return last;
  }
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    // No Node socket, e.g. app.request() in tests.
    return "unknown";
  }
}

export function rateLimit(options: RateLimitOptions): MiddlewareHandler {
  const { maxRequests, windowMs, gatewayToken, maxEntries = 50_000 } = options;
  const store = options.store ?? new Map<string, RateLimitEntry>();
  let lastSweep = Date.now();

  // Amortized eviction: at most one pass per window, triggered by traffic,
  // so there is no timer to leak and an idle process does no work.
  function sweepExpired(now: number) {
    if (now - lastSweep < windowMs) return;
    lastSweep = now;
    for (const [key, entry] of store) {
      if (now >= entry.resetAt) store.delete(key);
    }
  }

  return async (c, next) => {
    if (gatewayToken) {
      const presented = c.req.header("x-gateway-token");
      if (presented && secretsMatch(presented, gatewayToken)) {
        return next();
      }
    }

    const now = Date.now();
    sweepExpired(now);

    const key = clientKey(c);
    let entry = store.get(key);

    if (!entry || now >= entry.resetAt) {
      // At capacity with a new client: drop the oldest-inserted entry. That
      // client gets a fresh window, which errs toward availability, and the
      // cost stays O(1) even under a flood of unique addresses.
      if (!entry && store.size >= maxEntries) {
        const oldest = store.keys().next().value;
        if (oldest !== undefined) store.delete(oldest);
      }
      entry = { count: 0, resetAt: now + windowMs };
      store.set(key, entry);
    }

    entry.count++;

    const remaining = Math.max(0, maxRequests - entry.count);
    const resetSeconds = Math.ceil((entry.resetAt - now) / 1000);

    c.header("X-RateLimit-Limit", String(maxRequests));
    c.header("X-RateLimit-Remaining", String(remaining));
    c.header("X-RateLimit-Reset", String(resetSeconds));

    if (entry.count > maxRequests) {
      c.header("Retry-After", String(resetSeconds));
      c.header("Cache-Control", "no-store");
      return c.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: "Too many requests, please try again later",
            status: 429,
          },
        },
        429
      );
    }

    await next();
  };
}
