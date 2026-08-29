# 34 — App Surface & Role Strategy

## Decision

The platform must not force customers, agency staff/owners, and the platform owner into one mixed mobile application.

We use one shared backend/domain platform with purpose-built product surfaces.

## Product surfaces

### 1. Customer App — public consumer mobile app

Audience:
- renters/customers

Primary jobs:
- discover agencies/vehicles
- search by dates and pickup/drop-off location
- map-based search
- compare vehicles and prices
- book
- pay according to configured methods
- manage documents
- digital check-in
- QR pickup
- view current rental
- extend rental
- report an issue/damage
- support
- notifications
- loyalty/referrals

Security:
- customer permissions only
- never expose agency administration data
- never trust mobile-calculated totals or availability

### 2. Operations App — agency staff + owner companion

Audience:
- agency employees
- branch managers
- agency owners

The app uses role-based capabilities rather than creating an entirely separate application for each agency role.

Staff mode:
- daily tasks
- pickup/return workflow
- QR booking lookup
- identity/document verification
- vehicle inspection
- photos
- mileage/fuel capture
- damage reporting
- readiness/preparation
- issue escalation

Owner/manager mode:
- operational alerts
- today's pickups/returns
- fleet snapshot
- booking overview
- customer lookup
- revenue snapshot
- approval actions where permitted
- branch overview
- urgent maintenance/vehicle issues

Complex administration remains on the responsive Owner/Admin Web surface, where tables, reporting, configuration, pricing rules, staff management, documents, billing, and multi-branch operations are easier to operate safely.

### 3. Platform Owner Control Center — web first

Audience:
- the operator/owner of the SaaS platform itself

Responsibilities:
- agencies/tenants
- subscriptions/plans
- trials
- licenses
- entitlements
- feature flags
- billing control
- platform support
- abuse/security actions
- platform health
- global configuration

No consumer-facing platform-admin controls should be exposed to agency users.

A private platform-admin mobile companion may be added later, but is not an MVP requirement.

## Why this separation is preferred

1. Customer UX stays simple and conversion-focused.
2. Operational workflows can optimize for camera, QR, GPS, checklists, and fast touch interactions.
3. Agency administration remains powerful without overwhelming a phone UI.
4. Platform administration stays isolated from agency tenants.
5. Authorization boundaries are easier to reason about and test.
6. Shared backend/domain rules prevent web/mobile divergence without forcing shared UI.

## Shared backend principle

All surfaces consume the same authoritative backend and domain services.

Shared:
- identity
- authorization
- tenant isolation
- availability
- pricing
- booking lifecycle
- payments
- notifications
- documents
- inspection/damage
- audit logs

Not shared:
- role-specific navigation
- screen layouts
- operational shortcuts
- sensitive platform-owner controls

## Mobile release strategy

Customer App and Operations App may use the same technical mobile monorepo/codebase when practical, but they must have explicit app identities, navigation boundaries, permission sets, and release channels.

Preferred production outcome:
- one customer app listing
- one agency operations app listing when the staff/owner mobile surface is mature enough
- one responsive platform-admin web control center

## Account-role transitions

A person may hold multiple roles, for example:
- customer account
- agency staff membership
- agency owner/manager membership

The backend must evaluate role + tenant + permissions explicitly.

Never infer privileged access only from email ownership or from a client-selected role.

## Platform owner vs agency owner

These are different security domains:

Platform Owner:
- controls the SaaS platform
- can manage agencies and entitlements according to platform policy

Agency Owner:
- controls one agency/tenant
- can manage their own branches, fleet, staff, bookings, customers, pricing, and financial records according to plan/permissions

Agency Owner must never become Platform Owner merely by being an agency administrator.

## Maps in each app

Customer App:
- map/list search
- pickup/drop-off locations
- branch and parking pins
- directions

Operations App:
- pickup/drop-off navigation
- branch/vehicle context
- optional location capture subject to permission

Owner/Admin Web:
- branch and parking management
- service/delivery zones
- location analytics

Platform Admin Web:
- no routine access to exact customer/vehicle locations unless explicitly justified, permissioned, and audited.

## Non-negotiable rule

One backend, multiple purpose-built surfaces. Do not solve role complexity by giving every role every screen inside one universal app.
