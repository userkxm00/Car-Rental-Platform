# 41 — Platform Monetization Control Center

## Objective

The SaaS operator must be able to choose and change the platform business model from a private Platform Admin interface without rewriting core booking/business logic.

Monetization is configuration and entitlement policy, not scattered `if/else` checks across the application.

## Two separate money flows

### Flow A — Customer → Agency

This is rental business money:
- rental amount
- extras
- delivery fees
- deposit
- refunds
- adjustments

The agency owns this business transaction, subject to marketplace rules and any platform commission configured later.

### Flow B — Agency → Platform

This is SaaS/platform money:
- subscription
- renewal
- license purchase
- add-on/features
- marketplace fees/commission where applicable

These two financial domains must never be mixed in one mutable balance field.

## Platform monetization modes

The platform owner can configure one or more supported models:

### MODE A — Free

Platform can operate without charging agencies for core SaaS access.

Possible revenue source:
- advertisements
- sponsored agency placement
- future marketplace commission

### MODE B — Trial

Configurable trial period, for example 30 days.

Trial must be data-driven:
- duration
- eligible plans
- included features
- usage limits
- extension policy
- grace period
- expiration behavior

### MODE C — Subscription

Agency chooses a plan and pays according to configured billing terms.

Support conceptually:
- monthly
- yearly
- manually renewed
- promotional periods

### MODE D — License Key

Platform owner can sell or issue a license key manually.

Key can:
- activate a plan
- extend access
- grant a limited feature
- grant time-limited access
- support reseller/manual sales

License keys must be opaque, revocable, auditable and server-validated.

### MODE E — Marketplace Commission

Optional future model where the platform receives a configurable commission on qualifying marketplace bookings.

The commission can be:
- percentage
- fixed amount
- hybrid rules
- category/agency-specific where explicitly configured

Commission calculation must be snapshot-based and auditable.

### MODE F — Advertising

Optional future model inspired by large marketplaces/classified sites.

Support conceptually:
- homepage placements
- agency promoted profiles
- sponsored search positions
- banner slots
- category/location sponsorships

Ads must be explicitly marked as sponsored and must not override hard availability or safety filters.

## Platform Admin controls

Platform administrator should have a dedicated Monetization area:

```text
Monetization
├── Global mode
├── Plans
├── Trial
├── License Keys
├── Entitlements
├── Add-ons
├── Marketplace Commission
├── Advertising
├── Promotions
├── Agency Billing Status
└── Payment/Settlement Settings
```

Global mode changes require confirmation and audit logging.

## Plan and entitlement controls

For each plan, Platform Admin can configure:
- name/localized name
- monthly price
- yearly price
- trial eligibility
- maximum vehicles
- branches
- staff accounts
- bookings/month
- storage
- advanced reports
- AI features
- GPS/telematics
- API access
- custom branding/domain
- partner/referral module
- marketplace participation
- other feature entitlements

## Manual agency activation workflow

For an agency that pays offline:

```text
Agency contacts platform owner
        ↓
Platform owner validates payment
        ↓
Admin creates or selects agency subscription/license
        ↓
Admin records payment reference
        ↓
Entitlements activated
        ↓
Agency receives confirmation
```

The exact payment channel can change without changing the entitlement model.

## Algeria-first SaaS payment strategy

Release 1 should not depend on online card checkout for agency subscription activation.

Support:
- manual payment
- bank transfer reference
- Baridi-related/offline payment workflow when commercially and operationally appropriate
- manually issued license keys

Future online provider adapters can include regional providers such as Chargily Pay where account eligibility, legal requirements and integration terms are satisfied.

Chargily currently advertises CIB and EDAHABIA support plus QR and an API for applications/websites. This is a future integration option, not an architectural dependency.

## Contact-to-activate model

Platform Admin can configure public contact methods displayed on the pricing/activation page:
- phone
- email
- WhatsApp link
- business hours
- payment instructions

The actual contact values must be settings, never hard-coded into the application source.

## Feature flags vs entitlements

Do not confuse:

Feature flag:
- controls software rollout/availability

Entitlement:
- controls whether a tenant is commercially allowed to use a capability

Authorization:
- controls whether this user is permitted to perform the action

All three can participate in a final access decision, but they remain separate concepts.

## Data integrity

Changing monetization configuration must not mutate historical booking/payment records.

A plan price change affects future subscription periods, not old invoices.

A marketplace commission rule change must not rewrite past settled commissions.

## Audit requirements

Audit at least:
- plan creation/edit/archive
- price changes
- trial policy changes
- license creation/activation/revocation
- manual entitlement grants/revocations
- marketplace commission changes
- advertising mode/slot configuration changes
- agency suspension/reactivation

## Safe defaults

When a new tenant is created:
- assign an explicit initial subscription state
- compute entitlements server-side
- deny premium features until entitlement is known
- never fail open because the billing service is temporarily unavailable

## Future extensibility

The monetization control plane must be able to support future business models without changing the booking state machine.

This keeps the product flexible enough to become:
- SaaS software
- marketplace
- advertising-supported marketplace
- hybrid SaaS + marketplace
- white-label enterprise product

## Reference lessons

BookCars demonstrates single/multi-supplier operation and multiple payment methods.

Autorockin and other marketplace references inform agency profiles and multi-supplier discovery.

The product must implement its own billing/entitlement logic based on this specification rather than copying another project's implementation.
