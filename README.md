# Tenantory

High-throughput, multi-tenant e-commerce inventory and catalog system. Built as a strict modular monolith with NestJS and TypeScript.

## Architecture

```
Request → RequestIdMiddleware → TenantMiddleware → TenantGuard → TenantInterceptor
    → Controller (DTO validation) → Service (business logic + cache) → Repository → PostgreSQL
                                                        ↕
                                                  Redis (CacheService)
```

- **Multi-tenancy model**: Shared database, shared schema with row-level filtering. Every query is tenant-scoped via `tenant_id`; the tenant is resolved from the `X-Tenant-ID` header by global middleware/guards — never trusted from client payloads.
- **Module isolation**: Each business domain lives in its own NestJS module with no circular imports.
- **API style**: URI-versioned (`/api/v1/...`), global prefix `api`, Swagger docs enabled.
- **Validation**: Global `ValidationPipe` with `whitelist: true` and `forbidNonWhitelisted: true` — undeclared payload fields are rejected.

## Tech Stack

| Component  | Technology                          | Purpose                                     |
| ---------- | ----------------------------------- | ------------------------------------------- |
| Framework  | NestJS 11                           | Modular monolith, DI, strict typing         |
| Database   | PostgreSQL                          | Relational storage, JSONB, soft deletes     |
| ORM        | TypeORM                             | Data mapper, optimistic locking, naming strategy |
| Cache      | Redis (ioredis)                     | Read-through caching via a custom `CacheService` |
| Storage    | MinIO (S3-compatible)               | Product images, tenant assets               |
| Validation | class-validator + class-transformer | DTO validation, input sanitization          |
| Logging    | nestjs-pino                         | Structured JSON logs with request IDs       |
| Docs       | @nestjs/swagger                     | OpenAPI documentation                       |

## Prerequisites

- Node.js >= 20
- pnpm (package manager — do not use npm or yarn)
- Docker (for Postgres, Redis, MinIO via docker compose)

## Setup

```bash
# Install dependencies
pnpm install

# Copy environment variables and adjust as needed
cp .env.example .env

# Start infrastructure: PostgreSQL 17, Redis 7, MinIO, pgAdmin
docker compose up -d

# Start development server
pnpm run start:dev
```

Swagger UI is available at `http://localhost:<APP_PORT>/api/docs` in development.

## Environment Variables

See [.env.example](./.env.example) for the full list. Key variables:

| Variable             | Description                                  | Default          |
| -------------------- | -------------------------------------------- | ---------------- |
| `NODE_ENV`           | Environment mode                             | `development`    |
| `APP_PORT`           | Server port                                  | `3000`           |
| `DB_HOST`            | PostgreSQL host                              | `localhost`      |
| `DB_PORT`            | PostgreSQL port                              | `5432`           |
| `DB_USERNAME`        | Database user                                | `tenantory_user` |
| `DB_PASSWORD`        | Database password                            | `tenantory_pass` |
| `DB_DATABASE`        | Database name                                | `tenantory_db`   |
| `DB_SYNCHRONIZE`     | Auto-sync schema (**dev only — never prod**) | `false`          |
| `JWT_ACCESS_SECRET`  | Access-token signing secret                  | —                |
| `JWT_REFRESH_SECRET` | Refresh-token signing secret                 | —                |
| `REDIS_HOST`         | Redis host                                   | `localhost`      |
| `REDIS_PORT`         | Redis port                                   | `6379`           |
| `MINIO_ROOT_USER`    | MinIO root user                              | `minioadmin`     |
| `MINIO_ROOT_PASSWORD`| MinIO root password                          | `minioadmin`     |
| `MINIO_BUCKET_NAME`  | Media bucket name                            | `tenantory`      |

## Scripts

```bash
pnpm run start          # Start production server
pnpm run start:dev      # Start with file watching
pnpm run start:debug    # Start with debug port
pnpm run build          # Compile TypeScript
pnpm run lint           # Run ESLint with auto-fix
pnpm run test           # Unit tests (Jest)
pnpm run test:e2e       # E2E tests (Supertest)
pnpm run test:cov       # Test coverage report
pnpm run format         # Format with Prettier
```

## Caching Layer

Read paths for products, categories, and user profiles use the **cache-aside** pattern through a single shared [`CacheService`](src/common/services/cache.service.ts) (backed by one global ioredis client — services never touch Redis directly):

1. Check Redis first; on hit, return immediately.
2. On miss, query PostgreSQL and store the result with a resource-specific TTL.
3. After any successful write, invalidate the entity key and all related collection keys (SCAN-based pattern delete).

Key characteristics:

- **Tenant-scoped keys** (`t:{tenantId}:product:{id}`) keep tenants logically separated even inside the cache.
- **Centralized policy**: TTLs (products 5 min, categories 30 min, users 5 min) and key generation live in [src/common/constants/cache.constants.ts](src/common/constants/cache.constants.ts) — no magic numbers or raw key strings in business services.
- **Graceful degradation**: every cache operation catches Redis failures, logs them, and falls back to the database; an offline Redis never breaks requests.
- List caches are keyed by a hash of the full query shape (pagination/filters/sort), so different queries never collide.

## Project Structure

```
src/
├── common/              Shared infrastructure
│   ├── constants/       App-wide constants (cache TTLs & key builder)
│   ├── decorators/      Custom decorators (e.g., @TenantDecorator)
│   ├── entities/        Base entity classes
│   ├── filters/         Global exception filters
│   ├── guards/          Auth/authorization guards
│   ├── interceptors/    Response transformation
│   ├── middleware/      Request preprocessing (request IDs)
│   ├── pipes/           Validation pipes
│   ├── utils/           Shared utilities (slug, unique-violation, retry)
│   └── services/        Shared services (CacheService)
├── config/              Swagger configuration
├── redis/               Global Redis module (single ioredis client)
├── logger/              Pino logger module
├── tenant/              Multi-tenancy core (guard, interceptor, middleware)
├── auth/                Authentication, JWT, RBAC guards/decorators
├── category/            Category CRUD (tenant-scoped, tree support)
├── catalog/             Product & Variant CRUD
│   └── product/         ProductService, ProductController, DTOs
├── inventory/           Stock level management (@VersionColumn optimistic locking)
├── warehouse/           Warehouse CRUD
├── supplier/            Supplier CRUD
├── admin/               Tenant/system administration & user management
├── audit/               Audit logging
├── search/              Product search
├── media/               MinIO-based file storage
├── import-export/       Bulk ingestion
└── notifications/       Notification system
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

Unit tests mock repositories, Redis, and cross-service dependencies, covering business rules (uniqueness conflicts, hierarchy constraints, soft-delete guards) as well as caching behavior (hits bypass the database, misses populate the cache with correct keys/TTLs, invalidation fires only after successful writes). See the engineering roadmap in [docs/resume_roadmap.md](docs/resume_roadmap.md) for planned testing infrastructure (TestContainers-based E2E, CI gates).

## Roadmap

Infrastructure and hardening work still on deck is tracked in [docs/resume_roadmap.md](docs/resume_roadmap.md): migration pipeline, distributed locks, Prometheus metrics, health checks, rate limiting, event-driven workers, and CI/CD. Domain design notes live alongside it in the same folder.

## License

Proprietary. All rights reserved.
