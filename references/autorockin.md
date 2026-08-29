# Reference Audit — Autorockin / rental-car

Source: https://github.com/abdelmoughit555/rental-car

## Why it matters

This is the most regionally relevant open-source reference identified so far because its README describes a car-rental marketplace explicitly aimed at Morocco and beyond.

## Observed ideas worth studying

- Vehicle listings with rich details.
- Availability calendar and blocked dates.
- Arabic + French + English support.
- Location and map search.
- Address autocomplete.
- Vehicle image organization by section.
- Smart recommendations as a future capability.
- Price history/comparison transparency.
- Views/insights by time.
- S3-compatible object storage and image processing flow.
- Thin controllers with Actions/Services.
- Events and background jobs for side effects.
- API resources and explicit validation.
- Automated tests.

## Adopt

- Three-language baseline.
- Map/address search.
- Structured vehicle gallery.
- Provider-neutral object storage abstraction.
- Business logic outside controllers.
- Event/job model for side effects.

## Improve

- Turn planned recommendation/insight ideas into real, data-grounded features.
- Add full fleet operations, inspections, damage, maintenance, contracts, payments and staff workflows.
- Add North-African operational rules and payment abstraction.
- Build a stronger mobile operational experience.

## Reject / Do not assume

- Do not copy implementation merely because the stack is Laravel/Vue.
- Do not assume Google Maps is the permanent map provider.
- Do not expose exact vehicle locations by default.

## Legal

The repository currently states MIT licensing. Verify the exact LICENSE file before copying any code or distributing a derivative.
