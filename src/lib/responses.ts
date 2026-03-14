import type { Context } from "hono";

interface PaginationMeta {
  page: number;
  limit: number;
  total?: number;
  totalPages?: number;
}

export function success<T>(c: Context, data: T, meta?: PaginationMeta) {
  return c.json({
    data,
    ...(meta ? { meta } : {}),
  });
}

export function errorResponse(
  c: Context,
  status: 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500,
  code: string,
  message: string
) {
  return c.json(
    {
      error: {
        code,
        message,
      },
    },
    status
  );
}

export function parsePagination(c: Context) {
  const pageParam = c.req.query("page");
  const limitParam = c.req.query("limit");

  let page = pageParam ? parseInt(pageParam, 10) : 1;
  let limit = limitParam ? parseInt(limitParam, 10) : 20;

  if (isNaN(page) || page < 1) page = 1;
  if (isNaN(limit) || limit < 1) limit = 20;
  if (limit > 100) limit = 100;

  const offset = (page - 1) * limit;

  return { page, limit, offset };
}
