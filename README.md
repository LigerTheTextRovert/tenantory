# Tenantory

A high-throughput, **multi-tenant e-commerce inventory and catalog system** built as a strict modular monolith with NestJS, TypeScript, and PostgreSQL.

Every tenant shares one database and one schema, isolated by enforced row-level filtering — the pattern real SaaS platforms use when they outgrow per-tenant databases but can't compromise on isolation.

## Highlights

- **Hard tenant isolation** — every query is scoped by `tenant_id`, resolved server-side from a verified context. Tenant IDs are never accepted from client payloads.
- **Concurrency-safe inventory** — optimistic locking (`@VersionColumn`) with exponential-backoff retries on stock mutations; transactions wrap multi-step writes.
- **Event-driven internals** — domain events (audit logging, low-stock notifications) emitted only after transactions commit, via port/adapter boundaries that keep modules decoupled.
- **Cache-aside Redis layer** — tenant-prefixed keys, centralized TTL policy, SCAN-based invalidation after writes, graceful degradation when Redis is down.
- **Strict input validation** — global `ValidationPipe` with `whitelist` + `forbidNonWhitelisted`; undeclared fields are rejected, not ignored.
- **Normalized error contract** — one global exception filter, one error shape, everywhere.

## Architecture

```
Request → RequestIdMiddleware → TenantMiddleware → TenantGuard → TenantInterceptor
    → Controller (DTO validation) → Service (business logic + cache) → Repository → PostgreSQL
                                                         ↕
                                                   Redis (CacheService)
```

- **Multi-tenancy**: shared database, shared schema, row-level filtering. The tenant is resolved from the `X-Tenant-ID` header by global middleware/guards.
- **Module isolation**: each business domain lives in its own NestJS module; cross-module communication flows through defined service interfaces and domain events — no circular imports.
- **API style**: URI-versioned (`/api/v1/...`), Swagger docs at `/docs`.

## Tech Stack

| Component  | Technology                          | Purpose                                           |
| ---------- | ----------------------------------- | ------------------------------------------------- |
| Framework  | NestJS 11 + TypeScript              | Modular monolith, DI, strict typing               |
| Database   | PostgreSQL 17                       | Relational storage, JSONB, partial indexes        |
| ORM        | TypeORM                             | Data mapper, migrations, optimistic locking       |
| Cache      | Redis (ioredis)                     | Read-through caching via a custom `CacheService`  |
| Storage    | MinIO (S3-compatible)               | Product images, tenant assets                     |
| Auth       | Passport JWT + RBAC                 | Access/refresh tokens, role guards                |
| Validation | class-validator + class-transformer | DTO validation, input sanitization                |
| Logging    | nestjs-pino                         | Structured JSON logs with request IDs             |
| Docs       | @nestjs/swagger                     | OpenAPI documentation                             |

## Prerequisites

- Node.js >= 20
- pnpm (package manager — do not use npm or yarn)
- Docker (for Postgres, Redis, MinIO via docker compose)

## Getting Started

```bash
# Install dependencies
pnpm install

# Copy environment variables and adjust as needed
cp .env.example .env

# Start infrastructure: PostgreSQL 17, Redis 7, MinIO, pgAdmin
docker compose up -d

# Apply database migrations
pnpm run migration:run

# Start development server
pnpm run start:dev
```

Swagger UI is available at `http://localhost:<APP_PORT>/docs` in development.

## Environment Variables

See [.env.example](./.env.example) for the full list. Key variables:

| Variable              | Description                                  | Default          |
| --------------------- | -------------------------------------------- | ---------------- |
| `NODE_ENV`            | Environment mode                             | `development`    |
| `APP_PORT`            | Server port                                  | `3000`           |
| `DB_HOST`             | PostgreSQL host                              | `localhost`      |
| `DB_PORT`             | PostgreSQL port                              | `5432`           |
| `DB_USERNAME`         | Database user                                | `tenantory_user` |
| `DB_PASSWORD`         | Database password                            | `tenantory_pass` |
| `DB_DATABASE`         | Database name                                | `tenantory_db`   |
| `DB_SYNCHRONIZE`      | Auto-sync schema (**dev only — never prod**) | `false`          |
| `JWT_ACCESS_SECRET`   | Access-token signing secret                  | —                |
| `JWT_REFRESH_SECRET`  | Refresh-token signing secret                 | —                |
| `REDIS_HOST`          | Redis host                                   | `localhost`      |
| `REDIS_PORT`          | Redis port                                   | `6379`           |
| `MINIO_ROOT_USER`     | MinIO root user                              | `minioadmin`     |
| `MINIO_ROOT_PASSWORD` | MinIO root password                          | `minioadmin`     |
| `MINIO_BUCKET_NAME`   | Media bucket name                            | `tenantory`      |

## Scripts

```bash
pnpm run start:dev        # Start with file watching
pnpm run start            # Start production server
pnpm run build            # Compile TypeScript
pnpm run lint             # Run ESLint with auto-fix
pnpm run test             # Unit tests (Jest)
pnpm run test:e2e         # E2E tests (Supertest)
pnpm run test:cov         # Test coverage report
pnpm run format           # Format with Prettier
pnpm run migration:run    # Apply pending migrations
pnpm run migration:revert # Revert the last migration
pnpm run migration:generate # Generate a migration from entity changes
```

## Modules

```
src/
├── common/                Shared infrastructure (decorators, filters, utils, CacheService)
├── config/                Swagger configuration
├── redis/                 Global Redis module (single ioredis client)
├── logger/                Pino logger module
├── tenant/                Multi-tenancy core (guard, interceptor, middleware)
├── auth/                  Authentication, JWT, RBAC guards/decorators
├── admin/                 Tenant/system administration & user management
├── category/              Category CRUD (tenant-scoped, tree support)
├── catalog/               Product & Variant CRUD
├── inventory/             Stock levels, optimistic locking, stock-movement events
├── warehouse/             Warehouse CRUD
├── supplier/              Supplier CRUD
├── audit/                 Audit logging (event-driven, actor + diff snapshots)
├── notifications/         Notification system (event-driven fan-out, dedup, read state)
├── search/                Product search
└── media/                 MinIO-based file storage
```

## API Design

All endpoints require the `X-Tenant-ID` header for tenant scoping. List responses follow a consistent shape:

```json
{
  "data": [],
  "meta": {
    "totalItems": 100,
    "itemCount": 20,
    "itemsPerPage": 20,
    "totalPages": 5,
    "currentPage": 1
  },
  "links": {
    "first": "/api/v1/products?page=1&limit=20",
    "previous": null,
    "next": "/api/v1/products?page=2&limit=20",
    "last": "/api/v1/products?page=5&limit=20"
  }
}
```

### Error Response Format

All errors are normalized by the global exception filter:

```json
{
  "statusCode": 400,
  "timestamp": "2026-07-10T12:00:00.000Z",
  "path": "/api/v1/products",
  "message": "Validation failed",
  "error": "Bad Request",
  "details": ["name must be shorter than or equal to 255 characters"]
}
```

## Testing

```bash
pnpm run test        # Unit tests
pnpm run test:e2e    # E2E tests
pnpm run test:cov    # Coverage report
```

The unit suite covers business rules (uniqueness conflicts, hierarchy constraints, soft-delete guards, optimistic-lock retries), caching behavior (hits bypass the database, invalidation fires only after successful writes), and event-driven flows (notification fan-out, dedup, threshold triggers).

## License

Proprietary. All rights reserved.
