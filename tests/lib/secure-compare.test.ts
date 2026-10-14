import { describe, it, expect } from "vitest";
import { secretsMatch } from "../../src/lib/secure-compare.js";

describe("secretsMatch", () => {
  it("matches identical secrets", () => {
    expect(secretsMatch("abc123", "abc123")).toBe(true);
  });

  it("rejects different secrets of equal and unequal length without throwing", () => {
    expect(secretsMatch("abc124", "abc123")).toBe(false);
    expect(secretsMatch("abc", "abc123")).toBe(false);
    expect(secretsMatch("", "abc123")).toBe(false);
  });
});
