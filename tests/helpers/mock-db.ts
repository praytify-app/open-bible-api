/**
 * A drizzle stand-in for route tests.
 *
 * Every query-builder method returns the same chain, and awaiting the chain
 * resolves to the next queued result, in the order the route awaits its
 * queries. db.execute() (raw SQL) draws from its own queue. Counting awaits
 * lets tests pin how many round trips a route makes.
 */
export function createMockDb() {
  const selectResults: unknown[][] = [];
  const executeResults: unknown[][] = [];
  const calls = { queries: 0, executes: 0, executedSql: [] as unknown[] };

  const chain: any = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") {
          return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
            calls.queries++;
            return Promise.resolve(selectResults.shift() ?? []).then(resolve, reject);
          };
        }
        return () => chain;
      },
    }
  );

  const db = {
    select: () => chain,
    selectDistinct: () => chain,
    insert: () => chain,
    update: () => chain,
    delete: () => chain,
    execute: async (query: unknown) => {
      calls.executes++;
      calls.executedSql.push(query);
      return executeResults.shift() ?? [];
    },
    // The callback gets this same stand-in, so queued results flow through.
    transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(db),
  };

  return {
    db,
    calls,
    /** Queue results for successive awaited builder queries. */
    queue(...results: unknown[][]) {
      selectResults.push(...results);
    },
    /** Queue results for successive db.execute() calls. */
    queueExecute(...results: unknown[][]) {
      executeResults.push(...results);
    },
    reset() {
      selectResults.length = 0;
      executeResults.length = 0;
      calls.queries = 0;
      calls.executes = 0;
      calls.executedSql.length = 0;
    },
  };
}

export type MockDb = ReturnType<typeof createMockDb>;
