# 06 — Business Rules

This document defines product rules that must be enforced by the backend. UI validation is helpful but never authoritative.

## Booking integrity

- A vehicle must never have overlapping operational commitments that make it unavailable for the requested rental interval.
- Availability checks must be performed server-side at booking creation, confirmation, extension and vehicle reassignment.
- Booking state transitions must follow an explicit state machine; arbitrary status edits are not allowed.
- A booking must retain the commercial terms that applied when it was confirmed, including price components, discounts and applicable fees.
- Cancellation and no-show outcomes must be policy-driven and auditable.
- Extensions must recalculate availability and price using current rules while preserving the original booking history.
- Manual/phone/walk-in bookings use the same booking engine as online bookings.
- A booking cannot be completed without required rental lifecycle data and an authorized return workflow.

## Availability

Availability is derived from time-bounded operational blocks, including at minimum:

- Confirmed/active rentals.
- Approved reservations that hold inventory.
- Maintenance windows.
- Inspection or readiness holds.
- Accident/damage blocks.
- Manual blackout blocks.
- Vehicle transfer/repositioning holds.

A vehicle's displayed status is a projection/summary, not the source of truth for conflict prevention.

## Pricing

- All booking totals are calculated server-side.
- Client-submitted totals are treated as untrusted input.
- Pricing rules are versioned/effective-dated where necessary.
- Confirmed bookings retain immutable commercial snapshots.
- Pricing supports configurable duration tiers, date/season rules, promotions, extras, deposits, fees and taxes where applicable.
- Rounding rules must be defined centrally per currency.
- Every invoice/receipt must be traceable to its underlying booking and transaction records.

## Financial integrity

- Payments, refunds, deposits and adjustments are recorded as auditable transactions.
- A payment record cannot silently change from one financial meaning to another; corrections use reversal/refund/adjustment records.
- Historical financial documents must not change because current configuration changes.
- Outstanding balance is computed from authoritative transaction records, not from a mutable counter alone.
- Financial permissions are role- and tenant-scoped.

## Pickup and return

- A vehicle cannot enter active rental state without a valid authorized checkout/pickup process.
- Pickup captures required identity/contract references plus mileage, fuel, condition and evidence according to agency policy.
- Return captures final mileage, fuel, condition and evidence.
- Damage identified at return must be linked to the rental and evidence record.
- Staff can flag a discrepancy; liability is not automatically assigned solely by AI.
- A returned vehicle may enter a cleaning/readiness/inspection hold before becoming rentable again.

## Documents

- Vehicle documents have document type, issuer/reference where appropriate, issue date, expiry date and verification status.
- Expiring documents must create configurable alerts before expiry.
- Customer documents are tenant-scoped and access-controlled.
- Contract templates must be versioned so old signed contracts remain reproducible.

## Customers

- Customer identity and eligibility fields are configurable by market/agency policy.
- A customer may have multiple bookings and historical rentals under the same tenant.
- Customers must be able to access their own documents/history but never another customer's data.

## Tenant isolation

- Every tenant-owned resource must be associated with a tenant/organization.
- All reads, writes, searches, exports and background jobs must enforce tenant scope.
- Cross-tenant IDs supplied by a client must not grant access.
- Platform administrators may have broader access only through explicit platform-level authorization.

## Roles

Minimum roles:

- Platform Admin.
- Agency Owner/Admin.
- Branch Manager.
- Staff/Agent.
- Finance role (optional per agency).
- Customer.

Permissions should be capability-based/RBAC and enforced server-side.

## Map and locations

- A pickup/drop-off location must resolve to a supported location entity or explicit coordinate/address object.
- Branch, parking, airport, hotel, delivery zone and custom meeting-point concepts must remain distinct enough to support different operational rules.
- A location can be searchable and map-visible without being a rentable branch.
- Different pickup and return locations require explicit support/eligibility and any associated fee/rule.

## Localization

- Supported product languages: Arabic, French, English.
- Arabic must use RTL layout behavior, not only translated strings.
- Locale-sensitive formatting must be centralized.
- Customer-visible contracts/messages must use the customer's selected language where a translation exists.
- Internal/admin users may choose their own interface language independent of the customer's language.

## Notifications

Notifications are event-driven and must respect user preferences and channel availability.

Important events include booking creation/update, payment status, pickup reminders, return reminders, overdue rentals, document expiry, maintenance due, damage reports and support updates.

## AI safety/product rules

- AI must be assistive, explainable and bounded by domain permissions.
- AI must not bypass business rules.
- AI-generated damage findings require human confirmation before becoming a charge/liability fact.
- AI business answers must be grounded in authorized platform data and identify uncertainty when data is incomplete.
- AI must not expose data outside the current user's authorization scope.
