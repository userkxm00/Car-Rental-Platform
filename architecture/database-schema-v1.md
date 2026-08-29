# Database Schema v1 — Logical/Physical Design Baseline

Status: Design baseline — not yet a Prisma migration.

## 1. Design goals

The database must support:

- Multi-tenant agencies and branches.
- Marketplace discovery across participating agencies.
- Vehicle-specific and category-based bookings.
- Time-based availability and operational blocks.
- Deterministic pricing with historical snapshots.
- Pickup/return inspections and damage evidence.
- Maintenance and document expiry.
- Manual and future online payments.
- Reviews/comments tied to completed experiences.
- SaaS plans, trials, subscriptions, license keys and feature entitlements.
- Arabic/French/English localization metadata.
- PostGIS spatial queries.
- Strong auditability and tenant isolation.

## 2. Identity and tenant tables

### users

Purpose: global identity record.

Key fields:
- id UUID PK
- email nullable
- phone nullable
- display_name
- preferred_locale
- timezone
- status
- created_at
- updated_at

Constraints:
- At least one supported login identifier according to auth strategy.
- No password/token secrets stored here if an external identity provider is selected.

### tenants

Purpose: agency/company account.

Key fields:
- id UUID PK
- name
- legal_name nullable
- slug unique
- default_locale
- default_timezone
- default_currency
- status
- marketplace_enabled
- verification_status
- created_at
- updated_at

### memberships

Purpose: relation between a user and an agency.

Key fields:
- id UUID PK
- tenant_id FK
- user_id FK
- status
- invited_at
- joined_at
- created_at

Unique:
- (tenant_id, user_id)

### roles

Global role definitions or role templates.

### permissions

Atomic capability definitions, e.g. booking.read, booking.confirm, payment.refund.

### role_permissions

Many-to-many relation between roles and permissions.

### membership_roles

Assigns one or more roles to a membership.

## 3. Agency/location tables

### branches

- id UUID PK
- tenant_id FK
- name
- code
- location_id FK
- status
- timezone
- contact details
- created_at
- updated_at

Unique within tenant:
- (tenant_id, code)

### locations

Canonical location entity.

- id UUID PK
- tenant_id nullable for platform/global locations
- type (branch, airport, hotel, parking, pickup_point, custom)
- name
- address_line1/2
- city
- region/wilaya
- postal_code nullable
- country_code
- latitude/longitude for human-readable fallback/display
- geom geography(Point, 4326) where spatial search is needed
- provider_name/provider_place_id nullable
- metadata JSONB

### delivery_zones

- id UUID PK
- tenant_id FK
- name
- polygon geography/geometry
- fee policy reference
- active

Use spatial indexes for polygon containment/intersection queries.

### location_hours

Recurring and exception-based operating hours for branches/pickup points.

## 4. Fleet tables

### vehicle_categories

- id UUID PK
- tenant_id FK
- name
- code
- description
- transmission
- fuel_type
- seats
- doors
- luggage_capacity
- active

### vehicles

- id UUID PK
- tenant_id FK
- category_id FK
- current_branch_id FK nullable
- make
- model
- year
- plate_number
- VIN nullable
- color nullable
- status
- acquisition_date nullable
- acquisition_cost nullable
- current_odometer
- current_fuel_level nullable
- created_at
- updated_at

Unique within tenant:
- (tenant_id, plate_number)
- VIN when present, according to business policy

### vehicle_images

- id UUID PK
- vehicle_id FK
- media_object_id FK
- category (front, rear, left, right, interior, trunk, dashboard, wheel, document, other)
- sort_order
- is_primary

### vehicle_features

Normalized or controlled feature associations.

### vehicle_documents

- id UUID PK
- vehicle_id FK
- document_type
- document_number/reference nullable
- issue_date nullable
- expiry_date nullable
- verification_status
- media_object_id FK
- created_at

### vehicle_meter_readings

Append-only odometer history.

### vehicle_fuel_readings

Append-only fuel history.

### vehicle_blocks

Time-bounded operational blocks that remove a vehicle from availability.

- id UUID PK
- tenant_id FK
- vehicle_id FK
- block_type (maintenance, inspection, damage, transfer, manual, cleaning, other)
- starts_at
- ends_at
- status
- reason
- created_by
- created_at

## 5. Customer tables

### customers

Tenant-scoped business/customer profile.

- id UUID PK
- tenant_id FK
- user_id nullable FK (for self-service account linkage)
- first_name
- last_name
- phone
- email nullable
- preferred_locale
- date_of_birth nullable
- license fields according to jurisdiction/policy
- status
- created_at
- updated_at

Unique rules must be policy-driven because duplicate identities may legitimately exist across tenants.

### customer_documents

- id UUID PK
- customer_id FK
- document_type
- document_number/reference nullable
- issue_date/expiry_date nullable
- verification_status
- media_object_id FK
- created_at

## 6. Booking tables

### bookings

Central rental workflow aggregate.

- id UUID PK
- tenant_id FK
- customer_id FK
- booking_number human-readable and unique within tenant
- channel (marketplace, agency_web, staff, phone, walk_in, import)
- inventory_mode (vehicle_specific, category_based)
- requested_category_id nullable FK
- assigned_vehicle_id nullable FK
- pickup_location_id FK
- return_location_id FK
- pickup_at
- return_at
- status
- currency
- subtotal_minor / or decimal-safe strategy
- total_minor / or decimal-safe strategy as implementation convention
- deposit_amount_minor
- created_at
- updated_at

A category-based booking may start without a specific vehicle and receive assignment later.

### booking_status_history

Append-only lifecycle transitions:
- booking_id
- from_status
- to_status
- actor
- reason
- created_at
- correlation_id

### booking_price_snapshots

Immutable commercial representation used for confirmation/invoicing.

### booking_extensions

Stores extension requests/results without rewriting the original reservation history.

### booking_cancellations

Policy version, reason, actor, financial result.

### booking_assignments

History of vehicle/category assignment changes, including previous and new assignment.

### booking_holds

Short-lived inventory holds with expiry time and ownership/channel.

## 7. Availability model

Availability is derived from:

- booking intervals that consume inventory
- active rental intervals
- vehicle_blocks
- location/transfer requirements
- category capacity when category-level inventory is used

Do not add a canonical `vehicles.available` boolean.

For vehicle-specific inventory, use database-level conflict protection for overlapping active/held intervals where practical.

For category-based inventory, the algorithm compares demand against eligible fleet capacity and reservation policy.

## 8. Pricing tables

### rate_plans

- id UUID PK
- tenant_id FK
- name
- currency
- active
- effective_from
- effective_to nullable

### rate_rules

Rule dimensions may include:
- duration range
- hour/day/week/month unit
- vehicle category
- branch/location
- day of week
- season/date range
- minimum age/eligibility where applicable
- priority/precedence

### promotions

Controlled coupon/promotion rules with eligibility and usage limits.

### extras

Agency-defined billable add-ons.

### fees

Typed fees, including delivery, one-way, after-hours and mileage where enabled.

### deposits

Policy and per-booking deposit lifecycle records.

### quote_records

Optional persisted quote for customer visibility/audit prior to booking confirmation.

## 9. Rental lifecycle and inspection tables

### rental_sessions

Represents the active physical rental period associated with a booking.

### inspections

- id UUID PK
- booking_id FK
- rental_session_id FK nullable
- type (pickup, return, interim)
- performed_by
- performed_at
- mileage
- fuel_level
- notes
- status

### inspection_items

Structured checklist observations.

### inspection_photos

Evidence captured at a specific inspection, including timestamp and media reference.

### damage_records

- booking_id FK
- vehicle_id FK
- detected_at
- source (pickup, return, customer_report, staff_report, other)
- status
- description
- assessed_amount nullable
- assessment_state

### damage_evidence

Photos/files/notes linked to a damage record.

### damage_assessments

Human assessment history. AI suggestions are stored separately as recommendations and never become liability truth automatically.

## 10. Maintenance tables

### maintenance_plans

Preventive rules by mileage/date.

### maintenance_events

Actual services with cost, vendor/reference and dates.

### readiness_records

Cleaning, inspection, fueling and ready-for-rental state.

## 11. Contracts/documents/media

### document_types

Configurable document classification.

### document_templates

Logical template identity.

### document_template_versions

Immutable versioned template content/metadata.

### rental_contracts

References a booking and exact template version used.

### contract_signatures

Signer, method/provider, timestamp, evidence.

### media_objects

Metadata for external object storage:
- id
- storage_provider
- bucket/container
- object_key
- mime_type
- byte_size
- checksum where available
- visibility/access policy
- created_at

Binary files should not be stored directly in PostgreSQL unless a specific exception is justified.

## 12. Payments and billing

### payment_requests

Intent/request abstraction independent of provider.

### payment_transactions

Append-oriented financial events.

### payment_allocations

Links transactions to booking/invoice/deposit obligations.

### refunds

Separate refund records.

### invoices

Immutable issued billing document state.

### invoice_items

Traceable charges.

### provider_webhook_events

Idempotent storage of provider event identifiers, payload metadata and processing state.

Manual payment evidence may reference uploaded receipts or transfer references.

## 13. Reviews and messaging

### reviews

- id UUID PK
- tenant_id FK
- booking_id FK
- customer_id FK
- rating
- title nullable
- body nullable
- status (pending, published, rejected, hidden)
- created_at
- published_at nullable

A review should be eligible only when the required booking/rental completion conditions are satisfied.

### review_replies

Agency response with moderation state and actor.

### review_reports

Abuse/report queue.

### conversations

Booking/agency-scoped conversation container.

### messages

Text/file messages with sender and moderation/status metadata.

## 14. Notifications

### notification_events

Domain-triggered event records.

### notifications

User-facing notification state including read/unread.

### notification_deliveries

Per-channel delivery attempts and provider IDs.

### device_push_tokens

Scoped device push credentials, revocable.

## 15. SaaS / marketplace control plane

### plans

Plan catalog.

### plan_entitlements

Feature/capacity entitlements.

### subscriptions

Agency subscription lifecycle.

### subscription_events

Append-only plan/state changes.

### licenses

Opaque commercial license records; never used as raw authorization.

### license_activation_events

Activation/revocation history.

### entitlement_grants

Explicit grants from license, promotion or platform override.

### feature_flags

Platform feature rollout switches.

### tenant_feature_overrides

Audited per-tenant exceptions.

### marketplace_commission_rules

Effective-dated commission configuration.

### ad_configurations

Google Ads/provider identifiers, enabled surfaces and placement configuration. Secrets remain in secret management, not database plaintext unless unavoidable.

## 16. Auditing and support

### audit_events

Append-only privileged/security/business event history.

### support_tickets

Tenant/customer support cases.

### support_messages

Ticket conversation history.

## 17. Localization

User locale preference should be stored as an application setting. Product translations belong in version-controlled resource files, not in arbitrary translation rows unless user-generated multilingual content requires database storage.

Agency/customer generated public content that needs multiple languages may use explicit localized columns/records, but must not be duplicated silently.

## 18. Mandatory cross-tenant invariants

Every tenant-owned query path must derive tenant scope from the authenticated principal/membership, never from an arbitrary client-supplied tenant ID.

Foreign keys between tenant-owned entities should not allow accidental cross-tenant relationships. Where PostgreSQL constraints can encode the invariant efficiently, use composite tenant-aware uniqueness/foreign-key strategies or server-side transaction checks.

## 19. Deletion/retention

Do not use soft delete on every table by default. Use:
- status lifecycle for active business entities
- archival where historical records remain operationally useful
- explicit retention/deletion policies for personal documents and other regulated data

Retention rules must be documented before production launch.

## 20. Migration discipline

- Prisma migrations are the versioned schema history.
- PostGIS-specific objects/constraints may use reviewed SQL migrations where Prisma schema syntax is insufficient.
- Every migration must be reversible operationally or have a documented forward-only recovery plan.
- Production migration safety must be tested against representative data volume.
