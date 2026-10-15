import { readFileSync } from "node:fs";

/**
 * The version in package.json, read once at startup.
 *
 * Read at runtime rather than imported: package.json sits outside rootDir,
 * and this path resolves the same way from src/lib under tsx and from
 * dist/lib in the container, where package.json is copied to /app.
 */
export const PACKAGE_VERSION: string = (
  JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version: string }
).version;
