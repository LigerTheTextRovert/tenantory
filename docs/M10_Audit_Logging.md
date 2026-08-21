# M10 — Audit Logging Engine

## Overview

This milestone builds the **Audit Logging Engine** for our multi-tenant platform. In high-throughput, multi-tenant architectures, especially those dealing with e-commerce, inventory, and users, having a robust audit trail is critical for compliance, security, and debugging.

The Audit Engine is responsible for recording *who* did *what* to *which* entity and *when*. 

You will implement:
- **Tenant-Scoped Audit Trails**: Every audit log must be strictly tied to a `tenant_id`. 
- **Action Tracking**: Logging of critical operations (e.g., `USER_CREATED`, `STOCK_ADJUSTED`, `PRODUCT_DELETED`).
- **Immutable Log Storage**: A PostgreSQL table designed for high-volume inserts and rapid querying, potentially utilizing table partitioning for scale.
- **Asynchronous Logging**: Ensuring that the audit logging mechanism does not add latency to the main HTTP request response cycle.

---

## What You Will Build

You will build the following endpoints under `/api/v1/audit`:

| Method | Endpoint                        | Access Level           | Description                                                |
| :----- | :------------------------------ | :--------------------- | :--------------------------------------------------------- |
| `GET`  | `/api/v1/audit/logs`              | Tenant Admin / Auditor | Retrieve paginated audit logs for the current tenant       |
| `GET`  | `/api/v1/audit/logs/:entityId`    | Tenant Admin / Auditor | Retrieve audit logs for a specific entity (e.g., a product)|

*Note: There are no POST/PUT/DELETE endpoints for audit logs, as they must be immutable and are generated internally by the system.*

---

## File Structure You Will Create

```text
src/
└── audit/
    ├── audit.module.ts                  # Module definition
    ├── audit.controller.ts              # HTTP routes for querying logs
    ├── audit.service.ts                 # Service to write and read logs
    ├── entities/
    │   └── audit-log.entity.ts          # Database entity for immutable logs
    ├── dto/
    │   └── audit-query.dto.ts           # DTO for filtering and pagination
    └── interceptors/
        └── audit-logger.interceptor.ts  # (Optional) Auto-logging interceptor
```

---

## Step 1: The Database Entity

Create `src/audit/entities/audit-log.entity.ts`. This table must be optimized for write-heavy workloads.
Required columns:
- `id`: UUID (Primary Key).
- `tenant_id`: UUID (Foreign Key to Tenants, heavily indexed).
- `actor_id`: UUID (The user who performed the action).
- `action`: String / Enum (e.g., `UPDATE_INVENTORY`, `DELETE_PRODUCT`).
- `entity_type`: String (e.g., `PRODUCT`, `USER`).
- `entity_id`: UUID (The ID of the affected record).
- `old_values`: JSONB (The state before the mutation - optional but recommended).
- `new_values`: JSONB (The state after the mutation).
- `created_at`: Timestamp (Indexed for chronological sorting).

---

## Step 2: Asynchronous Event-Driven Logging

Do not block the main execution thread to write audit logs. 
- Utilize NestJS's built-in `@nestjs/event-emitter` to fire internal events (e.g., `this.eventEmitter.emit('audit.log', payload);`).
- The `AuditService` should listen for these events (`@OnEvent('audit.log')`) and execute the database insert asynchronously.
- Alternatively, for extremely high throughput, leverage Redis + BullMQ (as specified in your `AGENTS.md`) to queue audit logs and process them in a background worker.

---

## Step 3: Tenant-Isolated Querying

In the `AuditController`:
- All queries must strictly inject the `tenant_id` from the secure request context.
- Implement pagination (limit/offset or cursor-based) because audit logs grow rapidly.
- Implement filtering via `AuditQueryDto` (e.g., filter by `actorId`, `action`, `startDate`, `endDate`).

---

## Next Steps

After completing this module:
1. Fire test events from the `InventoryModule` (e.g., when stock is deducted) and verify the log appears in the database.
2. Verify that a Tenant Admin from Tenant A cannot query the audit logs of Tenant B.
3. Validate that the system correctly rolls back or logs failures if the core transaction fails (ensure audit events are only emitted upon *successful* transactions).
