# ERD v1 — Core Relationship Map

Status: design baseline.

The diagram is intentionally split by domain. The full physical schema is defined in `database-schema-v1.md`.

## Core tenancy and identity

```mermaid
erDiagram
    USERS ||--o{ MEMBERSHIPS : has
    TENANTS ||--o{ MEMBERSHIPS : contains
    MEMBERSHIPS ||--o{ MEMBERSHIP_ROLES : assigned
    ROLES ||--o{ MEMBERSHIP_ROLES : grants
    ROLES ||--o{ ROLE_PERMISSIONS : contains
    PERMISSIONS ||--o{ ROLE_PERMISSIONS : defines

    TENANTS ||--o{ BRANCHES : owns
    LOCATIONS ||--o{ BRANCHES : represents

    TENANTS ||--o{ CUSTOMERS : owns
    USERS o|--o| CUSTOMERS : links

    TENANTS ||--o{ VEHICLE_CATEGORIES : owns
    VEHICLE_CATEGORIES ||--o{ VEHICLES : groups
    TENANTS ||--o{ VEHICLES : owns
    BRANCHES o|--o{ VEHICLES : currently_at
```

## Booking and fleet

```mermaid
erDiagram
    TENANTS ||--o{ BOOKINGS : owns
    CUSTOMERS ||--o{ BOOKINGS : makes
    VEHICLES o|--o{ BOOKINGS : assigned
    VEHICLE_CATEGORIES o|--o{ BOOKINGS : requested
    LOCATIONS ||--o{ BOOKINGS : pickup
    LOCATIONS ||--o{ BOOKINGS : return

    BOOKINGS ||--o{ BOOKING_STATUS_HISTORY : transitions
    BOOKINGS ||--o{ BOOKING_PRICE_SNAPSHOTS : snapshots
    BOOKINGS ||--o{ BOOKING_EXTENSIONS : extends
    BOOKINGS ||--o{ BOOKING_CANCELLATIONS : cancellations
    BOOKINGS ||--o{ BOOKING_ASSIGNMENTS : assignments
    BOOKINGS ||--o{ BOOKING_HOLDS : holds

    VEHICLES ||--o{ VEHICLE_BLOCKS : blocked
    BOOKINGS ||--o| RENTAL_SESSIONS : becomes
    RENTAL_SESSIONS ||--o{ INSPECTIONS : has
    INSPECTIONS ||--o{ INSPECTION_ITEMS : contains
    INSPECTIONS ||--o{ INSPECTION_PHOTOS : evidence
    BOOKINGS ||--o{ DAMAGE_RECORDS : produces
    DAMAGE_RECORDS ||--o{ DAMAGE_EVIDENCE : supported_by
    DAMAGE_RECORDS ||--o{ DAMAGE_ASSESSMENTS : assessed
```

## Pricing and payments

```mermaid
erDiagram
    TENANTS ||--o{ RATE_PLANS : owns
    RATE_PLANS ||--o{ RATE_RULES : contains
    TENANTS ||--o{ PROMOTIONS : owns
    TENANTS ||--o{ EXTRAS : owns
    TENANTS ||--o{ FEES : owns

    BOOKINGS ||--o{ BOOKING_PRICE_SNAPSHOTS : priced_as
    BOOKINGS ||--o{ PAYMENT_REQUESTS : initiates
    PAYMENT_REQUESTS ||--o{ PAYMENT_TRANSACTIONS : produces
    PAYMENT_TRANSACTIONS ||--o{ PAYMENT_ALLOCATIONS : allocates
    BOOKINGS ||--o{ INVOICES : billed
    INVOICES ||--o{ INVOICE_ITEMS : contains
    PAYMENT_TRANSACTIONS ||--o{ REFUNDS : reversed_by
```

## Documents and media

```mermaid
erDiagram
    VEHICLES ||--o{ VEHICLE_DOCUMENTS : has
    CUSTOMERS ||--o{ CUSTOMER_DOCUMENTS : has
    DOCUMENT_TYPES ||--o{ VEHICLE_DOCUMENTS : classifies
    DOCUMENT_TYPES ||--o{ CUSTOMER_DOCUMENTS : classifies

    DOCUMENT_TEMPLATES ||--o{ DOCUMENT_TEMPLATE_VERSIONS : versions
    BOOKINGS ||--o| RENTAL_CONTRACTS : has
    DOCUMENT_TEMPLATE_VERSIONS ||--o{ RENTAL_CONTRACTS : renders
    RENTAL_CONTRACTS ||--o{ CONTRACT_SIGNATURES : signed

    MEDIA_OBJECTS ||--o{ VEHICLE_IMAGES : used_by
    MEDIA_OBJECTS ||--o{ VEHICLE_DOCUMENTS : stores
    MEDIA_OBJECTS ||--o{ CUSTOMER_DOCUMENTS : stores
    MEDIA_OBJECTS ||--o{ INSPECTION_PHOTOS : stores
    MEDIA_OBJECTS ||--o{ DAMAGE_EVIDENCE : stores
```

## Marketplace trust and communication

```mermaid
erDiagram
    BOOKINGS ||--o| REVIEWS : enables
    CUSTOMERS ||--o{ REVIEWS : writes
    TENANTS ||--o{ REVIEWS : receives
    REVIEWS ||--o{ REVIEW_REPLIES : gets
    REVIEWS ||--o{ REVIEW_REPORTS : can_be_reported

    TENANTS ||--o{ CONVERSATIONS : owns
    BOOKINGS o|--o{ CONVERSATIONS : contextualizes
    CONVERSATIONS ||--o{ MESSAGES : contains
    USERS ||--o{ MESSAGES : sends
```

## SaaS control plane

```mermaid
erDiagram
    PLANS ||--o{ PLAN_ENTITLEMENTS : includes
    TENANTS ||--o{ SUBSCRIPTIONS : subscribes
    PLANS ||--o{ SUBSCRIPTIONS : selected
    SUBSCRIPTIONS ||--o{ SUBSCRIPTION_EVENTS : changes
    LICENSES ||--o{ LICENSE_ACTIVATION_EVENTS : records
    TENANTS ||--o{ ENTITLEMENT_GRANTS : receives
    PLANS o|--o{ ENTITLEMENT_GRANTS : based_on
    TENANTS ||--o{ TENANT_FEATURE_OVERRIDES : overrides
    FEATURE_FLAGS ||--o{ TENANT_FEATURE_OVERRIDES : controls
```

## Design invariants

1. All tenant-owned business data has an explicit tenant ownership path.
2. A booking belongs to exactly one tenant/agency.
3. A customer may be linked to a user account, but customer business data remains tenant-scoped.
4. Historical booking state, pricing, payment, contract and inspection evidence remains auditable.
5. Marketplace discovery can aggregate offers across tenants but must never merge agency ownership or expose private operational records.
6. SaaS control-plane data is isolated from agency operational data.
7. Spatial data is attached to canonical `locations`/`delivery_zones`, not duplicated in every consumer record.
