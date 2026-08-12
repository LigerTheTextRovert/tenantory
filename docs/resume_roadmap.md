# Tenantory: Resume-Worthy Engineering Roadmap

To elevate **Tenantory** (a Multi-Tenant E-Commerce Inventory & Catalog System) from a "good side project" to a **senior-level, resume-defining portfolio piece**, it needs to demonstrate your ability to handle production realities: concurrency, observability, deployment, and strict testing. 

You already have an excellent foundation (NestJS, TypeORM, BullMQ, Redis, MinIO, JWT, Multi-Tenancy). This milestone tracker outlines the missing pieces required to prove you are a senior backend engineer.

---

## Milestone 1: Data Integrity & High Concurrency (The "Senior" Differentiator)
*Inventory systems are notoriously hard because of race conditions. Solving this proves you understand backend engineering.*

- [ ] **Implement Optimistic & Pessimistic Locking**: 
  - Add `@VersionColumn()` to the `StockLevel` entity.
  - Implement retry-logic for `OptimisticLockVersionMismatchError` when two users buy the last item at the exact same millisecond.
- [ ] **Distributed Locks (Redis/Redlock)**:
  - Implement a `LockService` using Redis to lock operations around highly contested SKUs (e.g., Flash Sales).
- [ ] **Database Transactions**:
  - Ensure operations spanning multiple tables (e.g., Deducting Inventory + Creating an Audit Log) use strict TypeORM `QueryRunner` transactions with the correct isolation levels (`READ COMMITTED` or `SERIALIZABLE`).

## Milestone 2: Observability, Metrics & Structured Logging
*Senior engineers don't guess; they measure. You need to prove you can monitor a system.*

- [ ] **Structured Logging**: Replace the default NestJS logger with `nestjs-pino`. Configure it to output JSON logs containing `requestId` and `tenantId` in every single log line for easy traceability.
- [ ] **Prometheus Metrics**: Integrate `@willsoto/nestjs-prometheus` to expose a `/metrics` endpoint. 
  - Track API Latency (p50, p95, p99).
  - Track active active connections and database query execution times.
- [ ] **Health Checks**: Expand your `@nestjs/terminus` implementation.
  - Ensure the `/health` endpoint strictly checks Postgres, Redis, and MinIO connectivity.

## Milestone 3: Database Optimization & Search
*E-commerce catalogs require fast reads.*

- [ ] **Advanced Indexing**: 
  - Implement PostgreSQL `pg_trgm` extensions for fuzzy-searching product names and SKUs. 
  - Ensure foreign keys and tenant ID columns have composite indexes (`CREATE INDEX idx_tenant_sku ON inventory(tenant_id, sku);`).
- [ ] **Caching Strategy (Read-Through/Write-Behind)**:
  - Use your existing `CacheManager` to cache frequent Catalog GET requests.
  - Implement aggressive cache invalidation strategies using BullMQ when a product is updated.
- [ ] **Database Migrations**: 
  - Turn OFF `synchronize: true` in your `.env`. 
  - Set up a strict TypeORM migration generation and execution pipeline (`npm run migration:generate`, `npm run migration:run`).

## Milestone 4: Event-Driven Architecture (Decoupling)
*Monoliths should still be internally decoupled.*

- [ ] **Domain Events**: 
  - Implement `@nestjs/event-emitter`. When an `InventoryDeductedEvent` is fired, an independent listener should pick it up to clear the Redis cache and send a notification, keeping the HTTP controller extremely fast.
- [ ] **Background Job Processing**:
  - Use your existing `BullMQ` setup to handle heavy tasks (e.g., generating end-of-day sales reports, batch uploading products via CSV, or resizing uploaded images in `MediaService`).

## Milestone 5: Security & Tenancy Hardening
*Prove that your multi-tenant data is completely isolated.*

- [ ] **Global Row-Level Filtering Check**:
  - Write specific integration tests to prove Tenant A cannot access Tenant B's catalog using ID guessing (BOLA / IDOR protection).
- [ ] **API Rate Limiting**:
  - Configure `@nestjs/throttler` using Redis (`throttler-storage-redis`) to prevent a single noisy tenant from DDOSing the shared database.
- [ ] **Strict DTO Validation**:
  - Ensure `whitelist: true` and `forbidNonWhitelisted: true` are enabled globally so unexpected payload data is stripped automatically.

## Milestone 6: Testing & CI/CD Pipelines
*Code doesn't exist until it's tested and deployed automatically.*

- [ ] **Automated Testing Setup**:
  - **Unit Tests**: Test your complex business logic (like price calculations and locking) using Jest.
  - **Integration Tests (E2E)**: Use `TestContainers` to spin up a real Postgres & Redis instance, run migrations, and hit your API using `supertest`.
- [ ] **GitHub Actions (CI/CD)**:
  - Create a `.github/workflows/main.yml` that runs `npm run lint`, `npm run test:e2e`, and builds the project on every Pull Request.
- [ ] **Dockerization**:
  - Create a highly-optimized, multi-stage `Dockerfile` (using `node:20-alpine`, copying only `package.json` for layer caching, and running as a non-root user).

---

### How to pitch this on your Resume:
> **Tenantory – Multi-Tenant E-Commerce Core API**
> *Built a highly concurrent, modular-monolithic inventory and catalog API using NestJS, PostgreSQL, and Redis.*
> - Architected a strict multi-tenant data layer guaranteeing logical isolation via Row-Level Filtering.
> - Engineered highly-concurrent inventory allocation using TypeORM Optimistic Locking and Redis distributed locks, eliminating race conditions during high-volume transactions.
> - Implemented an event-driven background processing architecture using BullMQ for catalog imports and cache invalidations.
> - Achieved sub-50ms p95 read latency for catalog queries by leveraging Redis caching and PostgreSQL `pg_trgm` fuzzy-search indexes.
> - Ensured production readiness with structured JSON logging (Pino), Prometheus metrics, and automated CI/CD pipelines using GitHub Actions and Docker.
