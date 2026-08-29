# 39 — Hybrid Monetization Strategy

## Purpose

Define a flexible commercial architecture that allows the platform owner to run one or several monetization models at the same time without rewriting the product.

## Core decision

The platform uses a **hybrid monetization architecture**.

There is no requirement to choose one revenue model exclusively. The platform owner can enable, disable, combine, schedule, or experiment with monetization mechanisms from the Platform Owner Control Center.

This is a capability of the platform architecture, not a promise that every model will be activated in Release 1.

## Revenue streams

### A. Agency SaaS access

Supported commercial states:

- Free plan
- Time-limited trial
- Paid subscription
- Manual renewal
- Promotional extension
- Temporary grant

The platform owner can configure:

- enabled plans
- price
- billing period
- limits
- included features
- trial duration
- grace period
- eligibility
- availability by market

### B. License Keys

License keys remain an optional sales/activation mechanism.

Use cases:

- manually sold annual access
- reseller/dealer sales
- promotional access
- offline/manual commercial process
- support-assisted activation

A license grants an entitlement; the raw key is not an application authorization check.

### C. Marketplace commission

Future option.

The platform may charge an agency or other marketplace participant a configured commission on eligible marketplace transactions.

The architecture must distinguish:

- customer payment to agency
- marketplace commission owed to platform
- agency net amount
- refunds/adjustments

Do not treat the commission as rental revenue belonging to the agency.

### D. Google AdSense / publisher advertising

Future option for the public customer-facing website and other eligible public content surfaces.

This means **Google publisher advertising**, not selling fake visibility inside the operational system.

Advertising should primarily be considered for:

- public marketplace discovery pages
- destination/location content
- informational/help content
- other public pages where ads do not interfere with booking decisions

Advertising must not compromise:

- availability truth
- price transparency
- agency verification
- search relevance
- booking safety
- privacy requirements

Sponsored placements, if later offered directly to agencies, must be visibly labeled and remain separate from organic ranking logic.

The product should support a policy such as:

```text
Operational/Admin surfaces: ads OFF
Checkout/payment surfaces: ads OFF
Customer booking critical path: ads minimal/OFF
Public content/discovery: ads configurable
```

Google AdSense requires site eligibility, original/high-quality content, policy compliance, site ownership/control, and activation/review before ads can run. These requirements must be treated as launch prerequisites rather than assumed revenue.

Potential use of Auto ads should be controlled carefully because automatic placement can alter page layouts. Final ad placements remain a product/UX decision.

### E. Hybrid examples

The platform owner may enable combinations such as:

```text
Free Agency SaaS
+
Google AdSense on public marketplace
```

or:

```text
30-day Trial
→ Paid Subscription
+
Marketplace Commission
```

or:

```text
Free Plan
+
Premium Features
+
License Keys
+
Marketplace Commission
+
Public-site Advertising
```

or:

```text
Manual subscription via BaridiMob/transfer
+
License Key activation
+
Future Chargily online payment
```

The architecture must support these combinations concurrently.

## Agency subscription payment methods

Release 1 should support a manual/offline workflow suitable for the target market:

- BaridiMob/manual transfer workflow where commercially and operationally appropriate
- bank transfer
- cash/manual receipt where appropriate
- platform-owner verification
- manual renewal
- license-key activation

The specific payment channel shown to an agency is configurable by the platform owner.

### Platform Owner contact/payment instructions

The Platform Owner can configure the official contact and payment instructions shown to agencies, including:

- phone number
- WhatsApp contact where applicable
- email
- payment account/instructions
- reference format
- support hours
- renewal instructions

Sensitive credentials or secrets must never be placed in ordinary application settings visible to unauthorized users.

## Future Chargily integration

Chargily Pay is a future provider option for online payments.

Keep it behind a payment-provider abstraction so the core subscription/booking domains do not depend on Chargily-specific APIs.

When implementation begins, the current provider documentation, onboarding requirements, supported payment methods, webhook behavior, fees, compliance requirements, and production availability must be revalidated.

## Entitlement model

Monetization affects product capabilities through computed entitlements:

```text
Plan
  + Subscription state
  + License grants
  + Promotional grants
  + Platform overrides
        ↓
Effective Entitlements
        ↓
Server-side authorization
```

Examples of entitlements:

- max vehicles
- max branches
- max staff
- max monthly bookings
- customer marketplace listing
- advanced reports
- AI features
- GPS integration
- API access
- custom branding
- custom domain
- storage limits

## Platform Owner Control Center

The platform owner should have configurable controls for:

### Global monetization

- enable/disable SaaS billing
- enable/disable trials
- enable/disable license keys
- enable/disable marketplace commission
- enable/disable public advertising integration
- select enabled payment methods
- choose which markets/countries a model applies to

### Plans

- create/edit/archive plans
- price
- period
- trial
- limits
- features
- visibility

### Promotions

- temporary discounts
- free extensions
- feature grants
- partner codes
- campaign windows

### Advertising

- Google AdSense site configuration status
- ad feature flag
- allowed page categories
- blocked page categories
- internal ad-free policy

Actual Google account/site verification and policy controls remain in Google systems; the platform should not pretend to replace Google AdSense's console.

### Commission

- default commission rule
- agency-specific override
- eligible booking channels
- effective dates
- exclusions
- refund treatment

## Important financial separation

The system must maintain separate ledgers/records for:

1. Customer ↔ Agency rental money.
2. Agency ↔ Platform subscription money.
3. Marketplace commission owed to Platform.
4. Advertising revenue received by Platform.

These flows must never be conflated in a single generic payment record.

## Release strategy

Architecture supports all models, but initial commercial activation should stay simple enough to operate reliably.

Recommended first activation options:

- 30-day configurable trial
- one or more paid SaaS plans
- manual BaridiMob/bank-transfer renewal
- License Keys for manual sales when needed

Public Google advertising and marketplace commission can be activated later after the public marketplace has enough traffic and legal/operational requirements are ready.

## Product/UX rules

- Never surprise an agency with a newly activated charge.
- Show plan status, limits, renewal/expiration, and payment instructions clearly.
- Warn before trial expiration.
- Do not delete data immediately after expiration.
- Keep operational access/restrictions predictable and documented.
- Never insert disruptive ads into payment, contract, inspection, or operational workflows.

## Acceptance criteria

The implementation is complete only when:

- multiple monetization mechanisms can coexist
- each mechanism has independent feature flags/configuration
- entitlements are computed centrally
- subscription and license state are auditable
- platform/agency/customer financial flows remain separated
- advertising can be disabled without code changes
- future online payment providers can be added without rewriting billing domain logic
