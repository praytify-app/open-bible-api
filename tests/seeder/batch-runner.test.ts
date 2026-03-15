import { describe, it, expect, vi } from "vitest";

// Mock DB client to avoid requiring DATABASE_URL
vi.mock("../../src/db/client.js", () => ({
  db: {},
  queryClient: {},
}));

import { createBatchReport, type BatchResult } from "../../src/seeder/batch-runner.js";

describe("createBatchReport", () => {
  it("returns zeroes for empty results", () => {
    const report = createBatchReport([]);
    expect(report).toEqual({
      total: 0,
      imported: 0,
      skipped: 0,
      failed: 0,
      failures: [],
    });
  });

  it("counts imported results correctly", () => {
    const results: BatchResult[] = [
      { translationId: "engkjv", status: "imported", verseCount: 31102 },
      { translationId: "engweb", status: "imported", verseCount: 31102 },
    ];
    const report = createBatchReport(results);
    expect(report.total).toBe(2);
    expect(report.imported).toBe(2);
    expect(report.skipped).toBe(0);
    expect(report.failed).toBe(0);
    expect(report.failures).toEqual([]);
  });

  it("counts skipped results correctly", () => {
    const results: BatchResult[] = [
      { translationId: "engkjv", status: "skipped", reason: "Already exists" },
    ];
    const report = createBatchReport(results);
    expect(report.total).toBe(1);
    expect(report.imported).toBe(0);
    expect(report.skipped).toBe(1);
    expect(report.failed).toBe(0);
    expect(report.failures).toEqual([]);
  });

  it("counts failed results and populates failures array", () => {
    const results: BatchResult[] = [
      { translationId: "engkjv", status: "failed", error: "Network error" },
      { translationId: "engweb", status: "failed", error: "Parse error" },
    ];
    const report = createBatchReport(results);
    expect(report.total).toBe(2);
    expect(report.imported).toBe(0);
    expect(report.skipped).toBe(0);
    expect(report.failed).toBe(2);
    expect(report.failures).toHaveLength(2);
    expect(report.failures[0].translationId).toBe("engkjv");
    expect(report.failures[1].translationId).toBe("engweb");
  });

  it("handles mixed results correctly", () => {
    const results: BatchResult[] = [
      { translationId: "engkjv", status: "imported", verseCount: 31102 },
      { translationId: "engweb", status: "skipped", reason: "Already exists" },
      { translationId: "sparvg", status: "failed", error: "Download failed" },
      { translationId: "fralsg", status: "imported", verseCount: 30000 },
      { translationId: "yorulb", status: "skipped", reason: "Already exists" },
    ];
    const report = createBatchReport(results);
    expect(report.total).toBe(5);
    expect(report.imported).toBe(2);
    expect(report.skipped).toBe(2);
    expect(report.failed).toBe(1);
    expect(report.failures).toHaveLength(1);
    expect(report.failures[0].translationId).toBe("sparvg");
    expect(report.failures[0].error).toBe("Download failed");
  });
});
