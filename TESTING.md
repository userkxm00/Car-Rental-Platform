# Testing Conventions — KAVRIQO

## Commands

```bash
npm test                # unit tests across all workspaces (jest, --runInBand)
npm run test:cov        # unit tests with coverage
npm run test:e2e        # API e2e suites (supertest against a real test database)
npm run typecheck       # strict TypeScript across workspaces
npm run build           # production builds
npm run lint            # ESLint (type-aware) across workspaces
npm run db:generate     # generate Prisma Client (offline-capable)
npm run db:migrate      # apply pending migrations (prisma migrate deploy)
npm run db:migrate:create <name>  # create a migration from schema drift
```

## Local database (PostgreSQL)

- The repository requires a real PostgreSQL (architecture: PostgreSQL + Prisma).
- In restricted-network sandboxes (no Docker/apt), a local server can be
  provisioned with the `embedded-postgres` npm package (real PostgreSQL
  binaries bundled in npm — e.g. `@embedded-postgres/linux-x64@17.10.0-beta.17`),
  initialized with `initdbFlags: ['--encoding=UTF8', '--locale=C.UTF-8']`.
- `prisma.config.ts` uses the JavaScript schema engine + `@prisma/adapter-pg`
  so `migrate deploy`/`migrate status`/client work without downloading native
  engine binaries. A small `patch-package` patch (`patches/`) fixes upstream
  prisma/prisma#27403 (pg catalog OIDs 18/19 unmapped).
- Known offline limitation: WASM-engine DB-introspection commands
  (`db push`, `db pull`, two-datamodel `migrate diff`) are unstable in this
  engine build. Offline migration creation fallback:
  `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script`.
  On networked machines the classic `prisma migrate dev` flow is canonical.
- DB test suites must not mock the database when the point is to prove real
  constraints/transactions/tenant isolation. They read `TEST_DATABASE_URL`
  (default `postgresql://postgres:postgres@127.0.0.1:5432/car_rental`).

## Layout

- **Unit tests** live next to code as `*.spec.ts` (`packages/config/src`,
  `apps/api/src/...`). Jest config is declared in each package's `package.json`.
- **API e2e tests** live in `apps/api/test/*.e2e-spec.ts` using the real
  `AppModule` + `configureApp()` wiring (the exact production wiring from
  `app.setup.ts`), so tests never drift from what is deployed.
- **Database-dependent suites** connect to the local PostgreSQL (see above);
  auth suites additionally run a local JWKS server (test-only provider).
- The `_prisma_migrations` bookkeeping table is Prisma-standard; migrations
  live in `prisma/migrations/` and are plain SQL (reviewable).

## Quality gates (from `architecture/testing-and-quality-gates.md`)

- Booking/payment/availability logic requires concurrency and idempotency tests.
- Every privileged endpoint is covered by the security matrix (unauthenticated,
  wrong tenant, wrong role, missing permission, valid actor).
- Critical domain rules must not depend only on browser/UI tests.

## Rules

- Never weaken a test to make it pass; never delete a failing test as a fix.
- e2e suites must close the application (`app.close()`) and release pools.
