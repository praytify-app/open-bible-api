import { describe, it, expect } from "vitest";
import { Bulkhead } from "../../src/lib/bulkhead.js";

describe("Bulkhead", () => {
  it("runs up to the limit at once and queues the rest in order", async () => {
    const bulkhead = new Bulkhead(2, 10);
    const a = await bulkhead.acquire();
    const b = await bulkhead.acquire();
    expect(bulkhead.stats).toEqual({ active: 2, waiting: 0 });

    const order: string[] = [];
    const c = bulkhead.acquire().then((release) => (order.push("c"), release));
    const d = bulkhead.acquire().then((release) => (order.push("d"), release));
    expect(bulkhead.stats).toEqual({ active: 2, waiting: 2 });

    a!();
    const releaseC = await c;
    expect(order).toEqual(["c"]);
    expect(bulkhead.stats).toEqual({ active: 2, waiting: 1 });

    b!();
    const releaseD = await d;
    expect(order).toEqual(["c", "d"]);

    releaseC!();
    releaseD!();
    expect(bulkhead.stats).toEqual({ active: 0, waiting: 0 });
  });

  it("turns callers away once the queue is full", async () => {
    const bulkhead = new Bulkhead(1, 1);
    const held = await bulkhead.acquire();
    const queued = bulkhead.acquire();
    expect(await bulkhead.acquire()).toBeNull();

    held!();
    const release = await queued;
    expect(release).toBeTypeOf("function");
    release!();
    expect(bulkhead.stats).toEqual({ active: 0, waiting: 0 });
  });

  it("ignores a second release of the same slot", async () => {
    const bulkhead = new Bulkhead(1, 0);
    const release = await bulkhead.acquire();
    release!();
    release!();
    expect(bulkhead.stats).toEqual({ active: 0, waiting: 0 });
    expect(await bulkhead.acquire()).toBeTypeOf("function");
  });
});
