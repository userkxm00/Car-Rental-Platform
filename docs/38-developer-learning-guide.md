# 38 — Developer Learning Guide

This guide is for the project owner. It explains the stack in practical terms using the Car Rental Platform as the example.

## 1. The stack in one picture

```text
TypeScript
   │
   ├── Web UI
   ├── Mobile UI
   └── NestJS backend
           │
         Prisma
           │
   PostgreSQL + PostGIS
           │
    durable business data
```

Supporting infrastructure:

```text
Redis          → cache/rate limit/queues when needed
Object Storage → photos/documents/PDFs
OpenAPI        → API contract/documentation
Docker         → reproducible development/deployment environment
Monitoring     → errors/performance/health
```

## 2. TypeScript

TypeScript is the primary programming language for the application layer.

It adds static typing to JavaScript and helps catch errors before runtime.

Use it for:
- backend code
- web code
- mobile code
- shared types/contracts

## 3. Node.js

Node.js is the runtime that executes the TypeScript/JavaScript backend after compilation/transpilation.

A useful distinction:

```text
TypeScript = language
Node.js    = runtime
NestJS     = backend framework
```

## 4. NestJS

NestJS organizes the backend into modules/controllers/services/guards/interceptors and other application boundaries.

For this project, domains should be reflected in modules such as:

```text
Auth
Tenancy
Locations
Fleet
Availability
Bookings
Pricing
Customers
Contracts
Inspections
Maintenance
Payments
Notifications
SaaS
```

## 5. PostgreSQL

PostgreSQL is the durable relational database server.

Use it for:
- bookings
- customers
- vehicles
- payments
- contracts
- maintenance
- audit records

It provides transactions, foreign keys, indexes, constraints and concurrency controls needed by this product.

## 6. PostGIS

PostGIS is an extension inside PostgreSQL for geographic data and spatial queries.

Use it for:
- branch coordinates
- parking/pickup points
- delivery-zone polygons
- nearby searches
- geographic distance calculations

Example mental model:

```text
"Show branches within 10 km"
```

This is a database spatial query, not just a map rendering feature.

## 7. Prisma

Prisma is the application's database access layer/ORM.

It helps TypeScript code work with PostgreSQL through typed models and migrations.

Important: Prisma does not replace PostgreSQL knowledge. Critical indexes, constraints, transactions, SQL and PostGIS behavior still need explicit engineering decisions.

For PostGIS-specific operations, use a small controlled SQL/data-access adapter where required instead of pretending geographic types are ordinary scalar ORM fields.

## 8. Authentication

Authentication proves identity.

Example:

```text
email/password
or
phone/OTP
```

The application then establishes a secure session/token.

## 9. Authorization

Authorization decides what the authenticated identity may do.

Example:

```text
User = Ahmed
Tenant = Agency A
Role = Staff
Permission = booking.read
```

A request is permitted only if user identity, membership, role, permission and resource scope all pass.

## 10. Multi-tenancy

One deployed platform can serve many agencies.

```text
Agency A → vehicles/bookings/staff
Agency B → vehicles/bookings/staff
```

Data access must remain isolated by tenant.

## 11. Redis

Redis is not our business database.

Use it only when needed for:
- cache
- rate limiting
- queues/background jobs
- ephemeral coordination

Never use Redis as the authoritative source for bookings or financial history.

## 12. Object storage

Photos, scans and generated documents can become large.

Store bytes in object storage; store metadata/ownership in PostgreSQL.

Examples:
- vehicle photos
- inspection photos
- damage evidence
- customer documents
- contract PDFs

## 13. OpenAPI

OpenAPI describes the API contract so humans and tools can understand endpoints, inputs, outputs, auth requirements and errors.

## 14. Docker

Docker is a packaging/reproducibility tool, not a database.

It can provide a consistent development environment for:
- PostgreSQL
- Redis
- backend dependencies
- local supporting services

The project should decide whether local development uses native PostgreSQL, Docker, or both. Production is a separate infrastructure decision.

## 15. Local vs production

Local development:

```text
Your PC
├── code
├── PostgreSQL + PostGIS
└── optional Redis/object-storage emulator
```

Production:

```text
Internet
  ↓
Web/Mobile
  ↓
NestJS backend
  ↓
Managed PostgreSQL + PostGIS
  + object storage
  + optional Redis/queue
```

The production database does not need to live on your personal computer.

## 16. What to learn first

1. Git/GitHub basics.
2. TypeScript basics.
3. HTTP/REST and JSON.
4. PostgreSQL SQL.
5. relational modeling and foreign keys.
6. indexes and constraints.
7. transactions/concurrency.
8. NestJS architecture.
9. Prisma migrations and queries.
10. PostGIS basics.
11. authentication vs authorization.
12. Docker.
13. production backups and monitoring.

## 17. Project-specific exercises

Learn concepts by using project examples:

- create a vehicle table mentally
- relate vehicle → branch
- relate booking → customer + vehicle
- explain why booking total needs a snapshot
- explain why availability cannot be a boolean
- explain why a delivery zone is a polygon
- explain why a payment correction is a new transaction
- explain why staff cannot access another tenant's booking

## 18. Core rule

Do not optimize for memorizing tools. Learn what responsibility each layer owns.

```text
Language       → TypeScript
Runtime        → Node.js
Backend        → NestJS
ORM/data layer → Prisma
Database       → PostgreSQL
Geospatial     → PostGIS
Cache/queue    → Redis
Files          → Object Storage
Contract       → OpenAPI
Packaging      → Docker
```
