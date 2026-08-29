# ADR-004 — Release 1 Operational, Search, Jobs & Recovery Targets

## Status
Accepted — 2026-08-29

## Decisions

### Search

Use PostgreSQL/PostGIS search for Release 1.

Use indexed relational filters, PostGIS proximity/containment queries, PostgreSQL full-text/trigram capabilities where appropriate, and carefully designed indexes.

Do not introduce Elasticsearch/OpenSearch until measured search scale or functionality creates a demonstrated need.

### Background processing

Use Redis-backed background jobs where asynchronous work is required for:
- notifications
- reminders
- expiry processing
- scheduled tasks
- media processing
- non-critical asynchronous integrations

Jobs must be idempotent/retry-safe.
Redis is not authoritative business storage.

### Real-time

Release 1 does not require WebSockets as a foundational transport.

Use REST plus cache invalidation/polling/event-driven notifications where appropriate. Introduce WebSockets only for workflows that demonstrate a real requirement, such as live operational collaboration.

### Recovery targets

Initial production target:
- RPO: 1 hour or better for authoritative business data.
- RTO: 4 hours or better for a major service restoration.

Backup strategy must include automated backups, tested restore procedures and off-instance/off-site protection appropriate to the selected managed PostgreSQL provider.

These targets may be tightened as usage and operational maturity increase.

### Observability

Production-critical flows must emit:
- structured logs
- correlation/request IDs
- errors to Sentry or equivalent
- health/readiness signals
- metrics for API latency, failures, jobs and critical booking/payment operations

Sensitive tokens, passwords and secrets must never appear in logs.

## Consequences

The initial system stays operationally simple while preserving a path to higher-scale search, realtime collaboration and stronger recovery targets later.
