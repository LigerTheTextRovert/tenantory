# Tenantory

High-throughput, multi-tenant e-commerce inventory and catalog system. Built as a strict modular monolith with NestJS and TypeScript.

## Architecture

```
Request → TenantMiddleware → TenantGuard → TenantInterceptor
    → Controller → Service → Repository → PostgreSQL
```

- **Multi-tenancy model**: Shared database, shared schema with row-level filtering
- **Module isolation**: Each business domain lives in its own NestJS module with no circular imports
- **API style**: URI-versioned (`/api/v1/...`), global prefix `api`

## Tech Stack

| Component  | Technology                          | Purpose                                   |
| ---------- | ----------------------------------- | ----------------------------------------- |
| Framework  | NestJS 11                           | Modular monolith, DI, strict typing       |
| Database   | PostgreSQL                          | Relational storage, JSONB, pg_trgm search |
| ORM        | TypeORM                             | Data mapper, migrations, transactions     |
| Cache      | Redis (cache-manager)               | Read cache, rate limiting                 |
| Queue      | BullMQ                              | Async background job processing           |
| Storage    | MinIO                               | Product images, tenant assets             |
| Validation | class-validator + class-transformer | DTO validation, input sanitization        |
| Security   | Helmet, @nestjs/throttler           | HTTP headers, rate limiting               |
| Health     | @nestjs/terminus                    | Health check endpoints                    |

## Prerequisites

- Node.js >= 20
- pnpm (package manager — do not use npm or yarn)
- PostgreSQL 15+
- Redis 7+
- MinIO (for media storage)

## Setup

```bash
# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env

# Start infrastructure (if using Docker)
docker compose up -d

# Run database migrations
pnpm run migration:run

# Start development server
pnpm run start:dev
```

## Environment Variables

| Variable         | Description                 | Default          |
| ---------------- | --------------------------- | ---------------- |
| `NODE_ENV`       | Environment mode            | `development`    |
| `APP_PORT`       | Server port                 | `3000`           |
| `DB_HOST`        | PostgreSQL host             | `localhost`      |
| `DB_PORT`        | PostgreSQL port             | `5432`           |
| `DB_USERNAME`    | Database user               | `tenantory_user` |
| `DB_PASSWORD`    | Database password           | `tenantory_pass` |
| `DB_DATABASE`    | Database name               | `tenantory_db`   |
| `DB_SYNCHRONIZE` | Auto-sync schema (dev only) | `false`          |

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

## Project Structure

```
src/
├── common/              Shared infrastructure
│   ├── decorators/      Custom decorators (e.g., @TenantDecorator)
│   ├── entities/        Base entity classes
│   ├── filters/         Exception filters
│   ├── guards/          Auth/authorization guards
│   ├── interceptors/    Response transformation
│   ├── middleware/       Request preprocessing
│   ├── pipes/           Validation pipes
│   └── services/        Shared utilities
├── config/              Database and app configuration
├── tenant/              Multi-tenancy core (guard, interceptor, middleware)
├── category/            Category CRUD (M4)
├── catalog/             Product & Variant CRUD (M5)
│   ├── entities/        Product, ProductVariant entities
│   ├── product/         ProductService, ProductController, DTOs
│   └── variant/         VariantService, VariantController, DTOs
├── inventory/           Stock level management (M7)
├── warehouse/           Warehouse CRUD (M7)
├── supplier/            Supplier CRUD (M8)
├── auth/                Authentication & authorization
├── admin/               Admin panel / user management
├── audit/               Audit logging (M6)
├── search/              pg_trgm fuzzy search (M10)
├── media/               MinIO-based file storage (M8)
├── import-export/       Bulk CSV ingestion via BullMQ (M9)
└── notifications/       Notification system
```

## API Design

All endpoints require the `X-Tenant-ID` header for tenant scoping. Responses follow a consistent shape:

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
# Unit tests
pnpm run test

# E2E tests
pnpm run test:e2e

# Coverage
pnpm run test:cov
```

Unit tests mock repositories and external services. E2E tests wire up the full NestJS `TestingModule` with `supertest` for HTTP assertions.

## License

Proprietary. All rights reserved.
