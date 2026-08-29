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
| `testing-quality` | Testing/verification | Unit, integration, E2E, database/concurrency, mobile and release quality gates |
| `maps-postgis` | Location/map work | PostGIS, proximity, delivery zones, map/list, geocoding, locations |
| `plan-execution` | Implementing approved plans | Phase/task execution, checkpoints, validation, scope control |
| `agent-skill-security` | Importing external skills | Vet external SKILL.md files before adoption |

## External skill sources used as research

The repository deliberately uses short local skills instead of blindly copying large external skill packs.

- Supabase Agent Skills — PostgreSQL best practices, MIT. https://github.com/supabase/agent-skills
- Anthropic Agent Skills — frontend design patterns; inspect upstream license/terms before any future direct redistribution. https://github.com/anthropics/skills
- Sentry Agent Skills — security-review methodology. https://github.com/getsentry/skills
- EjiroCodes agent skills — NestJS best practices, MIT. https://github.com/ejirocodes/agent-skills
- Jeff Allan Claude Skills — NestJS expert workflow, MIT. https://github.com/Jeffallan/claude-skills
- HoangNguyen0403 Agent Skills Standard — NestJS testing patterns. https://github.com/HoangNguyen0403/agent-skills-standard
- obra/superpowers — executing-plans workflow. https://github.com/obra/superpowers

## Adoption policy

External skills must be reviewed before installation. A local derivative is preferred when it is sufficient. Do not import scripts or arbitrary executable content merely because a skill repository contains it. Preserve attribution and license requirements when adapting open-source material.

## Maintenance

When a skill is updated:

1. Re-read its complete content.
2. Verify that it does not conflict with project ADRs/security rules.
3. Record material changes in the commit message and, when architectural, an ADR.
4. Keep each `SKILL.md` concise; move large reference material into the repository documentation rather than bloating the trigger-loaded body.
