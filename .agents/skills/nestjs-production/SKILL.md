---
name: nestjs-production
description: Build and review production-grade NestJS and TypeScript backend code for the Car Rental Platform. Use for modules, controllers, services, providers, DTOs, validation, guards, interceptors, exception filters, configuration, Prisma integration, OpenAPI, transactions, and backend tests.
---

# NestJS Production Skill

## Project architecture

Use the repository's approved Modular Monolith boundaries. Keep controllers thin. Business rules belong in domain/application services. Persistence details stay behind data-access providers. Avoid circular module dependencies.

## Request handling

- Validate every external input at the API boundary.
- Use typed DTO/request schemas and explicit response contracts.
- Never pass raw request bodies directly into domain/persistence code.
- Keep authentication and authorization server-side.
- Use consistent exception mapping and stable business error codes.
- Document public endpoints with OpenAPI.

## Configuration

- Validate required environment variables at startup.
- Keep secrets out of source and client bundles.
- Separate development, test, staging, and production configuration.

## Database integration

Use Prisma for normal relational access. Isolate PostGIS-specific SQL in a dedicated adapter/repository path. Transactions must be owned by the workflow that needs atomicity, not coordinated by controllers.

## Critical workflows

For booking, payments, entitlements, and other retry-sensitive operations:
- define idempotency behavior;
- handle transaction boundaries explicitly;
- verify tenant scope and permissions;
- write audit records where required;
- test concurrent/retry scenarios.

## Testing

Every new domain service needs unit coverage. Critical HTTP paths need integration/E2E coverage against a real test database rather than mocked persistence. Avoid `any`; close application/database resources in tests.

## External reference

Adapted from MIT-licensed NestJS agent skills including `ejirocodes/agent-skills` and `Jeffallan/claude-skills`. These references emphasize modular architecture, DTO validation, DI, guards, OpenAPI, configuration, and testing.
Sources:
- https://github.com/ejirocodes/agent-skills/tree/main/nestjs/skills/nestjs-best-practices
- https://github.com/Jeffallan/claude-skills/tree/main/skills/nestjs-expert
