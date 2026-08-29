---
name: postgres-production
description: Design, write, migrate, review, and optimize PostgreSQL/PostGIS schemas and queries for the Car Rental Platform. Use for tables, columns, indexes, constraints, transactions, locking, migrations, tenant isolation, geospatial queries, and database performance work.
---

# PostgreSQL Production Skill

## Authority

Follow `architecture/database-physical-spec.md`, `architecture/database-invariants-and-concurrency.md`, and the project's approved ADRs. PostgreSQL is the source of truth for authoritative relational data; Redis/cache is never authoritative.

## Rules

- Use PostgreSQL-native types deliberately; never use floating point for authoritative money.
- Store authoritative timestamps as `timestamptz` in UTC.
- Use UUIDs for internal identifiers and separate human-facing booking numbers.
- Add indexes from actual access patterns, not by habit.
- Use foreign keys, unique constraints, check constraints, and exclusion/range strategies where they encode business invariants safely.
- Design tenant ownership and access paths explicitly.
- Treat migrations as production code: reversible where practical, safe for existing data, and tested before deployment.
- Use transactions for booking/payment/entitlement operations that must be atomic.
- Design retries and idempotency before adding asynchronous/webhook workflows.

## PostGIS

Use PostGIS for authoritative spatial operations: points, polygons, proximity search, delivery zones, branch/pickup discovery, and distance calculations. Keep provider-specific map/geocoding APIs behind adapters. Do not expose sensitive customer or live-vehicle coordinates by default.

## Query discipline

Before optimizing a query:
1. Identify its business purpose and tenant scope.
2. Inspect the query plan with appropriate tooling.
3. Check indexes and cardinality.
4. Consider batching/cursor pagination and N+1 risks.
5. Validate that an optimization does not weaken authorization or historical correctness.

## Concurrency

Booking confirmation/assignment/extension must have authoritative conflict protection. A read saying "available" is not a reservation. Prefer database-enforced invariants where appropriate and combine them with application transactions and idempotency.

## External reference

Adapted from the MIT-licensed Supabase `supabase-postgres-best-practices` Agent Skill, which covers query performance, connection management, schema design, locking, security, data access and advanced PostgreSQL patterns. See `references/README` and `references/` in the upstream repository when deeper research is needed.
Source: https://github.com/supabase/agent-skills/tree/main/skills/supabase-postgres-best-practices
