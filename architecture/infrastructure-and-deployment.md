# Infrastructure & Deployment Architecture

## Principle

Start as a production-ready modular monolith, not microservices.

## Environments

- local
- test
- staging
- production

Each environment has separate credentials, database, storage namespace and external-provider configuration.

## Production topology

```text
Users
  ↓
CDN / TLS / WAF as appropriate
  ↓
Web applications
  ↓
NestJS API
  ├── Managed PostgreSQL + PostGIS
  ├── Private Object Storage
  ├── Redis (when required)
  ├── Email/SMS/Push providers
  ├── Payment providers
  └── Map/geocoding providers
```

## Managed database

Prefer managed PostgreSQL for production so backups, upgrades, monitoring and availability are operated by the provider. Provider choice is separate from database technology.

Requirements:
- PostgreSQL + PostGIS availability;
- encrypted connections;
- backups and restore capability;
- acceptable region/latency;
- connection limits/pooling support;
- monitoring;
- predictable cost;
- migration/export path.

## Local development

Developers may run PostgreSQL locally for reliable development and learning. Production data is never copied locally without an approved sanitized process.

## Object storage

Use private buckets/namespaces for:
- vehicle images
- inspection/damage images
- customer documents
- contracts/PDFs
- generated reports

Store only metadata/references in PostgreSQL.

## Redis

Optional infrastructure component for:
- cache
- rate limiting
- queue backend
- ephemeral coordination

It is never the durable business database.

## Background jobs

Examples:
- notification delivery
- document expiry reminders
- scheduled report generation
- image processing
- provider reconciliation
- maintenance reminders

Jobs must be idempotent or safely retryable.

## Observability

Production requires:
- structured application logs;
- error tracking;
- request/correlation IDs;
- health/readiness endpoints;
- metrics for API/database/queue health;
- alerting for critical failures;
- audit event visibility for privileged operations.

## Deployment safety

- CI required before merge to protected production branch when protection is configured.
- Database migrations reviewed before production.
- Application and migration compatibility considered during deployment.
- Rollback strategy documented per release.
- No manual production patch without a recorded change.

## Scaling path

First scale vertically and through managed infrastructure. Introduce replicas, queues, caching or service extraction only when measurements justify them.

## Backup and disaster recovery

Production launch requires documented:
- RPO
- RTO
- backup retention
- restore test cadence
- recovery owner
- migration recovery procedure

## Mobile release integration

Mobile builds point to explicit environment/API URLs. Production mobile builds must never contain staging secrets.

## Configuration

All environment configuration is validated at startup. Missing required production configuration should fail fast rather than silently use unsafe defaults.
