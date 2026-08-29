# Database Schema Specification

## Status
Draft v1 — pre-implementation. This document is the canonical logical schema specification for Phase 00. Physical column types, indexes, and migrations must conform to this model unless an ADR changes it.

## Design goals

- PostgreSQL is the durable system of record.
- PostGIS supports geographic data where spatial queries are required.
- Tenant-owned records have explicit tenant ownership or an unambiguous ownership path.
- Historical commercial/financial facts are preserved rather than recalculated from mutable configuration.
- Operational state is modeled explicitly; availability is computed from time-bounded commitments/blocks.
- IDs are opaque and externally safe; do not expose sequential business identifiers as authorization mechanisms.
- Timestamps are stored in UTC; presentation is localized per agency/user preference.
- Money is represented with exact numeric types, never floating point.

## Core identity and tenancy

### users
One platform identity per person/account.

Key fields (logical):
- id
- email / normalized_email (nullable according to auth strategy)
- phone / normalized_phone (nullable according to auth strategy)
- display_name
- status
- locale
- timezone
- created_at / updated_at / last_login_at

### organizations
Represents an agency/tenant.

- id
- legal/business name
- slug
- default_locale
- default_timezone
- base_currency
- status
- created_at / updated_at

### organization_memberships
Connects users to an organization.

- id
- organization_id
- user_id
- role_id or role reference
- status
- joined_at
- invited_by

A user may belong to multiple organizations.

### roles / permissions / role_permissions
Roles are named bundles of capabilities. Permissions are atomic capabilities.

Platform roles and agency roles must remain conceptually separate even if represented by shared infrastructure.

## Organization structure

### branches
- id
- organization_id
- code
- name
- status
- address_id
- location_point
- opening-hours configuration

### locations
Reusable semantic locations such as airport, hotel, pickup point, parking area or custom meeting point.

- id
- organization_id (nullable for global reference data where appropriate)
- type
- parent_location_id (nullable)
- name/localized names
- address_id
- geog (PostGIS geography(Point,4326), where applicable)
- provider_place_id (nullable)
- status

### service_zones
Delivery/pickup zones.

- id
- organization_id
- name
- zone_geog (PostGIS geography(Polygon/MultiPolygon,4326))
- pricing_rule_id / fee policy reference
- active

### parking_spots
- id
- branch_id
- location_id
- label
- coordinates (optional)
- status

## Fleet

### vehicle_categories
- id
- organization_id
- name
- description
- seats
- doors
- transmission
- fuel_type
- category attributes
- status

### vehicles
- id
- organization_id
- branch_id
- category_id
- public_slug
- plate_number
- VIN/chassis identifier (protected)
- make
- model
- model_year
- color
- current_odometer
- current_fuel_level
- operational_state
- acquisition/cost metadata where appropriate
- created_at / updated_at

### vehicle_documents
- id
- vehicle_id
- document_type
- document_number/reference
- issued_at
- expires_at
- verification_status
- storage_object_id

### vehicle_blocks
Generic time-bounded non-rental blocks.

- id
- organization_id
- vehicle_id
- block_type
- starts_at
- ends_at
- reason
- source reference
- status
- created_by

Types include maintenance, damage, inspection, manual blackout, transfer/repositioning, cleaning/readiness and other policy-defined blocks.

## Customers

### customers
Tenant-scoped customer/business profile.

- id
- organization_id
- user_id (nullable for guest/manual customer records, depending on identity strategy)
- first/last name
- normalized contact fields
- customer status
- preferred_locale
- risk/review flags (non-automated decisions only)
- created_at / updated_at

### customer_documents
- id
- customer_id
- document_type
- document_reference
- issued_at / expires_at
- verification_status
- storage_object_id
- verified_by / verified_at

Sensitive document data must be minimized and access controlled.

## Booking domain

### bookings
The commercial/rental aggregate root.

- id
- organization_id
- booking_number (human-friendly unique per organization)
- customer_id
- vehicle_id (nullable before allocation where category-level booking is supported)
- vehicle_category_id
- pickup_location_id
- return_location_id
- starts_at
- expected_ends_at
- actual_started_at
- actual_returned_at
- lifecycle_status
- source/channel
- currency
- pricing_snapshot_id
- contract_id (nullable until generated)
- created_by
- created_at / updated_at

### booking_status_history
Append-only history of lifecycle transitions.

- id
- booking_id
- from_status
- to_status
- actor_type
- actor_id
- reason
- metadata
- created_at

### booking_items / booking_extras
Optional extras/services attached to a booking.

Each line needs an immutable commercial snapshot when confirmed.

### booking_pricing_snapshots
Immutable record of the pricing result accepted for the booking.

- id
- booking_id
- pricing_engine_version
- base_amount
- discount_amount
- fee_amount
- tax_amount (where applicable)
- deposit_amount
- total_amount
- currency
- duration inputs
- rate rule references
- extras snapshot
- calculation metadata
- created_at

Historical booking price must not depend on current mutable pricing rows.

## Availability model

Availability is computed from:
- booking/rental intervals that hold inventory
- vehicle_blocks
- policy-defined buffers
- branch/location constraints

Do not maintain a single authoritative `available` boolean.

Where safe and useful, database-level exclusion constraints using PostgreSQL range types may be evaluated to prevent overlapping intervals for the same vehicle. The final implementation must document the chosen constraint/locking strategy.

## Pricing

### pricing_plans / rate_rules / seasonal_rules / promotion_rules
Exact physical decomposition may differ, but the domain must support effective-dated pricing.

Required concepts:
- scope: organization / branch / category / vehicle where appropriate
- effective period
- duration tier
- base rate
- special dates/seasons
- weekend/holiday rules
- promotion/discount
- minimum/maximum rental durations
- mileage/fuel policy references
- location/delivery fees
- version/status

## Contracts and files

### contracts
- id
- organization_id
- booking_id
- template_id
- template_version
- status
- signed_at
- signed_by_customer
- storage_object_id
- content_hash
- created_at

### contract_templates
Versioned templates. Historical signed agreements must remain reproducible.

### storage_objects
Metadata only; bytes live in object storage.

- id
- organization_id
- bucket/provider reference
- object_key
- mime_type
- byte_size
- checksum
- classification
- retention metadata
- created_at

## Inspection and damage

### inspections
- id
- organization_id
- booking_id
- vehicle_id
- type: pickup / return / ad-hoc
- performed_by
- performed_at
- odometer
- fuel_level
- condition_summary
- status

### inspection_items
Checklist-level condition observations.

### inspection_photos
- id
- inspection_id
- storage_object_id
- area/category
- captured_at
- checksum
- metadata

### damage_records
- id
- organization_id
- booking_id
- vehicle_id
- inspection_id
- category/area
- severity
- description
- source: staff/customer/ai
- status
- liability_status
- created_by

AI can propose findings, but it cannot silently turn them into liability or charges.

## Maintenance and readiness

### maintenance_records
- id
- organization_id
- vehicle_id
- maintenance_type
- status
- opened_at
- completed_at
- odometer
- provider
- cost
- notes

### maintenance_schedules
- id
- organization_id
- vehicle_id/category_id
- schedule_type
- due_by_date
- due_by_odometer
- threshold configuration
- active

### readiness_checks
Optional operational handoff between return and next rental.

## Financial domain

### payment_transactions
Append-oriented transaction records.

- id
- organization_id
- booking_id / invoice_id where applicable
- transaction_type
- status
- amount
- currency
- provider
- provider_reference
- idempotency_key
- occurred_at
- metadata

Never use the raw client amount as authoritative.

### deposits
Separate lifecycle for held/released/partially applied deposit.

### refunds / adjustments
Explicit records rather than mutating an earlier payment meaning.

### invoices
- id
- organization_id
- booking_id
- invoice_number
- status
- currency
- subtotal
- discounts
- fees
- tax
- total
- issued_at
- due_at
- storage_object_id

## Notifications and operations

### notifications
User-visible event records with delivery state.

### notification_preferences
Per user/channel/event preferences.

### push_devices
Multiple devices per user; tokens are rotatable/revocable.

### tasks
Operational tasks such as pickup preparation, return inspection or vehicle readiness.

### task_assignments
Task-to-staff relationship and completion evidence.

## Support / partners / loyalty

### support_tickets / support_messages
Tenant-scoped customer/staff support records.

### partners / partner_codes / referral_events
For future hotel/travel/affiliate relationships.

### loyalty_accounts / loyalty_events
Event-oriented points history rather than a mutable balance only.

## SaaS control plane

Platform-level records may include:
- plans
- plan_entitlements
- subscriptions
- subscription_events
- trials
- license_keys
- license_activations
- entitlement_grants
- feature_flags

These records belong to the platform control plane and must never leak into ordinary agency APIs.

## Audit and observability

### audit_events
Append-only security/business audit trail.

Minimum fields:
- id
- organization_id (nullable for platform-wide events)
- actor_type
- actor_id
- action
- resource_type
- resource_id
- outcome
- request/correlation id
- timestamp
- safe metadata

Do not store secrets or unnecessary sensitive document contents in audit metadata.

## Reference data

Countries, wilayas/regions, cities, currencies, vehicle attribute dictionaries, document types and other stable dictionaries should be separated from tenant-owned business data where appropriate.

## Naming conventions

- snake_case for PostgreSQL physical names.
- singular conceptual model names; plural table names.
- primary keys use opaque UUID/ULID-style identifiers as selected in ADR.
- foreign keys use `<entity>_id`.
- timestamps use `*_at` and UTC storage.
- soft deletion is not a default. Use explicit status/archive semantics when historical integrity matters.

## Data retention and deletion

Define retention per data class before production:
- customer account data
- identity documents
- signed contracts
- inspection evidence
- payment records
- audit events

Legal/regulatory requirements for each deployment market must override convenience.
