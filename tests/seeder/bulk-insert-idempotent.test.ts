import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the db client before importing the module under test
vi.mock("../../src/db/client.js", () => {
  const mockDb = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
  };

  // Chainable select mock
  const selectChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
  };
  mockDb.select.mockReturnValue(selectChain);

  // Chainable insert mock
  const insertChain = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: "mock-id" }]),
  };
  mockDb.insert.mockReturnValue(insertChain);

  // Chainable update mock
  const updateChain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(undefined),
  };
  mockDb.update.mockReturnValue(updateChain);

  // Chainable delete mock
  const deleteChain = {
    where: vi.fn().mockResolvedValue(undefined),
  };
  mockDb.delete.mockReturnValue(deleteChain);

  // Transaction mock — creates a tx object with same chainable methods and calls the callback
  mockDb.transaction.mockImplementation(async (fn: Function) => {
    const txInsertChain = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: "tx-mock-id" }]),
    };
    const txUpdateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(undefined),
    };
    const tx = {
      insert: vi.fn().mockReturnValue(txInsertChain),
      update: vi.fn().mockReturnValue(txUpdateChain),
    };
    return fn(tx);
  });

  return { db: mockDb };
});

import { seedVersion, type SeedVersionOptions } from "../../src/seeder/bulk-insert.js";
import { db } from "../../src/db/client.js";

const baseOptions: SeedVersionOptions = {
  parsedBooks: [],
  languageCode: "eng",
  languageName: "English",
  abbreviation: "TST",
  name: "Test Version",
};

describe("seedVersion idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should skip (not throw) when version already exists", async () => {
    // First select (language lookup) returns an existing language
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn(),
    };

    let selectCallCount = 0;
    selectChain.limit.mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) {
        // Language lookup — return existing language
        return Promise.resolve([{ id: "lang-id" }]);
      }
      // Version lookup — return existing version (already exists)
      return Promise.resolve([{ id: "version-id", abbreviation: "TST" }]);
    });

    (db.select as ReturnType<typeof vi.fn>).mockReturnValue(selectChain);

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    // Should NOT throw
    await expect(seedVersion(baseOptions)).resolves.toBeUndefined();

    // Should log the skip message
    expect(consoleSpy).toHaveBeenCalledWith(
      'Version "TST" already exists, skipping.'
    );

    // Should NOT have called insert for the version
    expect(db.insert).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it("should accept attribution fields in options", async () => {
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn(),
    };

    let selectCallCount = 0;
    selectChain.limit.mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) {
        return Promise.resolve([{ id: "lang-id" }]);
      }
      // Version does NOT exist
      return Promise.resolve([]);
    });

    (db.select as ReturnType<typeof vi.fn>).mockReturnValue(selectChain);

    // Track the tx insert values inside the transaction
    let txInsertValues: unknown = null;
    const txInsertChain = {
      values: vi.fn().mockImplementation(function (this: unknown, vals: unknown) {
        txInsertValues = vals;
        return txInsertChain;
      }),
      returning: vi.fn().mockResolvedValue([{ id: "new-version-id" }]),
    };
    const txUpdateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(undefined),
    };

    (db.transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: Function) => {
      const tx = {
        insert: vi.fn().mockReturnValue(txInsertChain),
        update: vi.fn().mockReturnValue(txUpdateChain),
      };
      return fn(tx);
    });

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const optionsWithAttribution: SeedVersionOptions = {
      ...baseOptions,
      attribution: "Public Domain",
      attributionUrl: "https://example.com",
      licenseType: "PD",
    };

    await seedVersion(optionsWithAttribution);

    // The transaction's insert should have been called with attribution fields in the values
    expect(txInsertValues).toEqual(
      expect.objectContaining({
        attribution: "Public Domain",
        attributionUrl: "https://example.com",
        licenseType: "PD",
      })
    );

    consoleSpy.mockRestore();
  });
});
