import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Constant-time string equality for shared secrets.
 *
 * Both sides are hashed first so timingSafeEqual always sees equal-length
 * buffers: comparing raw strings would throw on a length mismatch, and an
 * early length check would leak the secret's length through timing.
 */
export function secretsMatch(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
