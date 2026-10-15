import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  // Pinned so Vitest never resolves caches against a parent directory
  // (it otherwise tried to write ~/node_modules and failed with EPERM).
  root,
  cacheDir: "node_modules/.vite",
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    fsModuleCachePath: "node_modules/.vitest-cache",
  },
});
