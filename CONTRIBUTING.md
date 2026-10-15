# Contributing

The engine follows the same standards as the [Praytify Bible gateway](https://github.com/praytify-app/bible-api/blob/main/CONTRIBUTING.md): one concern per pull request, tests with the change, Conventional Commits, and pull requests that state the problem, approach, trade-offs, and verification.

Engine specifics:

- `pnpm test` runs without a database (queries are mocked). Run `pnpm seed:sample` against a local Postgres to try changes end to end; see the README.
- Response shapes are part of the public contract through the gateway. Additive changes are welcome; removing or renaming a field needs a deprecation note in `CHANGELOG.md` first.
- Never add a translation whose licence does not allow redistribution, and keep `license` and `attribution` accurate.
