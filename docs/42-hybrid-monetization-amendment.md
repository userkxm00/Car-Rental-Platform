# 42 — Hybrid Monetization Amendment

## Decision

The platform must support multiple monetization mechanisms at the same time. They are independent capabilities, not mutually exclusive choices.

Supported mechanisms:
- Free agency plan
- Configurable trial
- Paid subscription
- License Key
- Manual Renewal / offline payment confirmation
- Optional marketplace commission
- Optional Google Ads advertising on eligible public pages
- Future online payment providers such as Chargily Pay

## Important separation

The system has separate money flows:

1. Customer → Agency: rental payment, deposit, fees and refunds.
2. Agency → Platform: SaaS plan/license renewal.
3. Advertiser network → Platform: advertising revenue.
4. Marketplace activity → Platform: commission/lead revenue when enabled.

These must never be collapsed into one generic payment field.

## Platform Owner control

The private Platform Admin surface controls each monetization feature independently.

Example:

```text
SaaS access:
  Free                ON
  Trial               ON (30 days)
  Subscription        ON
  License Key         ON
  Manual Renewal      ON

Marketplace:
  Commission          OFF

Advertising:
  Google Ads          ON
```

Another configuration can be:

```text
SaaS access:
  Free                ON
  Trial               ON
  Subscription        OFF
  License Key         ON
  Manual Renewal      ON

Marketplace:
  Commission          ON

Advertising:
  Google Ads          ON
```

No code rewrite should be required to move between these commercial configurations.

## Google Ads

"Ads" specifically means Google advertising such as Google AdSense/publisher products, subject to current Google eligibility, consent, and placement policies.

Ads may be shown on:
- public marketplace discovery pages
- public agency profile pages
- public content/help pages

Ads should not interrupt:
- checkout
- payment confirmation
- contract signing
- pickup/return inspection
- emergency/support actions
- sensitive security screens

Advertising configuration must be separate from marketplace ranking. A paid ad must be clearly identifiable and must not fabricate inventory availability or bypass operational eligibility.

## Customer booking and payment

Release 1 should not require online card/payment processing for customers.

The booking experience must support agency-configured options such as:
- reserve/request and pay at agency
- cash
- bank transfer
- manual payment recording
- deposit handling

Future electronic payment support is provider-based and optional.

## Agency subscription payment

Release 1 supports manual agency subscription renewal, including a configurable contact/payment instruction block controlled by Platform Admin.

The Platform Owner may configure:
- contact name
- phone number
- WhatsApp contact where used
- email
- bank transfer instructions
- BaridiMob payment instructions
- payment reference format/instructions
- renewal evidence upload

The agency submits a renewal request/evidence; an authorized platform operator approves or rejects it.

Secrets and privileged provider credentials must never be exposed in public settings.

## License Keys

License Keys remain a supported manual-sales mechanism.

A key can activate or extend a defined entitlement package and term. It is not itself an authorization check throughout the application.

The lifecycle remains:

```text
Issued → Activated → Active → Expired/Revoked
```

All activation/revocation/manual overrides are auditable.

## Hybrid examples

The platform should make these valid configurations:

### Model A — Freemium + Ads
Free agency use with capacity limits; Google Ads on eligible public pages.

### Model B — Trial + Subscription
30-day configurable trial followed by paid plan; manual renewal available.

### Model C — License Sales
Agencies receive a plan term through a manually issued license key.

### Model D — Marketplace Commission
Agencies can use the SaaS, while the platform earns a configured commission on eligible marketplace bookings.

### Model E — Hybrid
Free + Trial + Subscription + License Key + Manual Renewal + Google Ads + optional Marketplace Commission simultaneously.

The exact business model is chosen by the Platform Owner through configuration and commercial policy, not architecture changes.

## Future Chargily Pay

Chargily Pay is an optional future provider integration. It must sit behind the payment-provider abstraction and be enabled only after commercial/legal/technical review.

It may be used for agency subscriptions and, if appropriate and supported, customer-facing payment flows.

Provider-specific API objects must remain inside the adapter layer.

## Data model implication

Do not create one enum such as:

```text
monetization_mode = FREE | TRIAL | SUBSCRIPTION | LICENSE
```

That would incorrectly make mechanisms mutually exclusive.

Instead model independent concepts such as:

- plans
- subscriptions
- trials
- licenses
- entitlement grants
- manual payment records
- marketplace commission rules
- ad configuration/placements
- provider configurations

## Final business decision

The platform is designed as a **hybrid commercial system**. The Platform Owner may activate one, several, or all supported monetization mechanisms at the same time, while preserving strict separation between rental payments, SaaS revenue, marketplace revenue, and advertising revenue.
