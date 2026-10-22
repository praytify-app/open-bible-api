import { OpenAPIHono } from "@hono/zod-openapi";
import type { ZodError } from "zod";

export interface ValidationIssue {
  path: string;
  message: string;
}

/**
 * Turns a failed request validation into the engine's usual error envelope.
 * The library default answers `{ success: false, error: <ZodError> }`, and a
 * ZodError's message is a JSON dump of its issues, which callers then show
 * to people verbatim.
 */
export function validationError(error: ZodError, target: string) {
  const issues: ValidationIssue[] = error.issues.map((issue) => ({
    path: issue.path.map(String).join("."),
    message: issue.message,
  }));
  const detail = issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)).join("; ");
  return {
    error: {
      code: "VALIDATION_ERROR",
      message: `Invalid ${target}. ${detail}`,
      status: 400,
      issues,
    },
  };
}

/**
 * Every engine router comes from here, so each one answers a bad request the
 * same way. Each router carries the hook itself instead of inheriting it from
 * the root app, so the behaviour does not depend on when a router is mounted.
 */
export function createRouter() {
  return new OpenAPIHono({
    defaultHook: (result, c) => {
      if (!result.success) return c.json(validationError(result.error, result.target), 400);
    },
  });
}
