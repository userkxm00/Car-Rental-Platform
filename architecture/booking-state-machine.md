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

## Implemented state machine (05-C)

The operative machine (per `agent/IMPLEMENTATION-WBS-V2.md` 05-C) is enforced
in `apps/api/src/bookings/domain/booking-transitions.ts`. Every transition is
a named command with a fixed source set, a single target and an explicit
permission (05-C12); the API exposes only commands — clients can never set a
status directly, and every applied transition appends an audit row to
`booking_status_history` in the same transaction.

Mapping to the proposed states above: QUOTED = the linked quote record
(05-A); PREPARING/CHECKED_OUT = READY_FOR_PICKUP; IN_RENTAL = ACTIVE;
RETURNING = RETURN_PENDING; INSPECTION_PENDING = RETURNED. Extensions and
overdue are records (05-D), never statuses.

| Command | From | To | Permission |
|---|---|---|---|
| requestConfirmation | DRAFT, HOLD | PENDING_CONFIRMATION | booking.create |
| confirm | PENDING_CONFIRMATION | CONFIRMED | booking.confirm |
| markReady | CONFIRMED | READY_FOR_PICKUP | booking.confirm |
| checkOut | READY_FOR_PICKUP | ACTIVE | booking.confirm |
| requestReturn | ACTIVE | RETURN_PENDING | booking.return |
| completeReturn | RETURN_PENDING | RETURNED | booking.return |
| openSettlement | RETURNED | SETTLEMENT_PENDING | booking.return |
| complete | SETTLEMENT_PENDING | COMPLETED | booking.return |
| cancel | DRAFT, HOLD, PENDING_CONFIRMATION, CONFIRMED, READY_FOR_PICKUP | CANCELLED | booking.cancel |
| reject | PENDING_CONFIRMATION | REJECTED | booking.confirm |
| expire | HOLD | EXPIRED | booking.cancel |
| markNoShow | READY_FOR_PICKUP | NO_SHOW | booking.confirm |

Command preconditions implemented in 05-C (further lifecycle policy lands
in 05-D and the payments phase, 09):

- **requestConfirmation** attaches the customer identity and the pricing
  quote; the quote must be tenant-owned, target-matching and unexpired.
- **confirm** requires the customer, re-checks the interval (guard-exempt
  conflict re-check + live hold for vehicle bookings; remaining capacity
  for category bookings), refreshes the vehicle hold to the interval end,
  and captures the immutable price snapshot (05-B06) from the quote —
  pricing is null until the pricing engine (PHASE-06).
- **markReady/checkOut** require a physical vehicle assignment; check-out
  consumes the hold.
- **cancel/reject/noShow** require a documented reason and release the
  hold; refund/fee policy evaluation is 05-D01/D02.
- **expire** is allowed only once the booking's own hold has actually
  expired; automated hold expiration is 05-D03.
- **complete** is the explicit, audited close; financial settlement
  conditions are enforced with the payments phase (09).
