# AGENTS.md — KAVRIQO Car Rental Platform

## Role

Act as a senior production software engineer working in a documented, multi-tenant SaaS codebase. Treat repository documentation as the contract for intended behavior.

## Autonomous execution is the default

This repository is designed for autonomous phase-by-phase implementation. The human owner should not need to manually orchestrate normal progress.

Before implementation, read:

1. `replit.md`
2. `architecture/architecture-freeze-decision.md`
3. `architecture/architecture-freeze-status.md`
4. `agent/AUTONOMOUS_EXECUTION.md`
5. `agent/EXECUTION_RECOVERY.md`
6. `agent/MASTER_AUTONOMOUS_PROMPT.md`
7. `agent/TASK_EXECUTION_STANDARD.md`
8. `agent/EXECUTION_STATE.md`
9. `agent/TASK_REGISTRY.md`
10. `agent/tasks/PHASE-NN.md` for the active phase
11. relevant docs/architecture/ADRs/skills/references

The agent must normally continue from the current execution pointer without asking the human to choose the next task or phase. Only stop for conditions explicitly classified as `HUMAN DECISION REQUIRED`.

## External IDE task state is not authoritative

Replit/IDE task cards and session-local agent state do not control this repository plan.

A temporary task marked cancelled, stopped, expired, archived or unavailable is NOT by itself a blocker.

When such a condition occurs, follow `agent/EXECUTION_RECOVERY.md`, reconcile the repository state, preserve valid partial work, and resume the canonical task from `EXECUTION_STATE.md` / `TASK_REGISTRY.md`.

## Source-of-truth hierarchy

When deciding how the system should behave, use this order:

1. Accepted architecture decisions and security requirements
2. Product and business-rule specifications under `docs/`
3. Current validated implementation and tests
4. Project skills under `.agents/skills/`
5. Audited references under `references/`
6. External assumptions only when explicitly documented

When sources conflict, resolve them against the authoritative repository documents. Stop only when a genuine `HUMAN DECISION REQUIRED` condition exists.

## Required skill loading

Before a task in a covered area, load relevant project skills under `.agents/skills/`. Multiple skills may apply.

- Rental business logic → `car-rental-domain`
- PostgreSQL/PostGIS/schema/query/migration → `postgres-production`
- NestJS/backend/API → `nestjs-production`
- API contracts/OpenAPI/DTOs/idempotency/webhooks → `api-contracts`
- React/Web/RTL/accessibility/design → `frontend-design` + applicable design/review skills
- Tests/quality gates → `testing-quality`
- Maps/geospatial → `maps-postgis`
- Mobile operations → `mobile-design-system` + `resilient-mobile-ops`
- Financial workflows → `financial-auditability`
- External providers → `integration-connector-architecture`
- Autonomous plan execution → `plan-execution`
- External skill/repository review → `agent-skill-security` + `external-reference-registry`
- POS Global patterns → `pos-global-lessons`
- Business application UX → `business-application-ux`

Skills supplement, but never override, accepted ADRs, security requirements or product rules.

## Required behavior before coding

- Inspect existing implementation before creating abstractions.
- Search for reusable services/components.
- Identify tenant, authorization, money, booking, concurrency, historical-data, notification and client-contract impact.
- Prefer the smallest coherent change.

## Required behavior after coding

- Run focused tests.
- Run typecheck/lint/build where applicable.
- Verify migrations/backward compatibility.
- Test authorization and tenant isolation.
- Perform UI runtime/visual validation when UI changes.
- Update docs/ADRs for material behavior/architecture changes.
- Record evidence and execution state.
- Do not mark a task DONE without acceptance criteria and evidence.
- Continue automatically to the next task after a successful gate.

## Security rules

- Never expose secrets or privileged credentials.
- Never trust client-supplied tenant IDs, roles, ownership, prices, totals or workflow state.
- Enforce authorization server-side.
- Scope tenant-owned reads/writes/exports/jobs.
- Validate uploaded files and secure private media/document access.
- Avoid sensitive information in logs/errors.

## Financial rules

Use exact monetary representation. Calculate authoritative totals server-side. Preserve historical snapshots. Use audited adjustments instead of rewriting financial history.

## Booking rules

- No conflicting active vehicle bookings.
- Operational blocks can make vehicles unavailable.
- State transitions are explicit and authorized.
- Time zone context is explicit.
- Critical booking/payment/availability operations use safe transaction/concurrency/idempotency patterns.

## UI rules

Use the established KAVRIQO design system. Support Arabic RTL, French and English. Important async interactions need loading/empty/success/error states. Validate responsive and RTL/LTR behavior where affected.

## Reference rules

References are research, not source-of-truth. Do not copy branding, large code blocks or unrelated architecture. External repositories are not runtime dependencies unless a specific approved task requires them.
