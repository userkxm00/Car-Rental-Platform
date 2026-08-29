# ADR-003 — PostgreSQL + PostGIS

Status: Accepted

## Decision

Use PostgreSQL as the authoritative transactional database and PostGIS as the geospatial extension.

## Rationale

The platform requires strong relational integrity, transactions, constraints, auditable financial history, concurrency control, and spatial queries for branches, parking points, pickup locations and delivery zones.

## Consequences

- The schema follows standard PostgreSQL concepts.
- PostGIS is used only where geospatial behavior is needed.
- Prisma is the primary data-access layer, with reviewed SQL for PostGIS-specific operations when ORM support is insufficient.
- The hosted production database may be managed by Supabase or another PostgreSQL provider.
- The application must remain portable across standards-compliant PostgreSQL hosting.
