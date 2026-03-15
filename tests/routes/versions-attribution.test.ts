import { describe, it, expect, vi } from "vitest";

// Mock the DB client before importing app
vi.mock("../../src/db/client.js", () => {
  const mockRows = [
    {
      id: "test-uuid-1",
      abbreviation: "KJV",
      name: "King James Version",
      description: null,
      license: "Public Domain",
      sourceUrl: "https://ebible.org/Scriptures/engkjv_usfm.zip",
      canonType: "protestant",
      verseCount: 31102,
      languageId: "lang-uuid-1",
      attribution: "Public Domain",
      attributionUrl: "https://ebible.org/find/details.php?id=engkjv",
      licenseType: "PD",
      hasAudio: false,
      createdAt: new Date("2024-01-01"),
    },
    {
      id: "test-uuid-2",
      abbreviation: "YOR",
      name: "Yoruba Bible",
      description: null,
      license: "Creative Commons Attribution 4.0",
      sourceUrl: "https://ebible.org/Scriptures/yorulb_usfm.zip",
      canonType: "protestant",
      verseCount: 30000,
      languageId: "lang-uuid-2",
      attribution: "Copyright Yoruba Bible Foundation",
      attributionUrl: "https://ebible.org/find/details.php?id=yorulb",
      licenseType: "CC_BY",
      hasAudio: true,
      createdAt: new Date("2024-01-02"),
    },
  ];

  // Build a chainable mock that resolves to mockRows at the end of the chain
  const createChain = (data: any[] = mockRows) => {
    const chain: any = {};
    chain.select = vi.fn().mockReturnValue(chain);
    chain.from = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockReturnValue(chain);
    chain.orderBy = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockReturnValue(chain);
    chain.offset = vi.fn().mockImplementation(() => {
      // The list endpoint awaits Promise.all — this is the rows promise
      return Promise.resolve(data);
    });
    chain.then = (resolve: any) => Promise.resolve(data).then(resolve);
    return chain;
  };

  const totalChain: any = {};
  totalChain.select = vi.fn().mockReturnValue(totalChain);
  totalChain.from = vi.fn().mockReturnValue(totalChain);
  totalChain.where = vi.fn().mockReturnValue(totalChain);
  totalChain.then = (resolve: any) =>
    Promise.resolve([{ total: mockRows.length }]).then(resolve);

  let callCount = 0;
  return {
    db: {
      select: vi.fn().mockImplementation(() => {
        callCount++;
        // Even calls are the rows query, odd calls are the count query
        if (callCount % 2 === 1) {
          return createChain(mockRows);
        } else {
          return totalChain;
        }
      }),
    },
    queryClient: {},
  };
});

import { app } from "../../src/index.js";

describe("Versions API — attribution fields", () => {
  it("GET /api/v1/versions returns versions with attribution fields", async () => {
    const res = await app.request("/api/v1/versions");
    expect(res.status).toBe(200);

    const body = await res.json();
    const data = body.data;

    // Find self-hosted versions (they have source: "self-hosted")
    const selfHosted = data.filter((v: any) => v.source === "self-hosted");

    if (selfHosted.length > 0) {
      for (const version of selfHosted) {
        // Each self-hosted version should have the attribution fields
        expect(version).toHaveProperty("licenseType");
        expect(version).toHaveProperty("hasAudio");
        expect(version).toHaveProperty("attributionRequired");
        expect(version).toHaveProperty("attribution");
        expect(version).toHaveProperty("attributionUrl");
      }

      // Check PD version has attributionRequired = false
      const pdVersion = selfHosted.find((v: any) => v.licenseType === "PD");
      if (pdVersion) {
        expect(pdVersion.attributionRequired).toBe(false);
      }

      // Check CC_BY version has attributionRequired = true
      const ccByVersion = selfHosted.find(
        (v: any) => v.licenseType === "CC_BY"
      );
      if (ccByVersion) {
        expect(ccByVersion.attributionRequired).toBe(true);
        expect(ccByVersion.hasAudio).toBe(true);
      }
    }
  });

  it("GET /api/v1/versions includes both self-hosted and api-bible sources", async () => {
    const res = await app.request("/api/v1/versions");
    const body = await res.json();
    const data = body.data;

    const sources = new Set(data.map((v: any) => v.source));
    // At minimum we should have api-bible (always present) and self-hosted (from mock)
    expect(sources.has("api-bible")).toBe(true);
    expect(sources.has("self-hosted")).toBe(true);
  });
});
