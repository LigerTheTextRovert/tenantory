# Tenantory: Resume-Worthy Engineering Roadmap

Goal: elevate **Tenantory** from "good side project" to a **senior-level, resume-defining portfolio piece** by demonstrating production realities — concurrency, observability, deployment, and rigorous testing.

This document is the single source of truth for what is done, in progress, and missing. It is updated as milestones land.

**Legend:** ✅ done · 🟡 partially done · ⬜ not started

---

## Current State Snapshot

| Area | Status | Notes |
| --- | --- | --- |
| Multi-tenancy (shared DB, RLF) | ✅ | TenantMiddleware → TenantGuard → TenantInterceptor, tenant-scoped repos |
| Auth + RBAC (JWT access/refresh) | ✅ | Passport strategies, role guards, refresh flow |
| Catalog / Category / Variant CRUD | ✅ | Paginated, tenant-scoped, soft deletes |
| Inventory stock management | ✅ | `@VersionColumn` optimistic locking on `stock_levels` |
| Redis caching layer | ✅ | Cache-aside via `CacheService`, tenant-prefixed keys, SCAN-based invalidation after writes |
| Structured logging | 🟡 | `nestjs-pino` wired globally + request-id middleware; no `tenantId` correlation yet |
| Strict DTO validation | ✅ | `whitelist: true`, `forbidNonWhitelisted: true` global ValidationPipe |
| Unit tests | ✅ | 100+ passing (services, cache, key builder); suite green |
| Infra via docker compose | ✅ | Postgres 17, Redis, MinIO, pgAdmin |
| Retry with exponential backoff + jitter | ✅ | `common/utils/retry.util.ts` |

---

## Milestone 1: Data Integrity & High Concurrency — *the senior differentiator*

Inventory systems are hard because of race conditions. Proving you solved them is the strongest signal on a resume.

- [x] **Optimistic locking**: `@VersionColumn()` on `StockLevel`.
- [ ] **Locking retry integration**: wire `retryWithBackoff` into inventory mutation paths so concurrent `OptimisticLockVersionMismatchError`s retry instead of surfacing as 500s.
- [ ] **Distributed locks (Redlock pattern)**: a `LockService` over Redis to serialize contested SKU allocations (flash-sale scenario).
- [ ] **Explicit transactions**: multi-table mutations (deduct stock + write audit log) wrapped in TypeORM `QueryRunner` transactions with deliberate isolation levels (`READ COMMITTED` vs `SERIALIZABLE`).
- [ ] **Concurrency proof test**: an integration test that fires N parallel allocations against one SKU and asserts zero oversell.

## Milestone 2: Observability, Metrics & Health

Senior engineers measure; they don't guess.

- [x] **Structured JSON logging**: `nestjs-pino`, buffered logs, request IDs.
- [ ] **Tenant-aware log context**: bind `tenantId` (and `requestId`) into every log line via pino child loggers or a Nest scope.
- [ ] **Prometheus metrics**: `/metrics` endpoint (`@willsoto/nestjs-prometheus`) — HTTP latency histogram (p50/p95/p99), DB query durations, cache hit/miss ratio.
- [ ] **Health checks**: `@nestjs/terminus` is installed but **not wired**. Implement `/health` checking Postgres, Redis (PING), and MinIO (bucket existence).

## Milestone 3: Database Optimization & Search

- [x] **Redis caching**: read-through on hot paths (products, categories, user profile), centralized TTLs and key naming, invalidation only after successful DB writes.
- [ ] **Cache stampede protection**: jittered TTLs or single-flight locks for hot list keys.
- [ ] **pg_trgm fuzzy search**: the `search` module currently uses `ILIKE`. Add the extension plus GIN indexes (`gin(column gin_trgm_ops)`) on product names/SKUs via migration.
- [x] **No `synchronize` in prod**: `DB_SYNCHRONIZE` env-gated, default off.
- [ ] **Migration pipeline**: no migrations exist yet and there are **no `migration:*` scripts**. Add `migration:generate` / `migration:run` / `migration:revert` scripts and generate the initial schema from the live entities.

## Milestone 4: Event-Driven Decoupling

Monoliths should still be internally decoupled.

- [ ] **Domain events**: `@nestjs/event-emitter` — e.g., `ProductChangedEvent` listener owns cache invalidation and notifications, keeping services and controllers lean.
- [ ] **BullMQ workers**: `bullmq` is a dependency but **no queue is wired**. Ship at least one real worker: CSV bulk import (`import-export`) or image processing (`media`), with retries and dead-letter handling.

## Milestone 5: Security & Tenancy Hardening

- [ ] **BOLA/IDOR proof tests**: integration tests demonstrating Tenant A cannot read/write Tenant B resources by guessing UUIDs.
- [ ] **Rate limiting**: `@nestjs/throttler` is installed but **not registered**. Configure it with Redis storage so limits are per-instance-safe and per-tenant fair.
- [ ] **Helmet**: dependency present, never applied. Add `app.use(helmet())`.
- [ ] **Refresh-token rotation & revocation**: persist hashed refresh tokens; rotate on use.
- [ ] **Secrets hygiene**: JWT secrets currently live in `.env` committed patterns — document rotation and move to a secrets manager narrative for production.

## Milestone 6: Testing & CI/CD

Code doesn't exist until it's tested and deployed automatically.

- [x] **Unit tests**: Jest, mocked repositories, green suite.
- [ ] **E2E with TestContainers**: spin real Postgres + Redis, run migrations, hit the API with `supertest` (current e2e config is boilerplate).
- [ ] **Coverage gate**: enforce a meaningful threshold in `jest` config; publish coverage in CI.
- [ ] **GitHub Actions CI**: lint → unit → build on every PR; e2e job with service containers.
- [ ] **Production Dockerfile**: multi-stage, `node:20-alpine`, pnpm fetch layer caching, non-root user, healthcheck.
- [ ] **Deploy story**: even a single VM with Compose + Nginx reverse proxy (TLS, rate limiting) completes the narrative end-to-end.

---

## Priority Order (highest resume value first)

1. Migration pipeline + pg_trgm indexes *(cheap, unblocks everything else)*
2. Concurrency hardening: retry wiring, Redlock, oversell-proof integration test
3. E2E TestContainers + GitHub Actions CI
4. Terminus health checks, Helmet, throttler registration *(all near-free wins — deps already installed)*
5. Prometheus metrics + tenant-aware logging
6. One real BullMQ worker + domain events
7. Dockerfile + deploy story

## How to pitch this on your resume

> **Tenantory – Multi-Tenant E-Commerce Core API**
> *Built a highly concurrent, modular-monolithic inventory and catalog API using NestJS, PostgreSQL, and Redis.*
> - Architected a strict multi-tenant data layer guaranteeing logical isolation via row-level filtering with tenant-scoped guards and interceptors.
> - Engineered highly-concurrent inventory allocation using optimistic locking, retry-with-jitter, and Redis distributed locks, eliminating oversell race conditions.
> - Designed a Redis cache-aside layer with tenant-prefixed keys, centralized TTL policy, and post-write SCAN-based invalidation, keeping cross-tenant data out of the cache.
> - Achieved sub-50ms p95 catalog reads via Redis caching and PostgreSQL pg_trgm GIN-indexed fuzzy search.
> - Ensured production readiness with structured JSON logging (Pino), Prometheus metrics, containerized E2E tests, and CI/CD via GitHub Actions and Docker.

*(Only claim bullets above once the corresponding milestone checkbox is ticked — interviewers drill into every line item.)*
