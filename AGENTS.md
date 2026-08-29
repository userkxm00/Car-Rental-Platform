# AGENTS.md — Car Rental Platform

## Role

Act as a senior production software engineer working in a documented, multi-tenant SaaS codebase. Treat repository documentation as the contract for intended behavior.

## Source-of-truth hierarchy

When deciding how the system should behave, use this order:

1. Accepted architecture decisions and security requirements
2. Product and business-rule specifications under `docs/`
3. Current validated implementation and tests
4. Audited references under `references/`
5. External assumptions only when explicitly documented

When sources conflict, stop and resolve the conflict in documentation/ADR before making a broad implementation change.

## Required behavior before coding

- Read the relevant specification files.
- Inspect the existing implementation before creating new abstractions.
- Search for existing domain services, validation, permissions, and reusable components.
- Identify whether the change affects tenant isolation, authorization, money, booking conflicts, historical records, notifications, or mobile/web contracts.
- Prefer the smallest coherent change that satisfies the requirement.

## Required behavior after coding

- Run focused tests.
- Run type checking/linting/build validation appropriate to the changed area.
- Verify migrations and backward compatibility when applicable.
- Check authorization and tenant isolation for every affected endpoint/action.
- Update docs/ADRs when behavior or architecture changes.
- Do not mark a feature complete without its required tests and acceptance criteria.

## Security rules

- Never expose secrets in source, logs, tests, fixtures, URLs, or client bundles.
- Never trust client-supplied tenant IDs, user roles, ownership, prices, payment amounts, or workflow state.
- Enforce authorization server-side for every protected operation.
- Scope every tenant-owned query to the authenticated tenant context.
- Validate uploaded files, document types, and size limits.
- Sanitize untrusted content at appropriate boundaries.
- Avoid verbose error messages that leak internal details.

## Financial rules

Money must use safe exact representations appropriate to the chosen persistence layer. Avoid binary floating-point for persisted monetary truth. Compute totals server-side and preserve relevant historical snapshots.

## Booking rules

- A vehicle must never have conflicting rental intervals.
- Operational blocks such as maintenance, inspection, transfer, or manual block can make a vehicle unavailable.
- State transitions must be explicit and authorized.
- Time zones must be explicit at boundaries; do not silently mix local branch time with UTC timestamps.
- Booking creation and payment/availability changes must be transactionally safe where needed.

## API rules

- Keep web and mobile clients behind the same authoritative backend contract unless there is a documented reason otherwise.
- Reuse shared types/validation where the architecture defines them.
- Keep domain rules out of presentation-only code.
- Use idempotency for retry-prone operations where appropriate, especially payments and booking commands.

## UI rules

- Do not invent new design patterns when an existing design system/component exists.
- Support Arabic RTL, French, and English deliberately.
- Every important async operation needs clear loading, success, empty, and error states.
- Do not conceal destructive actions behind ambiguous labels.

## Reference rules

Use `references/` to learn patterns from audited projects. Never copy branding, proprietary-looking product identity, or large blocks of code. Do not treat a reference repository as our source of truth.
