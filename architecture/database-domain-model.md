# Database Domain Model — Architecture Baseline

## Goal

Define the business entities and relationships before implementation. This is a conceptual model; exact columns/types/indexes are finalized in the database specification and migrations.

## Core tenancy

```text
platform
  └── tenant (agency)
        ├── branches
        ├── memberships
        ├── vehicles
        ├── customers
        ├── bookings
        ├── pricing
        ├── payments
        └── operational records
```

## Identity

- users
- agency_memberships
- roles
- permissions
- role_permissions
- membership_roles where multiple roles are required
- sessions/devices as needed by the selected auth strategy

## Organization and location

- tenants/agencies
- branches
- locations
- parking/pickup points
- delivery zones
- location hours/exceptions

A location can have a geographic point/polygon through PostGIS where applicable.

## Fleet

- vehicle_categories
- vehicles
- vehicle_documents
- vehicle_features
- vehicle_images
- vehicle_blocks
- vehicle_status_events
- vehicle_meter_readings
- vehicle_fuel_readings

Vehicle lifecycle data must be historical/auditable rather than overwritten when historical truth matters.

## Customers

- customers
- customer_documents
- customer_addresses/locations where justified
- customer_notes (access-controlled)
- customer_preferences

Customer records are tenant-scoped. The same person may exist independently in different agencies if policy requires it; cross-tenant customer sharing is not implied.

## Booking domain

- bookings
- booking_items or reserved resources as needed
- booking_status_history
- booking_price_snapshots
- booking_participants/additional drivers where required
- booking_extensions
- booking_cancellations
- booking_notes

A booking references a vehicle assignment or category reservation according to the selected inventory model. The design must support reassignment without destroying history.

## Availability domain

Availability is computed from time-bounded commitments/blocks.

Potential sources:
- booking reservation interval
- active rental interval
- maintenance block
- inspection/readiness hold
- damage/accident hold
- manual blackout
- transfer/repositioning block

Prefer explicit interval records/events over a single mutable `available` boolean.

## Pricing domain

- rate_plans
- rate_rules
- seasonal/special_date_rules
- promotions
- extras
- fees
- deposits/policies
- price_calculations or quote records when needed
- immutable booking price snapshots

Historical booking pricing must remain reproducible even after rates change.

## Rental lifecycle

A booking may lead to:

```text
Reservation
   ↓
Confirmed
   ↓
Pickup / Checkout
   ↓
Active Rental
   ↓
Return / Check-in
   ↓
Inspection
   ↓
Completed / Settled
```

The exact state machine is defined separately in the booking architecture.

## Inspection and damage

- inspections
- inspection_items/checklist entries
- inspection_photos
- damage_records
- damage_evidence
- damage_assessments
- settlement/charge records where applicable

AI findings must never directly become liability truth.

## Maintenance

- maintenance_plans
- maintenance_events
- service_items
- maintenance_vendor/reference data where needed
- readiness records

Maintenance events can create availability-blocking intervals.

## Contracts and documents

- document_types
- document_templates
- document_template_versions
- customer_document_records
- vehicle_document_records
- rental_contracts
- contract_signatures
- generated_documents

Signed historical documents must remain reproducible.

## Payments and billing

- payment_intents/requests where required by provider
- payment_transactions
- deposits
- refunds
- adjustments
- invoices
- invoice_items
- receipts
- provider_webhook_events/reconciliation records

Financial records are append-oriented. Corrections are represented by new transactions rather than silently rewriting historical meaning.

## Notifications

- notification_events
- notifications
- notification_deliveries
- device_push_tokens
- user_notification_preferences

The notification domain is event-driven and channel-aware.

## Operations

- staff_tasks
- task_assignments
- task_events
- operational_checklists
- support_tickets
- ticket_messages

## Partners, loyalty, referrals

Optional later domain:

- partners
- partner_codes/QR references
- referrals
- referral_events
- commissions
- loyalty_accounts
- loyalty_transactions

## SaaS monetization/control plane

These are platform-level entities, distinct from agency rental operations:

- plans
- plan_entitlements
- subscriptions
- subscription_events
- licenses
- license_activation_events
- entitlement_grants
- feature_flags
- tenant_feature_overrides

Agency data must never access platform administration tables without explicit platform authorization.

## Audit

- audit_events

Audit events should capture, where appropriate:
- actor
- tenant
- action
- resource type/id
- timestamp
- outcome
- relevant request/correlation ID
- safe structured metadata

Do not store passwords, authentication tokens, payment secrets, or sensitive data unnecessarily.

## Geographic model

Use PostGIS-backed geography/geometry fields where spatial queries are required.

Examples:
- branch point
- parking point
- pickup point
- delivery-zone polygon
- service area polygon

Keep provider-specific place IDs and raw address text separate from canonical geographic data.

## Cross-cutting database rules

1. Every tenant-owned table must have a clear tenant ownership path.
2. Foreign keys should preserve valid relationships.
3. Unique constraints must encode true business uniqueness.
4. Indexes must follow actual access patterns.
5. Critical financial/historical fields must not be mutable without an explicit audit trail.
6. Timestamps must be consistently stored and displayed according to user locale.
7. Soft-delete is not a universal default; use archival/status semantics when historical records must remain queryable.
8. Database migrations are versioned and reviewed.
9. Large files are stored outside PostgreSQL; metadata lives in the database.
10. Concurrency-sensitive invariants must be protected by transactions and database-level mechanisms where appropriate.

## Implementation note

This document intentionally avoids locking us into one exact SQL schema before the booking/availability/pricing state machines are fully specified. The database specification must follow the business rules, not the other way around.
