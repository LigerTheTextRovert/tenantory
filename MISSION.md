# Mission: Build Tenantory — A Production-Grade Multi-Tenant E-Commerce System

## Why
You are building Tenantory, a multi-tenant inventory and catalog management system using NestJS + TypeORM + PostgreSQL. You have the data model (entities) designed and infrastructure in place (middleware, exception filter, validation pipe). The system currently has zero controllers, zero services, zero DTOs, and zero tests. You need the NestJS knowledge to turn this entity graph into a working, secure, well-architected API.

## Success looks like
- Every module (Catalog, Inventory, Warehouse, Tenant, Supplier, Category) has controllers, services, DTOs, and tests
- Tenant isolation is enforced via guards — no query leaks across tenants
- Input validation is strict and consistent across all endpoints
- The request pipeline is fully instrumented (exception filter, interceptors, request-id propagation)
- You can reason about DI, guards, pipes, and interceptors without needing to look them up

## Constraints
- The project already has entities defined — do not redesign the data model unless there is a genuine architectural flaw
- Follow the patterns in AGENTS.md: modular monolith, shared-database multi-tenancy, snake_case DB conventions
- TypeScript strictness is currently relaxed (strictNullChecks: false) — do not try to fix the tsconfig now

## Out of scope
- Frontend / API consumers
- Deployment / Docker / CI/CD
- Business logic for order management or payment processing (not yet in scope)
- Deep Redis/BullMQ queue patterns (reserved for a future learning phase)
