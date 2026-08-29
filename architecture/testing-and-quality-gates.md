# Testing & Quality Gates

## Test pyramid

### Unit tests

Test pure business rules and deterministic calculations:
- pricing
- state transitions
- permission policies
- validation
- fee calculation
- availability helpers

### Integration tests

Test real module boundaries with a test database/provider doubles where appropriate:
- database constraints
- tenant isolation
- booking + availability
- payments/reconciliation
- document ownership
- notifications/events

### E2E tests

Test critical user journeys through the real application surfaces:
- agency sign-in
- create vehicle
- create booking
- prevent overlapping booking
- confirm/cancel booking
- checkout/check-in
- payment recording/refund flow
- document expiry alert
- staff mobile pickup/return
- multilingual/RTL critical screens

## Concurrency tests

Required for booking and payment commands:
- simultaneous booking attempts for same vehicle
- duplicate command with same idempotency key
- retried webhook
- extension race against new reservation

## Security test matrix

Verify every privileged endpoint against:
- unauthenticated user
- wrong tenant
- wrong role
- missing permission
- valid authorized actor

## Database tests

Migrations must be testable from a clean database. Test:
- foreign keys
- unique constraints
- check constraints
- spatial indexes/queries where practical
- booking conflict invariant
- tenant filtering

## Contract tests

API schemas should detect incompatible response/request changes affecting web/mobile clients.

## Mobile quality

Test on real devices before release for:
- camera
- QR scanning
- permissions
- push notifications
- deep links
- location
- poor network/error states
- RTL

## CI gates

A normal merge should eventually require:
1. formatting check
2. lint
3. typecheck
4. unit tests
5. integration tests
6. security/dependency checks
7. production build

Critical feature PRs also require relevant E2E tests.

## Definition of done

A feature is not done when code compiles. It is done when:
- requirements are satisfied;
- business rules are enforced server-side;
- authorization is verified;
- migrations are safe;
- tests cover critical behavior;
- UX/error/empty/loading states exist;
- i18n keys exist for supported locales;
- observability is adequate;
- docs are updated;
- no known critical security regression remains.
