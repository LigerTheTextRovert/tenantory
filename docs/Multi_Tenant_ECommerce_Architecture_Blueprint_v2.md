# Software Requirements Specification (SRS) & Implementation Blueprint
## Multi-Tenant E-Commerce Inventory & Catalog System (Monolithic Architecture)

---

### 1. Executive Summary & Architectural Philosophy

This document serves as the definitive engineering blueprint and Software Requirements Specification (SRS) for a production-grade, multi-tenant E-Commerce Inventory & Catalog System. Designed strictly as a robust, single-process monolithic application using NestJS, it prioritizes absolute tenant data isolation, predictable high performance, and strict compliance with clean-code and SOLID principles.

By eliminating the operational overhead of distributed systems (microservices, Kafka, Kubernetes), the architecture focuses on maximizing the capabilities of a single-node Virtual Private Server (VPS) via:
*   Efficient relational schemas and multi-column database indexing.
*   Automated multi-tenant query filtering at the ORM layer.
*   Structured, asynchronous background job delegation (via Redis and BullMQ).
*   Localized in-memory/cache abstractions (cache-aside patterns).
*   Centralized object storage and reverse-proxy gateways.

This monolithic approach ensures rapid development cycles, simplified deployments, and optimal hardware utilization, while retaining logical modular boundaries that facilitate future decomposition if necessary.

---

### 2. Technical Stack & Architectural Justifications

| Component | Technology | Selection & Architectural Justification |
| :--- | :--- | :--- |
| **Framework** | NestJS (TypeScript) | Formidable out-of-the-box dependency injection (DI) container, modular design patterns, strict typing, and native support for guards, interceptors, and pipes. |
| **Database** | PostgreSQL | Enterprise-grade reliability, support for strict relational integrity, ACID compliance for stock movements, and advanced text search extensions (`pg_trgm`). |
| **ORM** | TypeORM | **Justification:** TypeORM is selected over Prisma for this multi-tenant architecture. TypeORM natively supports structural, class-based custom repositories, custom QueryBuilders, and global connection contexts necessary for seamless multi-tenant filtering. |
| **Cache Layer** | Cache Manager & Redis | `@nestjs/cache-manager` paired with a specialized Redis store backend. Implements cache-aside routing patterns for deterministic catalog lookups. |
| **Background Jobs**| `@nestjs/bull` + Redis | Distributed memory queue executing inside the monolithic process boundaries. Ideal for resource-heavy operations like bulk CSV parser operations and transactional alerts. |
| **Media Storage** | MinIO (S3-Compatible) | Dedicated object storage running locally. Decouples binary media assets from the relational database while remaining fully compatible with S3 APIs for future cloud migration. |
| **Reverse Proxy** | Nginx | Local ingress handling multi-tenant domain and subdomain routing, SSL termination, static asset compression, and direct client connection rate-limiting. |
| **Security Layer** | Helmet, CORS, Throttler| Strict HTTP header enforcement via `helmet`, explicit multi-tenant origin control using dynamic CORS, and rate-limiting via `@nestjs/throttler`. |

---

### 3. Multi-Tenancy Strategy & Security Boundaries

#### 3.1 Comparative Evaluation Matrix

1.  **Database-Per-Tenant**: Highest isolation, separate physical/logical databases.
    *   *Downside:* Expensive, hard to scale database connection pools inside a single monolith running on a modest VPS, and complex dynamic connection-pooling management at runtime.
2.  **Schema-Per-Tenant**: Separate PostgreSQL schemas inside a single database. Good isolation.
    *   *Downside:* Schema migrations become increasingly complex as the tenant base grows (running migrations across N schemas synchronously), leading to high maintenance overhead.
3.  **Row-Level Filtering (Shared Database, Shared Schema)**: **Recommended.** All tenants share tables. Separation is strictly enforced via a unique `tenant_id` column present on every tenant-scoped table. It maximizes single VPS resource utilization, keeps connection pools unified, and handles schema migrations instantly across all accounts.

#### 3.2 Security & Isolation Mechanics

To systematically block data leaks without relying on developer discipline, the system combines three NestJS and TypeORM layers:

1.  **Tenant Extraction Interceptor (`TenantInterceptor`)**:
    *   Intercepts incoming HTTP requests.
    *   Extracts tenant identity from custom `X-Tenant-ID` header or subdomain mappings (e.g., `tenant1.domain.com`).
    *   Performs structural validation on the extracted identifier. If missing, it throws a `400 Bad Request` exception.
    *   Binds the validated tenant identifier directly to the request execution context, making it accessible to subsequent guards, controllers, and services.
2.  **Tenant Authorization Guard (`TenantGuard`)**:
    *   Acts as a security checkpoint before route handler execution.
    *   Verifies that the resolved tenant identifier is active, not suspended, and matches any corresponding claims present in the user's authenticated JSON Web Token (JWT).
    *   If tenant context is uninitialized or mismatched, it throws a `401 Unauthorized` or `403 Forbidden` exception.
3.  **TypeORM Global Filtering Mechanics**:
    *   To eliminate human error (forgetting a `where: { tenantId }` clause), all tenant-scoped entities extend an abstract base entity containing a `tenant_id` column.
    *   Repositories inherit from a specialized `TenantBaseRepository` which wraps default query generation routines.
    *   All SELECT queries are automatically injected with `tenantId` constraints via Custom Query Builders.
    *   Write operations are validated at the ORM layer to ensure no record can be persisted or updated with a mismatched tenant identifier.

---

### 4. User Roles & Permissions (RBAC)

The system enforces a strict Role-Based Access Control (RBAC) mechanism. Permissions are tenant-scoped, meaning a user's role grants permissions exclusively within their authorized tenant context.

| Role | Scope | Key Permissions |
| :--- | :--- | :--- |
| **Super Administrator** | Platform-wide (Global) | - Register and provision new tenants<br>- Suspend/activate tenants<br>- Configure global rate-limiting and pricing tiers<br>- Access consolidated platform analytics |
| **Tenant Administrator** | Single Tenant | - Manage tenant-specific settings and configurations<br>- Create, update, and delete tenant users and assign roles<br>- Define tenant-wide shipping rules and default currencies |
| **Catalog/Product Manager**| Single Tenant | - Create, modify, and archive categories and products<br>- Manage product variants, attributes, and base pricing<br>- Initiate bulk import/export of products and categories |
| **Warehouse/Inventory Manager**| Single Tenant | - Configure warehouses and supplier associations<br>- Log manual stock adjustments and update available inventory<br>- Process stock reservations and view inventory audit logs |
| **Storefront Customer** | Single Tenant (Public) | - Read-only access to published catalogs and categories<br>- Execute fuzzy search queries<br>- Perform cart-level stock reservations during checkout |

---

### 5. Core Modules & Functional Requirements

The system is decomposed into 12 logically isolated feature modules:

```
  +---------------------------------------------------------------------------------+
  |                               CORE SYSTEMS LAYER                                |
  +---------------------------------------------------------------------------------+
  |  [Auth & RBAC]   [Tenant Mgmt]   [Catalog Engine]   [Inventory]  [Warehouse]    |
  |  [Supplier]      [Import/Export] [Media Storage]    [Audit Logs] [Notifications]|
  |  [Fuzzy Search]  [Admin Panel]                                                  |
  +---------------------------------------------------------------------------------+
```

#### 5.1 Authentication & Authorization Module
*   **Registration & Login**: Secure signup flows for tenant users. Single Sign-On (SSO) placeholders for enterprise tenants.
*   **Token Management**: Issue short-lived JWT Access Tokens (15-minute expiry) and rotate cryptographically secure Refresh Tokens stored in PostgreSQL (soft-hashed).
*   **MFA (Multi-Factor Authentication)**: Optional Time-based One-Time Password (TOTP) enforcement for administrative roles.
*   **RBAC Evaluation**: Dynamic evaluation of user permissions based on database-driven role-permission mappings.

#### 5.2 Tenant Management Module
*   **Tenant Onboarding**: Self-service onboarding for new merchants, automatically generating a default warehouse and base categories.
*   **Tenant State Machine**: Strictly enforce tenant transitions: `Pending` -> `Active` <-> `Suspended` -> `Archived`. Suspended tenants immediately block all incoming API traffic with a `403 Forbidden` response.
*   **Subdomain & Custom Domain Binding**: Resolve and route requests dynamically based on custom domains validated via CNAME checks.

#### 5.3 Catalog Module
*   **Hierarchical Categories**: Parent-child category structures with slug generation, ensuring nested URLs (e.g., `/clothing/mens/jackets`).
*   **Product Definitions**: Base product metadata including names, descriptions, SKU prefixes, and active statuses.
*   **Variant Management**: Complex product variants containing unique SKUs, pricing parameters, and dynamic attributes stored in JSONB fields (e.g., `{"color": "blue", "size": "XL"}`).

#### 5.4 Inventory & Warehouse Module
*   **Multi-Warehouse Stock Allocations**: Maintain stock levels (available, reserved, and safety stock thresholds) across distinct geographic warehouse nodes.
*   **Stock Reservation Engine**: Atomic stock reservation during checkout, preventing over-allocation under concurrent user sessions.
*   **Low Stock Alerts**: Automatically trigger replenishment warnings when stock drops below defined safety thresholds.

#### 5.5 Supplier Module
*   **Supplier Directory**: Manage comprehensive profiles, lead times, contact details, and contract terms.
*   **SKU Catalog Mapping**: Map tenant product SKUs to supplier-specific part numbers for seamless purchase order generation.

#### 5.6 Import/Export Module
*   **Asynchronous Bulk CSV Ingestion**: Decouple intensive file parsing from the main HTTP loop via BullMQ background tasks.
*   **Schema Validation**: Validate columns and cell formats before database insertion, accumulating errors into an isolation report returned to the user.

#### 5.7 Media Storage Module
*   **Object Ingestion**: Secure direct-to-object-storage or API-buffered image uploads using S3 APIs targeting the local MinIO cluster.
*   **Presigned URLs**: Serve private catalog documents or temporary write links securely.
*   **Image Processing**: Auto-generate thumbnails and optimize dimensions to conserve bandwidth.

#### 5.8 Audit Logging Module
*   **Mutation Interceptors**: Automatically capture state-changing HTTP requests (`POST`, `PUT`, `PATCH`, `DELETE`).
*   **Snapshot Diffing**: Compare entity state before and after execution, persisting detailed JSON diffs in an immutable audit database table.

#### 5.9 Notifications Module
*   **Transactional Alerts**: Push real-time emails, SMS, or Slack alerts for system events (e.g., low stock, bulk import complete).
*   **Webhook Subscriptions**: Allow tenant admins to register endpoints for state-changing catalog events.

#### 5.10 Search Module
*   **Fuzzy Matching**: Power storefront discovery with GIN indexes using the PostgreSQL `pg_trgm` extension.
*   **Ranking & Filtering**: Score relevance and enable multi-facet filters (price range, category, product attributes) dynamically.

#### 5.11 Administration Module
*   **Console Interface**: System-level controls for Super Administrators to monitor platform stats, view job queues, and trigger bulk maintenance tasks.

---

### 6. API Standards & Communication Contracts

#### 6.1 REST Conventions & Resource Nesting
*   All APIs must use plural nouns (e.g., `/api/v1/products`).
*   Nested resources must reflect logical relationships (e.g., `/api/v1/products/:productId/variants`).
*   HTTP verbs must strictly define actions: `GET` for retrieval, `POST` for creation, `PUT` for complete replacement, `PATCH` for partial modification, and `DELETE` for removal/archiving.

#### 6.2 Versioning
*   Strict URL-based API versioning is required. All endpoints must begin with `/api/v{number}/` (e.g., `/api/v1/`).

#### 6.3 Pagination & Filtering
*   **Pagination**: High-throughput public endpoints must enforce pagination using offset parameters or cursor-based keys. Default limit: `20`, maximum limit: `100`.
*   **Standard Metadata**: Every paginated response must include:
    ```json
    {
      "data": [],
      "meta": {
        "totalItems": 150,
        "itemCount": 20,
        "itemsPerPage": 20,
        "totalPages": 8,
        "currentPage": 1
      },
      "links": {
        "first": "/api/v1/products?limit=20",
        "previous": null,
        "next": "/api/v1/products?page=2&limit=20",
        "last": "/api/v1/products?page=8&limit=20"
      }
    }
    ```
*   **Filtering**: Filtering criteria must be passed via query parameters mapped through TypeORM schemas (e.g., `?filter[is_active]=true&filter[category_id]=uuid`).

#### 6.4 RFC 7807 Standard Error Format
All error responses from the API must strictly comply with the RFC 7807 Problem Details specification:
```json
{
  "type": "https://api.platform.com/errors/validation-error",
  "title": "Unprocessable Entity",
  "status": 422,
  "detail": "The request contains invalid parameters in the payload.",
  "instance": "/api/v1/products",
  "timestamp": "2026-07-10T14:30:00.000Z",
  "invalidParams": [
    {
      "name": "sku_prefix",
      "reason": "SKU prefix must be uppercase and exactly 3 characters long."
    }
  ]
}
```

---

### 7. Database Conventions & Architectural Constraints

To preserve relational integrity and database efficiency across all tenants, migrations and ORM entities must adhere to these structural constraints:

1.  **Naming Conventions**:
    *   Tables and columns must use lowercase `snake_case`.
    *   Primary keys must be explicitly named `id` (typed as `UUIDv4`).
    *   Foreign keys must be suffixed with `_id` (e.g., `category_id`, `tenant_id`).
    *   Indexes must follow the naming standard: `idx_[table_name]_[column_names]`.
2.  **Structural Multi-Tenancy Column**:
    *   Every table containing tenant-scoped data must include a `tenant_id` column of type `UUID` referencing the master `tenants` table.
    *   This column must have an explicit B-Tree index, often combined as a composite index with primary search criteria.
3.  **Concurrency Prevention (Optimistic Locking)**:
    *   Entities subject to high write-concurrency (such as `StockLevel`) must implement an integer-based `version` column.
    *   ORM updates to these entities must execute conditional checks on the version, failing with a conflict exception if a mismatch occurs.
4.  **Soft Deletes**:
    *   Master-data entities (such as `Product`, `Category`, `Warehouse`) must not be permanently purged.
    *   A nullable timestamp column `deleted_at` must be implemented.
    *   Global ORM scopes must automatically filter out rows where `deleted_at IS NOT NULL` unless explicitly bypassed.
5.  **Transactions**:
    *   Mutating operations involving multiple dependent entities (e.g., placing stock reservations or processing imports) must be wrapped in a database transaction.
    *   NestJS transactional interceptors or TypeORM QueryRunners must be utilized to ensure rollback on failure.

---

### 8. Core Domain Models (ERD Blueprint)

```
+-----------------------------------------------------------------------------------+
|                                   TENANTS                                         |
|-----------------------------------------------------------------------------------|
| pk_tenant_id (UUID) | domain_name | business_name | status | created_at | updated_|
+-----------------------------------------------------------------------------------+
                                   |
                                   | 1:N
                                   v
+-----------------------------------------------------------------------------------+
|                                  CATEGORIES                                       |
|-----------------------------------------------------------------------------------|
| pk_category_id (UUID) | fk_tenant_id (UUID) | name | slug | parent_id | deleted_at |
+-----------------------------------------------------------------------------------+
                                   |
                                   | 1:N
                                   v
+-----------------------------------------------------------------------------------+
|                                   PRODUCTS                                        |
|-----------------------------------------------------------------------------------|
| pk_product_id (UUID) | fk_tenant_id (UUID)  | fk_category_id (UUID)               |
| name                 | description          | sku_prefix | is_active | deleted_at |
+-----------------------------------------------------------------------------------+
                                   |
                                   | 1:N
                                   v
+-----------------------------------------------------------------------------------+
|                               PRODUCT_VARIANTS                                    |
|-----------------------------------------------------------------------------------|
| pk_variant_id (UUID) | fk_tenant_id (UUID)  | fk_product_id (UUID)                |
| sku (UNIQUE)         | price (DECIMAL)      | attributes (JSONB)       | deleted_at |
+-----------------------------------------------------------------------------------+
                                   |
                                   | 1:N
                                   v
+-----------------------------------------------------------------------------------+
|                                 STOCK_LEVELS                                      |
|-----------------------------------------------------------------------------------|
| pk_stock_id (UUID)   | fk_tenant_id (UUID)  | fk_variant_id (UUID)                |
| fk_warehouse_id(UUID)| available_quantity   | reserved_quantity                   |
| version (INT)        | updated_at           | safety_threshold                    |
+-----------------------------------------------------------------------------------+
                                   ^
                                   | N:1
+-----------------------------------------------------------------------------------+
|                                  WAREHOUSES                                       |
|-----------------------------------------------------------------------------------|
| pk_warehouse_id(UUID)| fk_tenant_id (UUID)  | name | location | deleted_at        |
+-----------------------------------------------------------------------------------+
                                   ^
                                   | N:1
+-----------------------------------------------------------------------------------+
|                                  SUPPLIERS                                        |
|-----------------------------------------------------------------------------------|
| pk_supplier_id(UUID) | fk_tenant_id (UUID)  | company_name | contact_email        |
+-----------------------------------------------------------------------------------+
```

---

### 9. Critical Features & MVP Design Specifications

#### Feature A: Asynchronous Non-Blocking Bulk Product Upload

*   **Purpose**: Allows merchants to ingest high volumes of catalog data without blocking critical HTTP server threads or causing memory overloads on the single-node VPS.
*   **Business Rules**:
    *   Files must be processed asynchronously using a queue.
    *   All changes must be scoped strictly within the active tenant domain.
    *   If a row contains structural or database errors, it must fail individually while permitting other valid rows to be processed.
    *   Duplicate SKUs within the CSV must be flagged and handled according to merchant settings (overwrite or skip).
*   **Validation Rules**:
    *   File type must be strictly CSV. Maximum file size: 10MB.
    *   Required columns: `product_name`, `category_id`, `sku`, `price`.
    *   Numerical values (e.g., `price`) must be positive numbers.
*   **Database Entities**: `Product`, `ProductVariant`, `Category`, `Tenant`.
*   **Service Responsibilities**:
    *   `CatalogBulkController`: Receives the multipart file upload, validates file parameters, saves the file to a secure temporary disk path, registers a background task with BullMQ, and returns a `202 Accepted` response.
    *   `CatalogProcessor` (Worker): Reads the temporary CSV file from disk, streams rows to avoid OOM crashes, executes individual schema and business validation rules, maps valid records to DB entities, executes bulk database insertions, and deletes the temporary file.
*   **Controller Endpoints**:
    *   `POST /api/v1/catalog/bulk-upload`
        *   Payload: Multipart Form-Data (file field)
        *   Response: `202 Accepted` with a job tracking payload:
            ```json
            { "jobId": "bulk_12903", "status": "queued", "estimatedTime": "15s" }
            ```
    *   `GET /api/v1/catalog/bulk-upload/jobs/:jobId`
        *   Response: Returns current status (`processing`, `completed`, `failed`) and failure diagnostics.
*   **Error Handling**:
    *   If the parser encounters general file corruption, fail the entire job and record a general error.
    *   If individual cell validations fail (e.g., negative prices), log the specific row index and column error, and skip the row.
*   **Security Considerations**:
    *   Prevent Path Traversal attacks by sanitizing upload file names.
    *   Strictly validate that the active `tenantId` is passed down to the processor context.
*   **Testing Requirements**:
    *   Mock BullMQ queue structures during unit tests.
    *   Perform integration testing using sample CSV payloads containing valid and invalid rows to verify partial ingestion success.
*   **Acceptance Criteria**:
    *   A 5,000-row valid CSV file parses and imports in under 5 seconds without raising the main thread's memory profile by more than 50MB.
    *   Temporary upload assets are systematically deleted regardless of job success or failure.

#### Feature B: High-Concurrency Race Condition Prevention

*   **Purpose**: Prevents double-allocation or negative inventory balances when multiple storefront customers attempt to purchase the exact same inventory item simultaneously.
*   **Business Rules**:
    *   Stock levels must never fall below zero (except for explicit backorder configurations).
    *   Concurrency conflicts must trigger automatic transaction rollbacks and database isolation.
*   **Validation Rules**:
    *   Stock decrement requests must specify positive integer values.
*   **Database Entities**: `StockLevel`, `ProductVariant`, `Warehouse`.
*   **Service Responsibilities**:
    *   `InventoryService`: Orchestrates the stock reservation workflow.
    *   Fetches the current `StockLevel` record.
    *   Validates sufficient stock is available.
    *   Decrements the stock locally and increments reserved quantities.
    *   Saves the modification via TypeORM. TypeORM automatically maps the optimistic lock check query injecting the retrieved `version`.
    *   Triggers an internal retry or returns a conflict response if an optimistic lock version mismatch error occurs.
*   **Controller Endpoints**:
    *   `POST /api/v1/inventory/deduct`
        *   Payload: `{ "variantId": "uuid", "warehouseId": "uuid", "quantity": 3 }`
        *   Response: `200 OK` on success, `409 Conflict` on version clash or stock exhaustion.
*   **Error Handling**:
    *   Catch `OptimisticLockVersionMismatchError` and translate it to a standard REST `409 Conflict` response with instructions to retry.
*   **Security Considerations**:
    *   Validate that the requesting client possesses adequate authorization scopes (e.g., Checkout Customer or Warehouse Admin).
    *   Ensure the request's parameters align strictly with the tenant ID resolved during authentication.
*   **Testing Requirements**:
    *   Write concurrency-focused E2E tests using Jest.
    *   Mock high-concurrency requests to deduct stock from the same SKU and verify that version increments prevent invalid states.
*   **Acceptance Criteria**:
    *   Under 100 concurrent requests trying to purchase the last available unit of a variant, exactly one request succeeds, 99 fail safely with a `409 Conflict`, and the database value remains exactly zero.

#### Feature C: Scalable Catalog Search & Fuzzy Matching

*   **Purpose**: Powers rapid product discoverability on storefronts, supporting misspellings and incomplete query parameters without the financial and operational overhead of an external search cluster.
*   **Business Rules**:
    *   Search queries must look up terms across product names and descriptions.
    *   The matching logic must support partial words and minor typos.
    *   Results must be strictly scoped to the active tenant.
*   **Validation Rules**:
    *   Query parameters must contain at least 2 alphanumeric characters.
*   **Database Entities**: `Product`, `Category`.
*   **Service Responsibilities**:
    *   `SearchService`: Formulates specialized TypeORM raw query builders.
    *   Injects pg_trgm similarity logic.
    *   Orders the matches by relevance ranking scores.
    *   Applies tenant security filters and pagination before database execution.
*   **Controller Endpoints**:
    *   `GET /api/v1/catalog/search?q=jeans&page=1&limit=20`
        *   Response: Paginated results ordered by pg_trgm match scores.
*   **Error Handling**:
    *   Filter out special characters and SQL injection sequences from search inputs before executing database queries.
*   **Security Considerations**:
    *   Sanitize the search query to prevent cross-tenant search injections.
*   **Testing Requirements**:
    *   Verify pg_trgm database extension is active in test environments.
    *   Test spelling corrections (e.g., search "shrt" returns "shirt").
*   **Acceptance Criteria**:
    *   Search query latency remains below 20ms for up to 10,000 product records.
    *   Slightly misspelled keywords (up to 2 character substitutions) correctly match active target products.

#### Feature D: Transparent Global System Audit Logging

*   **Purpose**: Captures administrative and configuration changes made by merchants, establishing a clear audit trail for operational safety and compliance.
*   **Business Rules**:
    *   All mutating requests (`POST`, `PUT`, `PATCH`, `DELETE`) on master-data must log change records.
    *   Audit logs must be immutable (no update or delete endpoints).
*   **Validation Rules**:
    *   Audit record payloads must contain timestamp, operator details, and the changed fields.
*   **Database Entities**: `AuditLog`, `Tenant`.
*   **Service Responsibilities**:
    *   `AuditInterceptor`: Automatically intercepts mutating controller actions.
    *   Collects user ID, tenant ID, request URL, and request payloads.
    *   Monitors execution; upon success, captures the response body.
    *   Dispatches an asynchronous log writing routine to an immutable database repository or a background queue.
*   **Controller Endpoints**:
    *   `GET /api/v1/admin/audit-logs`
        *   Access: Restricted to Tenant Administrators and Super Admins.
        *   Response: Paginated, read-only list of audit trail events.
*   **Error Handling**:
    *   Audit log operations must fail silently as background tasks, preventing database log failures from interrupting the active customer transaction.
*   **Security Considerations**:
    *   Mask sensitive fields like passwords, tokens, and billing information in logged payloads.
*   **Testing Requirements**:
    *   Verify that mutating HTTP calls trigger the creation of audit entries.
    *   Confirm that `GET` and `OPTIONS` calls never generate audit logs.
*   **Acceptance Criteria**:
    *   Audit record generation overhead adds less than 5ms to the API request lifecycle.
    *   Sensitive parameters are successfully redacted in all logged contexts.

---

### 10. Non-Functional Requirements & Security Foundations

#### 10.1 API Performance & Cache-Aside
*   **Latency Target**: Latency must remain strictly below 200ms for 90% of structural read execution contexts ($p90 < 200\text{ms}$).
*   **Caching Strategy**: Read operations on catalog and category listings must use a cache-aside pattern via Redis. Cache TTL is configured at 1 hour for public queries.
*   **Cache Invalidation**: Mutation actions (`PUT`, `PATCH`, `DELETE`) targeting products, categories, or inventory levels must trigger targeted cache eviction interceptors, clearing the associated tenant cache keys immediately.

#### 10.2 Availability & High Concurrency
*   **Clustering**: The application must run in cluster mode using PM2, utilizing all available CPU cores of the virtual server.
*   **Database Pooling**: Configure database connection pooling limits dynamically to scale up to 100 connections under peak loads, utilizing local PgBouncer proxies if required.
*   **Rate-Limiting**: Dynamically calculate rate limits per tenant using a token bucket strategy configured via `@nestjs/throttler`. Default limits: 1,000 requests per minute per tenant allocation profile.

#### 10.3 Security Posture
*   **Fingerprint Removal**: Strip standard framework headers (`X-Powered-By`) and set security HTTP headers via `helmet`.
*   **CORS Configuration**: CORS policies must validate origin hostnames dynamically against registered tenant domains and subdomains stored in the system cache.

#### 10.4 Backup & Recovery
*   **Database Backups**: Automatically execute hourly WAL (Write-Ahead Logging) archiving and full daily hot backups using `pg_dump` or `pgBackRest`.
*   **Off-site Storage**: Encrypt backup files and synchronize them with a remote secure object storage system daily.

#### 10.5 Observability & Logging
*   **Structured Logging**: Production environments must output structured logs in JSON format to stdout.
*   **Health Telemetry**: Provide a dedicated `/health` endpoint configured via `@nestjs/terminus` that checks DB connection health, memory profiles, queue sizes, and Redis availability.

---

### 11. Testing Strategy

The quality assurance plan enforces a multi-tier testing pyramid to guarantee robust code delivery:

```
                      +-------------------+
                      |   Load/Stress     |  <-- k6 scripts
                      +-------------------+
                      |   End-to-End      |  <-- Supertest / NestJS
                      +-------------------+
                      |   Integration     |  <-- DB transactions / Repositories
                      +-------------------+
                      |      Unit         |  <-- Jest / Isolation Mocking
                      +-------------------+
```

#### 11.1 Unit Testing
*   **Focus**: Domain validation rules, pure business calculators, and individual service methods.
*   **Requirements**: All external dependencies, database repositories, and cache engines must be completely mocked.
*   **Target Coverage**: Minimum 85% statement coverage across all core service modules.

#### 11.2 Integration Testing
*   **Focus**: Relational repository layers, database transaction logic, and custom TypeORM queries.
*   **Requirements**: Run tests against a temporary, local PostgreSQL container managed via Docker to preserve test isolation and data integrity.

#### 11.3 End-to-End (E2E) Testing
*   **Focus**: User workflows and API controller endpoints.
*   **Requirements**: Use `supertest` inside NestJS test modules. E2E suites must cover request validation, guard constraints, multi-tenant security headers, and expected error structures.

#### 11.4 Load & Stress Testing
*   **Focus**: Validating VPS and DB connection pool performance under heavy loads.
*   **Requirements**: Execute k6 load-testing scripts simulating real-world checkout and catalog search traffic patterns.
*   **Target**: Validate platform stability up to 1,500 requests per second (RPS) on a 2-core, 4GB RAM VPS.

---

### 12. Deployment Architecture

To guarantee simple, automated, and deterministic deployment onto single-node VPS environments, the platform employs a standardized containerized architecture.

#### 12.1 Infrastructure Layout

```
                  +-----------------------------------------+
                  |               Nginx Ingress             |
                  +-----------------------------------------+
                                       |
                  +--------------------+--------------------+
                  |                                         |
                  v                                         v
   +------------------------------+          +------------------------------+
   |      NestJS App Node 1       |          |      NestJS App Node 2       |
   +------------------------------+          +------------------------------+
                  |                                         |
                  +--------------------+--------------------+
                                       |
                                       v
         +-----------------------------------------------------------+
         |                       Shared Services                     |
         +-----------------------------------------------------------+
         |  PostgreSQL DB     Redis Cache/Queue     MinIO S3 Storage |
         +-----------------------------------------------------------+
```

#### 12.2 Docker Compose Configuration
The deployment environment is orchestrated using a multi-container Docker Compose setup defining the following isolated services:
*   `app`: The multi-core NestJS monolithic container.
*   `postgres`: Relational storage with customized configuration tuning for performance.
*   `redis`: Single-instance Redis acting as the Cache Store and BullMQ broker.
*   `minio`: Local object storage system mimicking AWS S3 for catalog images.
*   `nginx`: Dynamic reverse-proxy gateway routing traffic and terminating SSL.

#### 12.3 Nginx Gateway Configuration
*   Nginx intercepts all incoming HTTP/HTTPS traffic.
*   Applies rate-limiting profiles on raw connections before forwarding.
*   Maps incoming subdomains to the respective application upstream nodes.
*   Terminates TLS securely, updating headers to include proxy contexts (e.g., `X-Forwarded-For`, `X-Forwarded-Proto`, and custom forwarding identifiers).

#### 12.4 CI/CD Pipeline Blueprint
A standardized GitHub Actions pipeline automates the integration and delivery pipeline:
1.  **Linter and Type-Checking**: Executes `npm run lint` and `npx tsc --noEmit`.
2.  **Automated Testing**: Runs unit and E2E testing suites, exporting coverage metrics.
3.  **Docker Build**: Constructs a lightweight multi-stage Docker production image.
4.  **Security Scanning**: Scans built containers for vulnerabilities.
5.  **Zero-Downtime Deployment**: deploys to the production VPS using blue-green container replacements or rolling PM2 restarts behind Nginx.

---

### 13. Step-by-Step Implementation Roadmap (Milestone-Based Phases)

Rather than rigid timeframes, the development lifecycle is mapped across 7 logical milestones:

```
  M1: Core Setup  ===>  M2: Schema Setup ===> M3: Multi-Tenancy Engine ===> M4: Inventory & Locks
                                                                                 ||
  M7: Deploy      <===  M6: QA & Testing <=== M5: Async Queues & Media   <=======+
```

#### Milestone 1: Foundational Framework & Core Validation Setup
*   **Objectives**: Scaffold NestJS monolith, implement global configurations, and establish request validation pipes.
*   **Key Deliverables**:
    *   `src/app.module.ts`: Modular base file layout.
    *   `src/config/configuration.ts`: Centralized, Joi-validated configurations.
    *   `src/common/pipes/validation-global.pipe.ts`: Strict input filtering configurations.

#### Milestone 2: Relational Schema & Entity Setup
*   **Objectives**: Model the core domain schema in TypeORM and configure migration workflows.
*   **Key Deliverables**:
    *   PostgreSQL schema models (`Product`, `Variant`, `StockLevel`, `Warehouse`, `Category`).
    *   Database connection managers and initial SQL schema migrations.

#### Milestone 3: Multi-Tenancy Engine & Guard Implementation
*   **Objectives**: Implement secure tenant isolation interceptors, route access guards, and ORM base repositories.
*   **Key Deliverables**:
    *   `src/tenant/tenant.interceptor.ts`: Extracts tenant parameters from headers/subdomains.
    *   `src/tenant/tenant.guard.ts`: Enforces tenant-level request validation.
    *   `src/common/repositories/tenant-base.repository.ts`: Intercepts and isolates query builder objects.

#### Milestone 4: Relational Inventory Engine & Concurrency Controls
*   **Objectives**: Implement multi-warehouse stock reservation systems protected by optimistic database locking.
*   **Key Deliverables**:
    *   `src/inventory/inventory.service.ts`: Handles stock reservation/allocation transactions.
    *   Optimistic Locking version columns and transaction failure retry mechanisms.

#### Milestone 5: Asynchronous Ingestion Queues & Media Storage
*   **Objectives**: Setup BullMQ processing routines and integrate file parsing streams alongside MinIO.
*   **Key Deliverables**:
    *   `src/catalog/catalog.processor.ts`: Worker module reading CSV files from disk.
    *   MinIO/S3 object storage upload configurations and direct stream parsers.

#### Milestone 6: Search Optimization & Cache-Aside Invalidation
*   **Objectives**: Optimize search performance with `pg_trgm` GIN indexes and build cache-aside interceptors.
*   **Key Deliverables**:
    *   `SearchService`: Fuzzy text query builder mapping pg_trgm indices.
    *   Cache eviction interceptors clearing invalid storefront caches during mutations.

#### Milestone 7: Quality Assurance & Production Orchestration
*   **Objectives**: Achieve 85%+ code coverage via automated testing and configure production Docker deployments.
*   **Key Deliverables**:
    *   Comprehensive Unit, Integration, and E2E Jest test files.
    *   k6 stress scripts validating performance targets.
    *   Docker Compose configuration files, Nginx proxy templates, and CI/CD actions.

---

### 14. Future Platform Roadmap (Post-MVP)

*   **Global Billing & Subscription Engine**: Implement global subscription tiers for merchants via Stripe, integrating usage tracking profiles to charge dynamically based on tenant transaction volumes.
*   **External Webhooks Gateway**: Build an event-driven notification broker allowing enterprise merchants to subscribe to catalog, price, and inventory state change events.
*   **Consolidated BI Analytics**: Implement localized data aggregation routines to generate high-performance dashboards tracking product velocity, stock rotation indexes, and multi-warehouse utilization.

---

### 15. Resume Bullet Points (Quantified Achievements)

*   **Engineered a multi-tenant catalog platform** supporting 50+ concurrent corporate tenants with absolute data separation, using a row-level filtering strategy in PostgreSQL via NestJS interceptors.
*   **Designed and built a non-blocking bulk data ingestion queue** using `@nestjs/bull` and Redis that parses 25,000+ item rows in under 12 seconds without degrading active HTTP performance.
*   **Eliminated race conditions** on concurrent stock modifications by implementing an optimistic locking versioning system inside TypeORM, preserving inventory state integrity under high stress.
*   **Reduced catalog API response times by 75%** ($p90 < 45\text{ms}$) by implementing a reactive cache-aside architecture using Redis and custom invalidation interceptors.
*   **Optimized product search workflows** by building fuzzy search routines with PostgreSQL `pg_trgm` GIN indexes, removing the need for a dedicated search cluster while matching keywords in sub-15ms.
*   **Enforced a robust multi-tenant security architecture** using customized NestJS guards and interceptors to stop cross-tenant data leaks and unauthorized API updates.
*   **Implemented a global audit logging interceptor** that tracks state-changing mutations with minimal overhead, generating detailed before-and-after change diffs.
*   **Achieved 88% automated code coverage** across complex business modules by writing comprehensive unit and integration tests with Jest and Supertest.
*   **Validated system stability up to 1,500 RPS** under load tests using k6, proactively uncovering and tuning bottlenecked connection pools and indexes.
*   **Configured a highly resilient production environment** on a single VPS using PM2 cluster mode and automated database schema migrations, ensuring 99.9% application uptime.
