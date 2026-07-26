# ARCHITECTURE.md — Project State & Module Reference

> Auto-generated reference for AI agents. Read this first before scanning the codebase.

---

## 1. Tech Stack

| Layer       | Technology                            | Notes                                                   |
| ----------- | ------------------------------------- | ------------------------------------------------------- |
| Runtime     | NestJS 11 + TypeScript 5.7            | Modular monolith, strict DI                             |
| ORM         | TypeORM + `typeorm-naming-strategies` | SnakeNamingStrategy, autoLoadEntities                   |
| Database    | PostgreSQL 17                         | JSONB for dynamic attributes, pg_trgm planned           |
| Cache       | Redis (planned)                       | `cache-manager-redis-yet` in deps, not configured       |
| Queue       | BullMQ (planned)                      | `@nestjs/bullmq` in deps, not configured                |
| Storage     | MinIO (planned)                       | `minio` in deps, not configured                         |
| Validation  | class-validator + class-validator     | Global ValidationPipe: whitelist + forbidNonWhitelisted |
| API Docs    | Swagger (`@nestjs/swagger`)           | At `/docs`                                              |
| Package Mgr | pnpm                                  | Do not use npm/yarn                                     |

---

## 2. Module Wiring (`app.module.ts`)

```
AppModule
├── ConfigModule.forRoot (env: .env, isGlobal: true)
├── TypeOrmModule.forRootAsync (Postgres, SnakeNamingStrategy)
├── TenantModule ✅ (middleware + guard + interceptor registered globally)
├── CategoryModule ✅ (full CRUD)
├── CatalogModule ✅ (Product + Variant CRUD)
├── InventoryModule ⚠️ (entity only, no service/controller)
├── WarehouseModule ✅ (full CRUD)
├── SupplierModule ✅ (full CRUD)
├── AuthModule ❌ (empty module)
├── AdminModule ❌ (empty module)
└── AuditModule ❌ (empty module)
```

---

## 3. Request Pipeline

```
Request
  │
  ├─► RequestIdMiddleware        → adds X-Request-Id header
  ├─► TenantMiddleware           → extracts X-Tenant-Id, validates UUID, DB lookup
  ├─► GlobalValidationPipe       → whitelist: true, forbidNonWhitelisted: true
  ├─► TenantGuard                → verifies tenant is ACTIVE, skips @Public() routes
  ├─► TenantInterceptor          → AsyncLocalStorage propagation of TenantContext
  ├─► GlobalExceptionFilter      → normalized error responses
  └─► Controller → Service → Repository
```

**Tenant Middleware Exclusions** (no `X-Tenant-Id` required):

- `GET    /tenants`
- `POST   /tenants`
- `GET    /tenants/:id`
- `PATCH  /tenants/:id`
- `DELETE /tenants/:id`

---

## 4. Database Schema

### Entity → Table Mapping

| Entity         | Table              | Module    | Status         |
| -------------- | ------------------ | --------- | -------------- |
| Tenant         | `tenants`          | tenant    | ✅ Complete    |
| Category       | `categories`       | category  | ✅ Complete    |
| Product        | `products`         | catalog   | ✅ Complete    |
| ProductVariant | `product_variants` | catalog   | ✅ Complete    |
| StockLevel     | `stock_levels`     | inventory | ⚠️ Entity only |
| Warehouse      | `warehouses`       | warehouse | ✅ Complete    |
| Supplier       | `suppliers`        | supplier  | ✅ Complete    |

### Common Entity Columns (all tenant-scoped tables)

```typescript
id: UUID (PK, gen_random_uuid())
tenant_id: UUID (FK → tenants.id, NOT NULL)
created_at: TIMESTAMPTZ (DEFAULT NOW())
updated_at: TIMESTAMPTZ
deleted_at: TIMESTAMPTZ (nullable, soft delete)
```

### Key Entity Relationships

```
Tenant ──1:N──► Category (parent_id self-ref for tree)
Tenant ──1:N──► Product ──1:N──► ProductVariant
Product ──N:1──► Category
Tenant ──1:N──► StockLevel
StockLevel ──N:1──► ProductVariant
StockLevel ──N:1──► Warehouse
Tenant ──1:N──► Warehouse
Tenant ──1:N──► Supplier
```

---

## 5. Directory Structure

```
src/
├── main.ts                          # Bootstrap: prefix, versioning, pipes, guards, filters
├── app.module.ts                    # Root module wiring
├── common/
│   ├── decorators/
│   │   ├── public.decorator.ts      # @Public() — bypasses TenantGuard
│   │   └── tenant.decorator.ts      # @TenantDecorator('id'|'object')
│   ├── filters/
│   │   └── global-exception.filter.ts
│   ├── interfaces/
│   │   └── paginated-response.interface.ts
│   ├── middleware/
│   │   └── request-id.middleware.ts
│   └── utils/
│       ├── assert-unique.util.ts    # isUniqueViolation()
│       └── slug.util.ts             # generateSlug()
├── config/
│   └── swagger.config.ts
├── tenant/
│   ├── entities/tenant.entity.ts
│   ├── dto/                         # create-tenant.dto, update-tenant.dto
│   ├── tenant.middleware.ts
│   ├── tenant.guard.ts
│   ├── tenant.interceptor.ts
│   ├── tenant-context.ts            # AsyncLocalStorage
│   ├── tenant.service.ts
│   ├── tenant.controller.ts
│   └── tenant.module.ts
├── category/
│   ├── entities/category.entity.ts
│   ├── dto/                         # create, update, query DTOs
│   ├── category.service.ts
│   ├── category.service.spec.ts     # 523 lines, comprehensive
│   ├── category.controller.ts
│   └── category.module.ts
├── catalog/
│   ├── entities/
│   │   ├── product.entity.ts
│   │   └── product-variant.entity.ts
│   ├── product/
│   │   ├── dto/
│   │   ├── product.service.ts
│   │   ├── product.service.spec.ts
│   │   └── product.controller.ts
│   ├── variant/
│   │   ├── dto/
│   │   ├── variant.service.ts
│   │   ├── variant.service.spec.ts
│   │   └── variant.controller.ts
│   └── catalog.module.ts
├── inventory/
│   ├── entities/
│   │   ├── stock-level.entity.ts
│   │   └── inventory.entity.ts      # Empty file
│   └── inventory.module.ts          # Only registers StockLevel entity
├── warehouse/
│   ├── entities/warehouse.entity.ts
│   └── warehouse.module.ts          # Only registers entity
├── supplier/
│   ├── entities/supplier.entity.ts
│   └── supplier.module.ts           # Only registers entity
├── auth/                            # Stub — empty module
├── admin/                           # Stub — empty module
├── audit/                           # Stub — empty module
├── search/                          # Stub — empty module
├── media/                           # Stub — empty module
├── notifications/                   # Stub — empty module
└── import-export/                   # Stub — empty module
```

---

## 6. API Endpoints (Implemented)

### Tenants (`/api/v1/tenants`)

| Method | Path           | Description      |
| ------ | -------------- | ---------------- |
| GET    | `/tenants`     | List all tenants |
| POST   | `/tenants`     | Create tenant    |
| GET    | `/tenants/:id` | Get tenant by ID |
| PATCH  | `/tenants/:id` | Update tenant    |
| DELETE | `/tenants/:id` | Delete tenant    |

### Categories (`/api/v1/categories`)

| Method | Path               | Description                  |
| ------ | ------------------ | ---------------------------- |
| GET    | `/categories`      | List (paginated, filterable) |
| POST   | `/categories`      | Create category              |
| GET    | `/categories/tree` | Get category tree            |
| GET    | `/categories/:id`  | Get by ID                    |
| PATCH  | `/categories/:id`  | Update                       |
| DELETE | `/categories/:id`  | Soft delete                  |

### Products (`/api/v1/products`)

| Method | Path            | Description                  |
| ------ | --------------- | ---------------------------- |
| GET    | `/products`     | List (paginated, filterable) |
| POST   | `/products`     | Create product               |
| GET    | `/products/:id` | Get by ID                    |
| PATCH  | `/products/:id` | Update                       |
| DELETE | `/products/:id` | Soft delete                  |

### Variants (`/api/v1/products/:productId/variants`)

| Method | Path                                | Description    |
| ------ | ----------------------------------- | -------------- |
| GET    | `/products/:productId/variants`     | List variants  |
| POST   | `/products/:productId/variants`     | Create variant |
| GET    | `/products/:productId/variants/:id` | Get variant    |
| PATCH  | `/products/:productId/variants/:id` | Update variant |
| DELETE | `/products/:productId/variants/:id` | Delete variant |

---

## 7. Known Bugs & Issues

| Severity    | File                   | Line    | Issue                                                                                                                   | Status |
| ----------- | ---------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------- | ------ |
| 🔴 Critical | `tenant.guard.ts`      | 34      | Header check was refactored to `TenantGuard` and case-insensitivity fixed (`x-tenant-id`).                             | ✅ Fixed |
| 🔴 Critical | `category.service.ts`  | 68      | SQL syntax fixed, but `category.service.spec.ts` needs to be updated to assert on the correct query.                    | ⚠️ Service fixed, tests pending |
| 🟡 Medium   | `main.ts`              | 27      | `GlobalExceptionFilter` is now instantiated directly (`new GlobalExceptionFilter()`).                                    | ✅ Fixed |
| 🟡 Medium   | DTOs                   | various | `@Min(1)` used on string fields — should be `@MinLength(1)`. Same for `@Max(255)` → `@MaxLength(255)`.                   | ✅ Fixed |
| 🟡 Medium   | `tsconfig.json`        | —       | `strictNullChecks: false` disables important type safety.                                                                | ⚠️ Pending |
| 🟢 Low      | `.env`                 | 2,4     | `NODE_ENV` was defined twice.                                                                                           | ✅ Fixed |
| 🟢 Low      | `test/app.e2e-spec.ts` | —       | Tests root endpoint without `/api` prefix and expects incorrect hello message.                                           | ⚠️ Pending |

---

## 8. Implementation Roadmap

### Phase 1 — Fix Critical Bugs

- [x] Fix header case sensitivity in `tenant.middleware.ts` (Refactored to `TenantGuard` using lowercase header)
- [ ] Fix SQL syntax in `category.service.ts` (Service logic fixed; test spec pending fix)
- [x] Fix `@Min/@Max` → `@MinLength/@MaxLength` in DTOs
- [ ] Enable `strictNullChecks` in tsconfig

### Phase 2 — Complete Stub Modules (Follow Category M4 Pattern)

- [x] **Warehouse CRUD** — `WarehouseService`, `WarehouseController`, DTOs
- [x] **Supplier CRUD** — `SupplierService`, `SupplierController`, DTOs
- [ ] **Inventory Module** — `InventoryService` with optimistic locking, stock deduction, retry loops

### Phase 3 — Auth & RBAC

- [ ] JWT access tokens (15min) + refresh tokens
- [ ] Role definitions: SuperAdmin, TenantAdmin, CatalogManager, WarehouseManager, Customer
- [ ] `@Roles()` decorator + `RolesGuard`

### Phase 4 — Audit Logging

- [ ] `AuditInterceptor` — capture POST/PATCH/DELETE mutations
- [ ] Before/after state diffs
- [ ] Immutable `audit_logs` table

### Phase 5 — Performance & Infrastructure

- [ ] Redis caching (catalog reads, cache-aside pattern)
- [ ] `TenantBaseRepository` — auto-inject `tenantId` into queries
- [ ] pg_trgm fuzzy search
- [ ] MinIO media storage
- [ ] BullMQ job queues (import/export)
- [ ] TypeORM migrations directory

### Phase 6 — Production Readiness

- [ ] Docker Compose: add Redis, MinIO, Nginx
- [ ] E2E tests for all modules
- [ ] CI/CD pipeline

---

## 9. Coding Conventions Quick Reference

- **Tables**: pluralized snake_case (`product_variants`)
- **Columns**: snake_case (`tenant_id`, `created_at`)
- **Indexes**: `idx_[table]_[columns]`
- **Foreign Keys**: `fk_[table]_[referenced]`
- **UUIDs**: `gen_random_uuid()` default
- **Soft Deletes**: `deleted_at` column, `@DeleteDateColumn()`
- **Optimistic Locking**: `@VersionColumn()` on volatile rows
- **JSONB**: for dynamic/extensible attributes (e.g., variant `attributes`)
- **DTOs**: `whitelist: true`, `forbidNonWhitelisted: true`
- **Tenant ID**: never in request DTOs — injected via interceptor/middleware
