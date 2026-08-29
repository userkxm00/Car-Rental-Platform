# 32 — Monetization, Licensing & Entitlements

## Purpose

Define the commercial model for the SaaS platform and the rules that control which agencies can use which paid capabilities.

## Recommended commercial model

The platform should support three commercial states from day one:

1. **Free** — an optional permanently free tier with deliberately limited capacity/features.
2. **Trial** — a configurable time-limited trial, initially supporting 30 days but never hard-coded to 30.
3. **Paid subscription** — recurring or manually renewed plan with explicit feature entitlements and limits.

The platform owner (platform administrator) controls whether a plan is enabled, its pricing, duration, limits, features, and availability.

## License keys

License keys are supported as an optional entitlement mechanism, but they must not be the primary source of authorization.

Recommended model:

- Subscription/account state is authoritative for SaaS access.
- License keys may grant or activate an entitlement, extend a trial, provision a plan, apply a reseller/deal code, or support controlled manual sales.
- Keys are opaque, non-sequential, revocable, auditable, and never stored or logged in plaintext after issuance where hashing is possible.
- A key must have explicit status, scope, activation rules, start/end dates, maximum activations, and revocation state.
- Feature authorization is based on computed entitlements, never by checking a raw license-key string throughout application code.

## Entitlement model

Conceptually:

Tenant → Subscription → Plan → Entitlements

Optional:

License Key → Entitlement Grant → Tenant

Entitlements can represent:

- maximum active vehicles
- maximum branches
- maximum staff accounts
- maximum monthly bookings
- storage quota
- number of customer accounts
- advanced reports
- AI features
- GPS/telematics
- partner/referral module
- custom domain/branding
- API access
- export capabilities
- automation limits

The application should expose a single authorization/entitlement service so that Web, Mobile, and server-side jobs use the same decisions.

## Trial behavior

Trial configuration must support:

- duration in days
- eligible plans
- one trial per tenant/customer policy
- feature set during trial
- conversion to paid plan
- expiration behavior
- grace period
- trial cancellation

Recommended expiration policy:

**Active → Trial Ending Soon → Expired/Grace → Restricted**

Do not immediately delete customer data when a subscription expires. Preserve data according to retention policy and show the owner exactly what is restricted.

## Grace period

A short configurable grace period should protect legitimate businesses from accidental service interruption after a renewal/payment problem.

During grace:

- allow core read access
- allow billing/payment recovery
- restrict creation of new paid resources according to plan policy
- show clear warnings

The grace period must be explicitly configurable and auditable.

## Plan administration

Platform Administrator can:

- create/edit/archive plans
- set monthly/yearly/manual pricing
- enable/disable plans
- configure trial duration
- configure grace period
- configure limits
- configure entitlements
- generate/revoke license keys
- issue promotional extensions
- grant temporary feature access
- view tenant subscription state
- manually override an entitlement with an auditable reason

Every administrative override must create an audit record.

## Payment provider separation

Subscription billing must use a provider abstraction. Do not embed a single payment gateway into business logic.

The system must support:

- manual/offline payment recording
- bank transfer/reference reconciliation
- future local/regional gateways
- future card/online providers

Payment provider events must be reconciled through verified webhooks or controlled server-side reconciliation.

## App Store / Google Play consideration

The customer-facing booking application is a consumer utility and is separate from the agency SaaS billing surface.

Do not assume that agency SaaS subscription billing should be implemented as an in-app purchase inside the customer mobile application. Keep agency subscription management primarily on the web/platform billing surface and review current Apple/Google policies before enabling digital subscription purchases inside store-distributed apps.

## Security rules

- Never enforce a plan only in UI code.
- Enforce entitlements server-side.
- Cache entitlement decisions only with safe invalidation.
- Revocation must propagate quickly.
- Prevent tenant A from using tenant B's license/entitlement.
- Rate-limit license validation attempts.
- Never expose internal license secrets in mobile/web bundles.
- Keep a complete audit history for activation, renewal, revocation, manual grants, and plan changes.

## Recommended user experience

Owner sees:

Plan: Professional
Status: Active
Renews: 2026-10-14
Vehicles: 42 / 50
Branches: 2 / 3

[Manage Plan]
[Upgrade]
[Enter License Key]

Before expiration:

"Your plan renews in 7 days."

After expiration:

"Your subscription has expired. Your data is محفوظ/secure. Renew to restore full operational access."

## Commercial philosophy

Do not paywall core data integrity or safety. Pricing should primarily monetize capacity, automation, advanced intelligence, integrations, and business scale.

The exact plans and prices are product/market decisions and must be documented separately before implementation.