# 34 — App Surface & Role Strategy

## Decision

**Release 1 uses one native mobile application for the rental agency. Customer mobile is intentionally deferred.**

The first release has three operational product surfaces:

1. Customer Web — public booking and self-service.
2. Agency Operations App — native mobile app for agency staff and authorized owners/managers.
3. Agency Owner/Admin Web + Platform Owner Web — full administration surfaces.

A dedicated Customer Mobile App is planned for a later release and must reuse the same backend/domain services.

## 1. Customer Web — Release 1

The customer does not need to install an app to complete the core journey.

Capabilities:
- multilingual browsing/search
- map/list vehicle discovery
- branch/location discovery
- airport/hotel/custom pickup selection where enabled
- vehicle details and transparent pricing
- quote and booking
- account/profile
- booking history/status
- documents
- payment/status
- support
- rental lifecycle pages
- responsive mobile-first experience

The responsive website must provide a complete first-class mobile browser experience so a customer can book from a phone with no installation requirement.

## 2. Agency Operations App — Release 1

One native iOS/Android app for agency employees and authorized agency owners/managers.

### Staff mode
- today's pickups and returns
- QR booking lookup
- customer/document verification
- pickup checklist
- return checklist
- mileage and fuel capture
- inspection and photos
- damage reporting
- vehicle readiness/preparation
- task status
- issue escalation
- notifications
- navigation to pickup/drop-off location

### Owner/manager mode
The owner/manager can use the same app with role-based access to a focused set of high-value mobile operations:
- today's operations
- urgent alerts
- fleet snapshot
- booking overview
- customer lookup
- basic revenue snapshot
- branch overview
- maintenance/vehicle alerts
- approvals where permitted

The mobile app is intentionally **not** a full replacement for the web admin dashboard.

## 3. Agency Owner/Admin Web — Release 1

Primary full-control surface for each agency.

Capabilities:
- dashboard and attention center
- bookings and calendar
- fleet
- pricing
- customers
- contracts/documents
- inspection/damage
- maintenance
- payments/billing
- staff and permissions
- branches and locations
- map/parking/delivery-zone management
- partners/referrals
- analytics
- settings

## 4. Platform Owner Control Center — Release 1

Private web-only surface for the SaaS operator.

Capabilities:
- agencies/tenants
- subscriptions/plans
- trials
- license keys
- entitlements
- feature flags
- billing control
- support
- suspension/reactivation
- global configuration
- platform health
- security/audit oversight

A private platform-admin mobile companion may be considered later but is not required for the initial product.

## 5. Customer Mobile App — Release 2+

A dedicated Customer App is intentionally postponed until the following are stable:
- customer web conversion flow
- booking engine
- payment flows
- operations app
- notifications
- backend compatibility/versioning
- real-world operational validation

Planned capabilities:
- account/profile
- map/search
- vehicle details
- booking
- payment/status
- digital check-in
- QR pickup
- My Rental
- extension request
- issue reporting
- support
- push notifications
- loyalty/referrals

The customer app must be an additional client of the existing backend, not a second implementation of business logic.

## Shared backend principle

All product surfaces consume one authoritative backend/domain layer for:
- identity and authorization
- tenant isolation
- vehicle availability
- pricing
- booking lifecycle
- payments
- contracts/documents
- inspection/damage
- notifications
- audit logging
- SaaS entitlements

No client is authoritative for business-critical truth.

## Release and distribution strategy

Release 1 Operations App:
- Android APK may be distributed from the official website during private/beta stages.
- Google Play publication follows production readiness.
- iOS uses TestFlight/App Store distribution when ready.

Customer App distribution begins only when Release 2 is approved.

## Why this is the chosen model

- Customers get frictionless booking without requiring an installation.
- Agency staff get a native workflow optimized for camera, QR, GPS/location, photos, and checklists.
- Owners get fast mobile visibility while retaining the full web dashboard for complex administration.
- Platform administration remains isolated from agency users.
- The future Customer App becomes a client addition instead of an architectural rewrite.

## Non-negotiable rule

**Release 1: one agency operations mobile app + customer web.**

**Later: customer mobile app using the same backend.**

Do not introduce separate customer and agency business logic implementations.
