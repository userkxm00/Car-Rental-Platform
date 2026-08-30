# Task Record — 01-A Runtime Foundation

Canonical parent: `agent/IMPLEMENTATION-WBS-V2.md` → PHASE 01 → Workstream 01-A [R1].
Legacy traceability: PHASE-01 / TASK-01-01.

## Objective & value

Establish the monorepo runtime foundation every other phase depends on: a reproducible
TypeScript workspace, a bootable NestJS application shell, environment/config/secret
boundaries, the `/api/v1` routing baseline, health/readiness signals, the test runner,
lint/typecheck/build commands, and structured logging with correlation IDs. A new agent
or developer must be able to `npm install && npm run dev` and observe a healthy API.

## Preconditions

- Architecture Freeze accepted (Phase 00 complete).
- Source of truth: `architecture/monorepo-structure.md`, `architecture/api-architecture.md`,
  `architecture/infrastructure-and-deployment.md`, `architecture/testing-and-quality-gates.md`,
  `docs/provider-and-environment-contract.md`, `.env.example`.

## Affected domain modules

- apps/api (new), shared packages (stubs), root tooling.

## Data/schema impact

- None (no migrations in this workstream; Prisma client wiring is bootstrapped with a lazy
  connection so the API can boot and report readiness without a reachable database).

## Security/tenant impact

- Environment variables validated at startup; secrets never committed; no secrets in logs.

## Atomic implementation units (execution order)

1. `01-A01` Initialize workspace/package manager conventions
   - root `package.json` (npm workspaces: `apps/*`, `packages/*`), `package-lock.json` committed,
     engines, root scripts; workspace directory skeleton with minimal stub manifests for
     Release 1 apps and shared packages; `tsconfig.base.json`; `.npmrc`; `.editorconfig`;
     `.gitignore` conventions; `architecture/monorepo-structure.md` package-manager section;
     README development section.
   - Verify: `npm install` clean; `npm ls` resolves workspace tree; `npm run` scripts behave
     with empty workspaces; `npm pkg get` engines/workspaces; git-clean output contains no
     generated artifacts except `package-lock.json`.
2. `01-A02` Bootstrap NestJS application shell
   - `apps/api` NestJS app: main.ts, AppModule, bootstrap with graceful shutdown, global
     validation pipe, API prefix; strict TypeScript; core/common module skeleton.
   - Verify: `npm run start:dev` boots; typecheck passes; boot is instrumented with logs.
3. `01-A03` Environment schema and startup validation
   - `packages/config`: typed env schema (zod), fail-fast validation, per-environment
     separation, provider-neutral secret sourcing.
   - Verify: unit tests for required/missing/invalid env; app refuses to start with invalid env.
4. `01-A04` Configuration module and secret boundaries
   - NestJS ConfigModule wired to validated env; secrets surfaced only inside the
     infrastructure boundary; no secret in logs/errors; `NODE_ENV` semantics.
   - Verify: tests + boot evidence.
5. `01-A05` `/api/v1` routing baseline
   - global prefix, versioned routing, trailing-slash/404 behavior, consistent not-found shape.
   - Verify: supertest against booted app for `/api/v1/...` routing behavior.
6. `01-A06` Health/readiness endpoints
   - `/api/v1/health/live`, `/api/v1/health/ready` with DB readiness check that degrades
     gracefully when the database is unreachable (liveness vs readiness separation).
   - Verify: e2e tests for both endpoints.
7. `01-A07` Test runner and test conventions
   - jest + ts-jest (unit) and jest e2e config; npm test scripts; coverage baseline;
     test path conventions.
   - Verify: sample unit + e2e tests pass; `npm test` at root delegates correctly.
8. `01-A08` Lint/typecheck/build commands
   - ESLint (typescript-eslint + security-aware rules) and Prettier; `npm run lint`,
     `typecheck`, `build` per workspace and at root; strict TS settings enforced in CI-style run.
   - Verify: commands pass with zero errors on committed code.
9. `01-A09` Structured logging and correlation ID baseline
   - request-scoped correlation ID middleware (honors inbound `X-Request-ID`, generates
     otherwise), structured JSON logs in production mode, safe redaction.
   - Verify: e2e test proves correlation ID propagation into logs and response header.
10. `01-A10` Clean development boot and evidence
    - `npm install && npm run start:dev` from clean checkout documented and executed;
      evidence (boot logs, health response, test results) recorded in `agent/EVIDENCE_LOG.md`.
    - Verify: boot sequence reproducible; workstream record closed; state pointer advances.

## Acceptance criteria (workstream)

- Monorepo conventions documented and reproducible from a clean checkout.
- API boots, serves `/api/v1`, validates environment at startup, exposes live/ready endpoints.
- Tests, typecheck, lint and build all pass.
- Structured logs include correlation IDs; no secrets in code or logs.

## Evidence requirements

- test/typecheck/lint/build command outputs;
- boot logs and health endpoint responses;
- git commits per completed unit;
- EVIDENCE_LOG entries.

## Status (updated 2026-08-30)

- 01-A01 `DONE` (commit 53d4dca) — npm workspaces monorepo, 13 @kavriqo/* workspaces, strict TS baseline, conventions documented.
- 01-A02 `DONE` (commit a1cc0a2) — NestJS 11 shell boots; /api/v1 routing alive.
- 01-A03 `DONE` (commit 5dbcdf7) — typed env schema; fail-fast; no secret leakage. Unit coverage landed with 01-A07 (WBS order).
- 01-A04 `DONE` (commit a6e72b6) — typed APP_ENV token; production fail-fast guard; secret boundaries.
- 01-A05 `DONE` (commit b74e6e1) — /api/v1 baseline + documented error envelope + stable codes.
- 01-A06 `DONE` (commit 635bf10) — live/ready with real DB probe; outage degrades, never crashes (pg pool error bug found & fixed in runtime testing).
- 01-A07 `DONE` (commit e962978) — jest harness; app.setup.ts shared wiring; 26 tests (17 unit + 9 e2e).
- 01-A08 `DONE` (commit 0023f13) — ESLint 9 (type-aware + security) + Prettier; zero-error gates.
- 01-A09 `DONE` (commit 0c596f9) — correlation IDs (ALS), structured JSON logs, redaction, access logs; 48 tests total (35 unit + 13 e2e).
- 01-A10 `DONE` (commit 4ecc3b8) — clean clone: npm ci + all gates green + boot + ready=200 evidence.
- **Workstream 01-A: COMPLETE.**

## Rollback/recovery

- All changes are additive scaffolding; rollback = revert commit.
- No production data or destructive migration is involved.
