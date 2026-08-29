# Booking State Machine — Design Baseline

## Goal

Make every booking transition explicit, auditable, and enforceable server-side.

## Proposed states

```text
DRAFT
  ↓
PENDING
  ↓
CONFIRMED
  ↓
CHECKED_IN / PICKUP_PENDING
  ↓
ACTIVE
  ↓
RETURN_PENDING
  ↓
INSPECTION_PENDING
  ↓
COMPLETED
```

Terminal/exception states:

```text
CANCELLED
NO_SHOW
EXPIRED
REJECTED
```

A final state may still require settlement/audit records.

## Transition principles

- UI must never directly set an arbitrary status.
- Each transition is a named domain command.
- The command checks actor permission, tenant scope, current state, relevant dates, availability, financial conditions, and required documents/data.
- Invalid transitions return a stable business error code.
- Sensitive transitions create audit events.

## Examples

### Create booking

`createBooking`

Checks:
- customer access/identity
- pickup and return locations
- requested interval
- vehicle/category availability
- pricing calculation
- required data
- entitlement limits where agency-created capacity applies

Creates a pending/draft booking according to channel and policy.

### Confirm booking

`confirmBooking`

Checks authoritative availability again immediately before confirmation.

Stores price/commercial snapshot and confirmation timestamp.

### Pickup

`startRental`

Requires:
- authorized staff
- valid booking state
- required customer/driver information
- pickup inspection
- mileage/fuel capture
- contract requirements
- payment/deposit conditions according to policy

Creates/activates the rental interval.

### Extension

`extendBooking`

Checks:
- current active rental
- future availability
- updated pricing
- operational constraints
- payment/balance requirements

Does not rewrite the original booking history.

### Return

`startReturn` / `completeReturn`

Requires:
- authorized staff
- active rental
- return inspection
- final mileage/fuel
- damage workflow if applicable
- settlement conditions according to policy

Vehicle may enter readiness/maintenance hold after return.

### Cancellation

`cancelBooking`

Policy determines eligibility, refund/fee outcome, and audit reason.

## Booking channels

The same state machine is used for:

- website booking
- future customer app booking
- staff/manual booking
- phone/walk-in booking
- administrative booking imports where supported

The channel may affect required metadata, but must not create a separate business logic implementation.

## Time semantics

Store authoritative timestamps consistently. Display in the tenant/user timezone as appropriate.

Date-only rental rules and time-of-day pickup/return rules must be modeled distinctly rather than relying on ambiguous strings.

## Concurrency

Confirmation, assignment, and extension are concurrency-sensitive.

The final implementation must combine:
- transaction boundaries
- conflict detection
- appropriate locking/constraints
- idempotency
- retry-safe behavior

Exact PostgreSQL mechanics are specified by the Availability implementation design.

## Snapshot policy

At confirmation, retain immutable/reproducible values for:

- vehicle/category context
- pricing/rates used
- discounts
- extras
- fees
- deposit
- taxes where applicable
- commercial policy/version identifiers

## Cancellation/no-show

Must preserve:
- actor/channel
- timestamp
- reason
- policy version
- financial result
- refund/fee records

## Definition of done

Booking engine is not complete until all transitions have:

- authorization rules
- validation rules
- business error codes
- audit behavior
- transaction/concurrency behavior
- unit/integration tests
- E2E critical-path coverage
