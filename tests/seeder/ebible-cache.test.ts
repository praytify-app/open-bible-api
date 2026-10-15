import { describe, it, expect } from "vitest";
import { join, resolve } from "node:path";
import { ebibleCacheDir } from "../../src/seeder/sources/ebible.js";

describe("ebibleCacheDir", () => {
  it("defaults to the repo-local .cache/ebible", () => {
    expect(ebibleCacheDir({})).toBe(join(process.cwd(), ".cache", "ebible"));
  });

  it("honours EBIBLE_CACHE_DIR so a container can mount a writable volume there", () => {
    expect(ebibleCacheDir({ EBIBLE_CACHE_DIR: "/var/cache/ebible" })).toBe("/var/cache/ebible");
    expect(ebibleCacheDir({ EBIBLE_CACHE_DIR: "tmp/ebible" })).toBe(resolve("tmp/ebible"));
  });
});
