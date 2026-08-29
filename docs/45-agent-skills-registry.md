# 45 — Agent Skills Registry

## Purpose

This registry defines the skills available to coding agents working on the repository. Replit discovers project skills from `/.agents/skills/` and loads detailed skill instructions on demand. Skills are specialized operating instructions; they do not replace product specifications or ADRs.

## Source-of-truth hierarchy

1. Accepted architecture/security ADRs
2. Product and business-rule specifications
3. Validated implementation and tests
4. Project-specific skills
5. Audited external references
6. General assumptions

## Installed project skills

| Skill | Primary trigger | Use |
|---|---|---|
| `car-rental-domain` | Rental/marketplace business logic | Booking, fleet, availability, pricing, inspections, maintenance, reviews, agency operations |
| `postgres-production` | PostgreSQL/PostGIS work | Schema, migrations, indexes, constraints, transactions, queries, tenant isolation, geospatial data |
| `nestjs-production` | Backend implementation | NestJS modules/services/controllers/DTOs/guards/config/Prisma/OpenAPI |
| `api-contracts` | API contract work | REST, OpenAPI, DTOs, errors, pagination, idempotency, webhooks |
| `frontend-design` | UI/UX implementation | Customer marketplace, agency dashboard, responsive UI, accessibility, Arabic RTL |
| `frontend-design-review` | Design critique / frontend PR | Visual quality, hierarchy, accessibility, responsiveness, marketplace/dashboard/mobile UI review |
| `design-system-governance` | Reusable UI/component changes | Tokens, variants, components, themes, accessibility, consistency |
| `shadcn-ui-governance` | shadcn/ui work | Component composition, semantic tokens, forms, tables, dialogs, accessibility |
| `data-dense-ux` | Dashboards/tables/calendars | Operational information hierarchy, KPI/exception design, responsive dense views |
| `rtl-i18n-quality` | Arabic/French/English work | RTL, localization, dates, numbers, currencies, mixed-script content |
| `visual-qa` | Rendered UI QA | Browser verification, responsive states, console/network issues, RTL/LTR checks |
| `frontend-code-review` | Frontend code audit | React/TypeScript correctness, state, performance, security, accessibility, tests |
| `mobile-design-system` | Agency mobile UI | Expo/React Native tokens, components, native-feeling operations UX, RTL |
| `resilient-mobile-ops` | Mobile operational workflows | Weak connectivity, retries, safe offline capture, sync status, QR/photo workflows |
| `financial-auditability` | Financial workflows | Money, deposits, refunds, balances, reconciliation, snapshots, auditability |
| `testing-quality` | Testing/verification | Unit, integration, E2E, database/concurrency, mobile and release quality gates |
| `maps-postgis` | Location/map work | PostGIS, proximity, delivery zones, map/list, geocoding, locations |
| `plan-execution` | Implementing approved plans | Phase/task execution, checkpoints, validation, scope control |
| `agent-skill-security` | Importing external skills | Vet external SKILL.md files before adoption |

## External skill sources used as research

The repository deliberately uses focused local skills instead of blindly copying large external skill packs.

### Frontend/design
- Anthropic Agent Skills — frontend design patterns. https://github.com/anthropics/skills
- Microsoft Agent Skills — systematic frontend design review, accessibility, responsive and design-system checks. https://github.com/microsoft/skills
- shadcn/ui official Agent Skill — component composition, semantic tokens, accessibility and project-aware UI operations. https://github.com/shadcn-ui/ui/tree/main/skills/shadcn
- community frontend-design skills were reviewed for design-context gathering and anti-generic-UI principles.

### Mobile
- Expo Agent Skills — design system, native UI, Router and mobile patterns. MIT. https://github.com/expo/skills

### Engineering/quality
- Supabase Agent Skills — PostgreSQL best practices, MIT. https://github.com/supabase/agent-skills
- Sentry Agent Skills — security-review methodology. https://github.com/getsentry/skills
- EjiroCodes agent skills — NestJS best practices, MIT. https://github.com/ejirocodes/agent-skills
- Jeff Allan Claude Skills — NestJS expert workflow, MIT. https://github.com/Jeffallan/claude-skills
- HoangNguyen0403 Agent Skills Standard — NestJS testing patterns. https://github.com/HoangNguyen0403/agent-skills-standard
- obra/superpowers — executing-plans workflow. https://github.com/obra/superpowers
- Microsoft Playwright / OpenAI Playwright skills — browser automation and rendered verification patterns. https://github.com/microsoft/playwright and https://github.com/openai/skills

### Internal/project research
- Mellah-POS-V2 was reviewed as an internal design/engineering reference for offline-first thinking, audit logs, exact financial calculations, fail-closed security, backups, i18n, and operational verification.
- Car Rental Platform audited repositories are listed under `references/` and remain research sources, not implementation truth.

## Adoption policy

External skills must be reviewed before installation. A local derivative is preferred when it is sufficient. Do not import scripts or arbitrary executable content merely because a skill repository contains it. Preserve attribution and license requirements when adapting open-source material.

## Skill selection policy

Do not load every skill for every task. Load only the skills relevant to the change.

Examples:
- Customer marketplace UI → `frontend-design` + `frontend-design-review` + `design-system-governance` + `rtl-i18n-quality` + `visual-qa`
- Agency dashboard → `frontend-design` + `data-dense-ux` + `frontend-code-review`
- Agency mobile inspection → `mobile-design-system` + `resilient-mobile-ops` + `rtl-i18n-quality` + `visual-qa`
- Booking endpoint → `car-rental-domain` + `nestjs-production` + `api-contracts` + `postgres-production` + `testing-quality`
- Payment/refund → `car-rental-domain` + `financial-auditability` + `nestjs-production` + `testing-quality`
- Map search → `maps-postgis` + `car-rental-domain` + `api-contracts` + `testing-quality`

## Maintenance

When a skill is updated:

1. Re-read its complete content.
2. Verify that it does not conflict with project ADRs/security rules.
3. Record material changes in the commit message and, when architectural, an ADR.
4. Keep each `SKILL.md` concise; move large reference material into repository documentation rather than bloating the trigger-loaded body.
