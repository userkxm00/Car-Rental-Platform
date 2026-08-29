# 06 — Business Rules

This document defines product rules that are authoritative unless superseded by a reviewed ADR. UI validation is helpful but never authoritative.

## Tenancy and authorization

- Every agency-scoped resource belongs to exactly one tenant/agency.
- Tenant identity comes from authenticated context, never from an arbitrary client-supplied tenant ID.
- Every read, write, search, export, file access and background job must enforce tenant scope.
- Platform Admin and Agency Owner are distinct security domains.
- Access is determined by role + tenant membership + permissions + plan entitlements where applicable.

## Booking integrity

- A vehicle must never have overlapping operational commitments that make it unavailable for the requested rental interval.
- Availability checks must be server-side at quote, booking creation, confirmation, extension and vehicle reassignment where inventory changes.
- Booking state transitions follow an explicit state machine; arbitrary status edits are forbidden.
- Confirmed bookings retain immutable commercial terms: rates, discounts, fees, extras, deposit terms and currency.
- Cancellation, no-show, late return and refund outcomes are policy-driven and auditable.
- Extensions re-check availability and recalculate only the extension portion under current rules; original confirmed history remains intact.
- Manual/phone/walk-in bookings use the same core booking engine as online bookings.
- Retryable booking commands must be idempotent.
- A booking cannot be confirmed against unavailable inventory.

## Availability

Availability is derived from time-bounded operational commitments, including at minimum:
- confirmed/active rentals
- inventory-holding reservations according to policy
- maintenance windows
- inspection/readiness holds
- accident/damage blocks
- manual blackout blocks
- vehicle transfer/repositioning holds

A vehicle's displayed status is a projection/summary, never the sole source of truth for conflict prevention.

## Quotes and pricing

- Quotes and booking totals are calculated server-side.
- Client-submitted totals are untrusted.
- Pricing rules are effective-dated/versioned where historical reconstruction requires it.
- Confirmed bookings retain immutable pricing snapshots.
- Pricing may include duration tiers, date/season rules, weekend rules, promotions, extras, delivery fees, deposits, taxes and other configured charges.
- Rounding rules are centralized by currency.
- A quote may expire; an expired quote cannot be silently treated as a current price.
- Every invoice/receipt must trace to authoritative booking and transaction records.

## Financial integrity

- Payments, refunds, deposits and adjustments are auditable transactions.
- A transaction cannot silently change financial meaning; corrections use reversal/refund/adjustment records.
- Historical documents do not change because current configuration changes.
- Outstanding balance is computed from authoritative transaction records, not only from a mutable counter.
- Financial permissions are role- and tenant-scoped.
- Subscription/license billing is separate from rental/customer payment records.

## Pickup and return

- A vehicle cannot enter active rental state without an authorized pickup/check-out workflow.
- Pickup captures required identity/document references plus mileage, fuel, condition and evidence according to agency policy.
- Return captures final mileage, fuel, condition and evidence.
- Damage at return links to the rental/inspection and evidence.
- A discrepancy may be flagged by staff; liability is not automatically assigned solely by AI.
- Returned vehicles may enter cleaning/readiness/inspection holds before rentable state.

## Documents

- Vehicle documents contain document type, issue/expiry data and verification state where applicable.
- Expiry alerts are configurable.
- Customer documents are tenant-scoped and access-controlled.
- Contract templates are versioned so historical signed contracts remain reproducible.
- Sensitive documents use private/signed access rather than permanent public URLs.

## Customers

- Customer identity and eligibility fields are configurable by agency/market policy.
- Customers may have many bookings and historical rentals within each agency relationship.
- Customer self-service can expose only records authorized for that customer.
- A future Customer App must use the same customer/booking model as Customer Web.

## Roles

Minimum roles:
- Platform Admin
- Agency Owner/Admin
- Branch Manager
- Staff/Agent
- Finance (optional)
- Customer

Permissions are capability-based/RBAC and are enforced server-side.

## Map and locations

- Pickup/drop-off can be branch, airport, hotel, delivery zone or custom point when enabled by agency policy.
- Location identity, address, coordinates and external provider IDs are distinct concepts.
- Different pickup/return locations require explicit eligibility and any applicable repositioning/delivery fee.
- Delivery-zone eligibility and distance-based fees are calculated server-side.
- Exact live vehicle position is never public by default.

## Localization

- Supported product languages: Arabic, French, English.
- Arabic uses first-class RTL layout behavior.
- Locale-sensitive number/date/currency formatting is centralized.
- Customer-facing contracts and messages use the selected customer language where supported.
- Internal users may select an interface language independently.

## Notifications

Notifications are event-driven and respect channel availability/preferences.

Important events include booking updates, payment status, pickup/return reminders, overdue rentals, document expiry, maintenance due, damage reports, support updates, trial/subscription status and security events.

## Licensing and entitlements

- Feature access is determined by computed entitlements, not raw license-key string checks.
- Trial duration, grace periods and resource limits are configurable.
- Subscription expiration must not immediately delete tenant data.
- Platform Admin can issue/revoke licenses and temporary grants only through auditable operations.

## AI

- AI is assistive, permission-aware and bounded by domain rules.
- AI never bypasses authorization or financial/booking rules.
- AI damage findings require human confirmation before affecting liability/settlement.
- Business answers are grounded only in data authorized for the requesting user and should expose uncertainty when evidence is incomplete.
