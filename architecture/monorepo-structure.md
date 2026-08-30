# Monorepo & Code Organization

## Goal

Keep customer web, agency operations mobile, owner/admin web, shared contracts, and backend domain logic in one repository while preserving strict boundaries.

## Package manager & workspace conventions

- **npm workspaces** is the canonical package manager (`npm >= 10`, Node `>= 20.19`, Node 22 LTS recommended). It was selected because it ships with every supported Node runtime and needs no extra tooling; no agent, IDE, or hosting environment is required to install a special package manager.
- Workspace globs: `apps/*` and `packages/*` (see root `package.json`).
- Package naming: scoped `@kavriqo/<name>`; all packages are `private: true` and versioned together (`0.1.0`).
- `package-lock.json` is committed. Install with `npm install` at the repository root; `npm ci` is preferred in CI for reproducible installs.
- `engine-strict=true` in `.npmrc` makes unsupported runtimes fail loudly instead of producing subtle breakage.
- Root scripts (`dev`, `build`, `typecheck`, `lint`, `test`, `format`) delegate to workspaces with `--if-present`; a workspace that has not yet adopted a script is skipped, never broken.
- Shared TypeScript strictness lives in `tsconfig.base.json`; every package extends it and sets its own `module`/`moduleResolution`/`jsx`/`types` settings (API: `commonjs`; browser/bundler apps: bundler-style resolution).
- Release boundary: workspace directories exist only for Release 1 surfaces (`api`, `customer-web`, `agency-web`, `agency-mobile`, `platform-admin-web`) plus shared packages. `apps/customer-mobile` is created when Release 2 starts.
- Formatting conventions (`.editorconfig`, Prettier, ESLint) are owned by the 01-A08 tooling task.

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
