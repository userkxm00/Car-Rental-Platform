---
name: testing-quality
description: Build, review, and verify automated tests and quality gates for the Car Rental Platform. Use when adding or changing domain logic, APIs, database workflows, booking/availability/pricing, authentication, payments, mobile operations, or production readiness.
---

# Testing & Quality Skill

## Test pyramid

- Unit-test domain rules and pure calculations.
- Integration-test NestJS modules, Prisma/database behavior, authorization, transactions and critical repositories.
- E2E-test critical customer and agency journeys against a real test database.
- Use real-device/mobile integration checks for camera, QR, notifications and relevant native capabilities.

## Mandatory rental scenarios

Test at minimum:
- concurrent booking attempts for the same inventory;
- extension against a future reservation;
- maintenance/damage blocking;
- manual and web bookings using the same rules;
- price snapshot stability after rate changes;
- duplicate payment/webhook retries;
- tenant A cannot access tenant B;
- staff cannot perform owner/platform-only actions;
- unauthorized document/photo access;
- review eligibility and duplicate review prevention.

## Quality gates

Before marking a task complete:
1. Run focused tests.
2. Run relevant integration/E2E tests.
3. Run type checking and linting.
4. Build affected applications/packages.
5. Check migration safety if schema changed.
6. Review security and authorization impact.
7. Update documentation and acceptance evidence.

## Anti-patterns

Do not overfit tests to implementation details. Do not mock the database for tests whose purpose is to prove database constraints, transactions, tenant isolation, or concurrency behavior.

## External reference

Concepts adapted from public NestJS testing skills and the project's `development-phases.md` quality gates.
Source examples:
- https://github.com/HoangNguyen0403/agent-skills-standard/tree/develop/skills/nestjs/nestjs-testing
- https://github.com/affaan-m/ECC/tree/main/skills/nestjs-patterns
