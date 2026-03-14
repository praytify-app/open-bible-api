import type { MiddlewareHandler } from "hono";

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

    if (token !== adminToken) {
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
