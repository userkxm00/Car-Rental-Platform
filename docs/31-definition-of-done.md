# 31 — Definition of Done

A feature is not done because a page renders or an endpoint returns 200.

## Product completeness

- Requirement exists and is unambiguous.
- User role and permissions are defined.
- Happy path and failure paths are defined.
- Business rules are documented.
- Localization keys exist in Arabic, French and English.
- RTL behavior is verified where applicable.
- Accessibility/usability requirements are satisfied.

## Data and backend

- Domain model is appropriate.
- Database constraints/indexes are reviewed.
- Migrations are reversible or have a documented rollback strategy.
- Server-side validation exists.
- Authorization is enforced.
- Tenant isolation is enforced.
- Idempotency/concurrency behavior is defined where relevant.
- Audit behavior is defined for sensitive actions.

## Frontend/mobile

- Loading, empty, success and error states exist.
- Unauthorized/forbidden states are handled safely.
- No business-critical rule relies only on client logic.
- Mobile and web use the same authoritative domain behavior.
- Offline behavior is explicit rather than accidental.

## Financial features

- Server recalculates authoritative totals.
- Transaction history is auditable.
- Refund/adjustment semantics are explicit.
- Historical documents/snapshots remain reproducible.

## Testing

- Unit tests cover business rules.
- Integration tests cover important API/database flows.
- E2E tests cover critical user journeys.
- Permission/tenant-isolation tests exist for protected areas.
- Race/idempotency tests exist where applicable.

## Operations

- Logs/metrics/error reporting exist for production-critical flows.
- Background jobs are retry-safe.
- External provider failures have controlled behavior.
- Documentation is updated.

## Release gate

No critical security, financial, tenant-isolation, or booking-integrity defect may remain open for a production release.
