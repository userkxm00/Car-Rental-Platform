# Monorepo & Code Organization

## Goal

Keep customer web, agency operations mobile, owner/admin web, shared contracts, and backend domain logic in one repository while preserving strict boundaries.

## Proposed structure

```text
apps/
  api/                  # NestJS API
  customer-web/         # public booking website; Release 1
  agency-web/           # owner/admin responsive web; Release 1
  agency-mobile/        # staff/owner operations app; Release 1
  customer-mobile/      # future; Release 2+
  platform-admin-web/   # platform owner's private control center

packages/
  api-client/           # generated/typed API client where appropriate
  contracts/             # shared DTO/API contracts and schemas
  validation/            # shared validation primitives
  domain-types/          # non-secret shared domain enums/types
  i18n/                  # translation keys and locale utilities
  ui/                    # shared design-system primitives where practical
  config/                # shared safe configuration helpers
  observability/         # logging/tracing primitives

prisma/
  schema.prisma
  migrations/

docs/
architecture/
references/
research/
agent/

.github/
  workflows/
  instructions/
```

## Backend boundaries

The backend should be a modular monolith at first, with modules aligned to domains:

- identity
- organizations
- locations
- fleet
- availability
- bookings
- pricing
- customers
- contracts
- inspections
- damage
- maintenance
- payments
- billing
- notifications
- tasks
- partners
- analytics
- ai
- entitlements
- platform-admin

Do not split into microservices merely for appearance. A module must have clear ownership and interfaces.

## Dependency direction

Prefer:

```text
API controllers
  ↓
Application/use-case layer
  ↓
Domain services + policies
  ↓
Infrastructure adapters
  ↓
Prisma / PostgreSQL / providers
```

Domain code must not directly import UI code or provider SDKs.

## Shared package rules

Shared packages must contain genuinely reusable contracts/primitives, not random convenience functions.

Do not share server-only secrets or privileged service code with browser/mobile packages.

## Client rules

Customer Web, Agency Web and Agency Mobile consume backend APIs.

They may share:
- API contracts
- validation schemas safe for clients
- localization keys
- design-system primitives

They must not own:
- authoritative pricing
- authoritative availability
- payment totals
- authorization decisions
- tenant authority

## Environment separation

Environment configuration must distinguish:
- local development
- test
- staging
- production

Secrets are injected at runtime; never commit them.

## Testing organization

- unit tests near domain/application modules
- API integration tests under `apps/api`
- web component/page tests under each web app
- mobile tests under agency-mobile/customer-mobile
- E2E tests in a dedicated top-level test area where tooling permits

Critical domain tests must not depend only on browser/UI tests.

## Build and CI expectations

CI should eventually verify:
- formatting
- linting
- type checking
- unit tests
- integration tests
- E2E critical paths
- dependency/security checks
- production build
- migration safety checks

## Release separation

Release 1:
- customer web
- agency web
- agency mobile
- platform admin web

Release 2+:
- customer mobile

All clients use the same backend/domain source of truth.
