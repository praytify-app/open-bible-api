/**
 * A prepared statement built on first use, then reused.
 *
 * Built lazily rather than at import so importing a route never touches the
 * query builder: tests that stub the database with a partial builder can
 * import the app, and import order stays free of database setup.
 */
export function prepared<T>(build: () => T): () => T {
  let statement: T | undefined;
  return () => (statement ??= build());
}
