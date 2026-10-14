import type { MiddlewareHandler } from "hono";
import { secretsMatch } from "../lib/secure-compare.js";

export function adminAuth(): MiddlewareHandler {
  return async (c, next) => {
    const adminToken = process.env.ADMIN_TOKEN;
    const authHeader = c.req.header("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message: "Missing or invalid Authorization header",
            status: 401,
          },
        },
        401
      );
    }

    const token = authHeader.slice(7);

    // An unset ADMIN_TOKEN locks the admin surface rather than opening it.
    if (!adminToken || !secretsMatch(token, adminToken)) {
      return c.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message: "Invalid admin token",
            status: 401,
          },
        },
        401
      );
    }

    await next();
  };
}
