# Pricing Engine — Design Baseline

## Goal

Calculate rental quotes and final booking amounts consistently, transparently, and server-side.

## Pricing pipeline

```text
Base rate
  ↓
Duration rule
  ↓
Date/season rule
  ↓
Vehicle/category modifiers
  ↓
Promotion/discount
  ↓
Extras
  ↓
Location/delivery fees
  ↓
Deposit policy
  ↓
Taxes/charges where applicable
  ↓
Rounding
  ↓
Final quote
```

## Principles

- The server is authoritative for money.
- Client-submitted totals are untrusted.
- Quote calculation is deterministic for the same inputs and effective pricing configuration.
- Every confirmed booking stores a commercial snapshot.
- Current pricing changes must not rewrite historical bookings/invoices.

## Rate dimensions

Support configurable combinations of:

- hourly
- daily
- weekly
- bi-weekly
- monthly
- duration tiers
- weekend rates
- seasonal rates
- special dates/holidays
- location/branch rates
- vehicle category rates

The system must avoid overlapping ambiguous rules or define a deterministic precedence order.

## Extras

Potential extras:

- additional driver
- child seat
- GPS/device
- insurance options where legally/operationally offered
- delivery/pickup
- one-way fee
- additional mileage
- fuel-related charge
- late return charge
- other agency-defined extras

Extras must be typed and validated rather than represented as arbitrary client-side amounts.

## Deposits

Deposit policy may be:

- fixed amount
- category-dependent
- vehicle-dependent
- policy/risk dependent where legally appropriate

Deposit is tracked separately from rental revenue and has its own lifecycle for authorization, receipt, release, refund, or deduction.

## Currency

Initial product support:

- DZD primary
- architecture for EUR/USD/MAD/TND and other currencies later

Money values must be represented using integer minor units or a decimal-safe strategy. Never use binary floating-point arithmetic for authoritative monetary totals.

Currency formatting belongs to presentation; calculation belongs to the pricing domain.

## Rounding

Rounding rules are centralized per currency/calculation context.

Do not let individual UI components round monetary values independently.

## Promotions

Promotions should support controlled rules such as:

- percentage discount
- fixed amount
- date window
- duration requirement
- vehicle/category eligibility
- branch eligibility
- usage/activation limits

Promotion application must be deterministic and auditable.

## Quote vs booking

A quote is an offer/calculation at a point in time.

A booking confirmation consumes an authoritative calculation and stores a snapshot of the commercial terms.

A quote may expire according to policy.

## Price history

Pricing configuration must have effective dates/versioning where needed so staff can answer:

> Why did this booking cost this amount?

Historical explanation should reference the applicable rate/policy versions and snapshot.

## Smart pricing

Later/pro feature.

The engine may recommend prices from demand/utilization/availability data, but recommendations are separate from execution unless an explicit agency rule enables automation.

AI recommendations must never bypass pricing constraints, approval policy, or maximum/minimum configured bounds.

## Transparency

Customer quote should itemize meaningful components:

```text
Rental
+ Extras
+ Delivery fee
- Discount
+ Taxes/fees where applicable
= Total
Deposit (separate)
```

Avoid hidden charges that appear only after confirmation unless required by unavoidable provider/legal rules.

## Implemented (06-A — rate model)

The rate model (`apps/api/src/pricing/`) landed with 06-A:

- **Rate plan schema (06-A01)**: `rate_plans` (tenant, unique `code`,
  name, currency, duration unit, integer-minor base rate, precedence,
  half-open effective window, active flag) + `rate_plan_scopes`
  (06-A04: each scope row targets exactly one tenant-owned vehicle or
  category; a plan without scopes is tenant-global). Migration
  `20260831030000_rate_plans`.
- **Currency (06-A02)**: configuration accepts DZD/EUR/USD/MAD/TND;
  DZD is the R1 calculation currency (06-D03). Money is integer minor
  units — `baseRateMinor` never floating point.
- **Effective dates (06-A03)**: `[effectiveFrom, effectiveUntil)` windows;
  overlapping windows are allowed and resolved deterministically (below).
- **Duration units (06-A05)**: HOURLY/DAILY/WEEKLY/BIWEEKLY/MONTHLY per
  plan; tiers and mixed-duration combination rules land with 06-B.
- **Precedence (06-A06)**: `pricing/domain/rate-plan-selection.ts` defines
  the total order — scope specificity (vehicle > category > global),
  precedence desc, effectiveFrom desc, createdAt asc, id asc — so
  candidate sets are never ambiguous; the 06-B calculator consumes this
  single pure function.
- **Administration API (06-A07)**: `POST/GET/PATCH
  /api/v1/agencies/:agencyId/pricing/rate-plans` with `pricing.read` /
  `pricing.manage` (FINANCE reads only). Deactivation is a PATCH — plans
  are never hard-deleted, so price history stays reconstructible. Scopes
  are validated against tenant-owned vehicles/categories server-side.

## Implemented (06-B — time rules)

On top of the 06-A rate model (`apps/api/src/pricing/`):

- **Duration units & tiers (06-B01…B05)**: the ladder is stored as
  `rate_plan_tiers` (`upToUnits` ascending, exactly one open tier with
  `upToUnits = null`, unique bounds — enforced at the application
  boundary and backed by a partial unique index). Calculation is in
  `pricing/domain/time-rules.ts`: each full unit of the plan's duration
  unit is priced by the first covering tier, uncovered units fall back
  to `baseRateMinor`, partial units bill as one.
- **Duration combination R1**: combining hourly-over-daily (etc.) units
  is duration-ticks-only in R1 — the longest unit with a configured
  tier is used and intra-unit mixes are priced by the shorter unit.
  Cross-unit tier semantics (hourly top-ups over daily buckets) are a
  future release refinement.
- **Time adjustments (06-B06…B08)**: `rate_plan_adjustments` with
  SEASONAL (half-open windows), WEEKEND (days-of-week sets),
  HOLIDAY / SPECIAL_DATE (R1: plain calendar days). PERCENT values are
  basis points; FLAT_PER_UNIT adds a minor amount per started unit.
  Stages apply in the fixed order SEASONAL → WEEKEND → HOLIDAY →
  SPECIAL_DATE; within a stage the highest `precedence` wins (unique
  per plan+kind by constraint). Calendar math runs in the tenant
  timezone (`Intl`, Africa/Algiers for R1); when a tenant enables the
  fast path and no HOLIDAY rule is configured, Fri/Sat (Algeria
  weekend) count as holiday-weekend; configured HOLIDAY rules always
  win.
- **Administration (06-B)**: tiers/adjustments travel on the 06-A07
  POST/PATCH rate-plan endpoints with the same merge/replacement
  semantics (PATCH `tiers`/`adjustments` replace the child set).

R1 boundaries: holiday **seed rules** (06-B06) land with the calendar
sync workstream (12-C); seasonal curves, weekend multipliers and
special-date overrides are configured per plan, never hardcoded.

## Implemented (06-C — commercial adjustments)

On top of the 06-A/06-B layers (`apps/api/src/pricing/`):

- **Promotions (06-C01) & eligibility scopes (06-C09)**: `promotions`
  with half-open `[effectiveFrom, effectiveUntil)` windows,
  `maxRedemptions` caps and optional duration requirements
  (`minDurationUnits` + `durationUnit`). A promotion without scope rows
  is tenant-wide; with rows, the quote context must match at least one
  row on every populated dimension (vehicle / category / pickup
  branch). Promotions do **not** stack — the single best promotion
  applies (largest computed amount → FIXED over PERCENT → earliest
  `createdAt` → smallest id, so the choice is deterministic).
- **Coupons (06-C02)**: `coupons` (unique code per agency, case
  normalized), windows and `maxUses`/`usedCount` caps. Stacking R1: a
  valid customer coupon **wins over** promotions; coupons are not
  stackable with each other.
- **Discount arithmetic**: PERCENT values are basis points
  (`round(base × value / 10 000)`), FIXED_MINOR amounts are capped at
  the base — all integer minor units, mirrors the 06-B rounding
  centralization.
- **Extras catalog (06-C03)**: `extras` are agency-priced
  (`PER_BOOKING`, `PER_DAY`, `PER_RENTAL_UNIT`); clients request
  extras by key and never submit amounts.
- **Context fee rules (06-C04…C07)**: `fee_rules` per kind —
  DELIVERY_FEE (delivery zone, `baseMinor` + optional per-km/
  per-occurrence), DISTANCE_FEE (delivery zone, `perKmMinor`; R1
  distance is the straight-line haversine between coordinates, PostGIS
  polygons arrive with 02-C08), ONE_WAY_FEE (base per booking),
  AFTER_HOURS_FEE (branch, `perOccurrenceMinor`; evaluated against the
  location hours in the tenant timezone, overnight windows supported).
  Kind/target shapes are enforced at the boundary (a zone only for
  delivery/distance, a branch only for after-hours).
- **Deposit pricing (06-C08)**: `deposit_policies` (FIXED_MINOR or
  PERCENT_OF_TOTAL basis points) with vehicle/category scope
  overrides; selection specificity is vehicle > category > global.
- **Administration (06-C)**: all five catalogs live under
  `agencies/:agencyId/pricing/commercial/{promotions,coupons,extras,
  fee-rules,deposit-policies}` with `pricing.read`/`pricing.manage`
  permissions (FINANCE reads, never manages). Scope targets are
  validated tenant-side; child sets are replaced transactionally;
  deactivation is PATCH — no hard deletes (price history stays
  reconstructible).

The `QUOTE_PRICING_PORT` provider is still unregistered (quotes remain
`pricing: null` and not bookable-as-priced) until the engine can compute:
rate model (06-A) → time rules (06-B) → commercial adjustments (06-C,
done) → financial truth + snapshots (06-D).

## Definition of done

- deterministic calculations
- server-side totals
- comprehensive rule precedence
- snapshot persistence
- currency-safe arithmetic
- promotion tests
- boundary/date tests
- extension recalculation tests
- invoice traceability
