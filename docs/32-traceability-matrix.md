# 32 — Requirements Traceability

Every significant capability should be traceable across product, domain, implementation and verification.

## Traceability chain

Requirement → Business Rule → Domain Model → API → UI/Mobile → Test → Documentation

## Example

REQ-BOOK-EXTENSION

- Requirement: customer can request a rental extension.
- Rules: availability must be rechecked; incremental price is recalculated server-side; original rental history is preserved.
- Domain: booking extension operation + availability query + pricing calculation + transaction record.
- API: extension endpoint with idempotency protection.
- UI: My Rental → Extend.
- Tests: happy path, conflict, price change, unauthorized access, duplicate request.
- Documentation: booking, availability and pricing specifications.

## Rules

- A requirement ID should be stable once published.
- A business rule ID should be stable and referenced by implementation/tests.
- A critical requirement must have at least one automated verification path.
- A change that invalidates a requirement must update its traceability links.
- Do not mark a feature complete when its tests or business rules are missing.
