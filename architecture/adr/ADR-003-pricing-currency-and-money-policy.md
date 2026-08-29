# ADR-003 — Release 1 Pricing, Currency & Money Policy

## Status
Accepted — 2026-08-29

## Decisions

### Currency

- DZD is the primary Release 1 operating currency for Algeria.
- Currency is explicit on every monetary aggregate that can become historical truth.
- The system remains ready for MAD, TND, EUR, USD and additional configured currencies.

### Authoritative money representation

- Use integer minor units for currencies with a stable minor-unit model where practical.
- Use PostgreSQL NUMERIC with explicit scale for rates/percentages and monetary values that require fractional precision.
- Never use JavaScript floating point as authoritative persisted monetary truth.

### Rounding

Rounding occurs at defined financial boundaries, not unpredictably at every intermediate calculation.

Default policy:
- calculate using the highest required precision;
- round the final chargeable monetary component to the currency's allowed precision;
- preserve the unrounded calculation inputs and rule/snapshot metadata when required for audit;
- never let client-calculated totals become authoritative.

### Pricing precedence

Pricing resolution is deterministic. The effective price is calculated from the approved rule set using explicit precedence, effective dates and eligibility.

The system must be able to explain a confirmed quote through a price breakdown such as:

```text
Base rental
+ duration adjustment
+ seasonal/special-date adjustment
+ extras
+ delivery/distance/after-hours/one-way fees
- discounts/promotions
= rental subtotal
+ applicable taxes/charges where configured
= customer total
```

Deposit is tracked separately from rental revenue and is not silently included as earned revenue.

### Historical snapshots

When a quote/booking reaches the appropriate confirmation boundary, store a reproducible price snapshot containing the effective rules/values needed to explain the amount.

Later rate changes must not rewrite historical booking pricing.

### Refunds and adjustments

Refunds, waivers and corrections are separate auditable events. Do not rewrite the original financial record to make history look different.

## Agency configuration

Agencies can configure permitted:
- rate plans
- seasonal rules
- duration tiers
- extras
- discounts
- delivery/distance fees
- after-hours fees
- one-way fees
- deposits
- cancellation/no-show charges

Platform-level limits and entitlements can restrict which pricing capabilities an agency may use.

## Consequences

Pricing is deterministic, explainable and reproducible across customer web, agency web and mobile operations.
