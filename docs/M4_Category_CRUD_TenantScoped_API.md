# M4 — Category CRUD & Tenant-Scoped REST API

## Overview

This milestone builds the **first real business module** — a complete,
tenant-scoped Category CRUD system. It is the proving ground for the entire
multi-tenancy architecture. Every subsequent module (Product, Variant,
Warehouse, Supplier) follows the identical pattern established here.

If Category CRUD works correctly with tenant isolation, pagination, and
validation, the rest of the platform is mechanical repetition.

The goal: a production-ready REST API for managing hierarchical product
categories, scoped entirely to the requesting tenant, with full input
validation, slug generation, and paginated responses.

---

## What You Will Build

```
Request → TenantMiddleware → TenantGuard → TenantInterceptor
    → CategoryController → CategoryService → CategoryRepository → PostgreSQL
         │                     │
    @CurrentTenant('id')    Slug generation
    validates input via      Tree queries
    class-validator DTOs     Pagination
```

A full REST API:

```
GET    /api/v1/categories              → List all categories (paginated, tree or flat)
GET    /api/v1/categories/tree         → Get full category tree for tenant
GET    /api/v1/categories/:id          → Get single category by ID
POST   /api/v1/categories              → Create a new category
PATCH  /api/v1/categories/:id          → Update a category
DELETE /api/v1/categories/:id          → Soft-delete a category
```

---

## Prerequisites

Before starting, ensure you have:

- M1 complete: Global ValidationPipe, HttpExceptionFilter, RequestIdMiddleware
- M2 complete: Category entity exists with `@ManyToOne` Tenant relation
- M3 complete: TenantMiddleware, TenantGuard, TenantInterceptor all wired globally
- `@CurrentTenant()` decorator works in controllers
- TypeORM connected to PostgreSQL with `synchronize: true` (development only)

---

## File Structure You Will Create

```
src/
├── category/
│   ├── category.module.ts                 # Updated — add Service, Controller, Repository
│   ├── category.service.ts                # New — CRUD business logic + slug generation
│   ├── category.controller.ts             # New — RESTful endpoints with DTOs
│   └── dto/
│       ├── create-category.dto.ts         # New — input validation for creation
│       ├── update-category.dto.ts         # New — input validation for updates
│       └── category-query.dto.ts          # New — query param validation (pagination, filters)
├── common/
│   ├── interfaces/
│   │   └── paginated-response.interface.ts # New — standard paginated response shape
│   └── utils/
│       └── slug.util.ts                   # New — reusable slug generation
```

---

## Step 1: Slug Generation Utility

### Why a Separate Utility?

Slug generation is a cross-cutting concern. Products, categories, and any
future entity that needs URL-friendly identifiers will share this logic.
Extracting it now avoids duplication later.

### What It Must Do

Create a pure function `generateSlug(input: string): string` at
`src/common/utils/slug.util.ts` that:

- Lowercases the input
- Decomposes Unicode characters (e.g. "é" → "e" + accent) using
  `normalize('NFD')`, then strips the accent marks — so "Café" becomes
  "cafe", not "café" or "caf-"
- Replaces all non-alphanumeric characters (except spaces and hyphens)
  with nothing
- Converts spaces into hyphens
- Collapses consecutive hyphens into one
- Trims leading and trailing hyphens
- Returns empty string for empty input (caller decides fallback)

**Why this matters:** A category named "Café & Résumé" should produce
slug "cafe-resume". Without Unicode normalization, you get inconsistent
slugs depending on the user's keyboard locale.

### Write Unit Tests

Create a test file at `src/common/utils/__tests__/slug.util.spec.ts`.
Cover these cases at minimum:

1. Simple string → "Hello World" becomes "hello-world"
2. Special characters → strips them, keeps alphanumeric + spaces
3. Unicode accents → "Café" becomes "cafe"
4. Multiple consecutive spaces → collapsed to single hyphen
5. Leading/trailing whitespace → trimmed
6. Already-slugified input → passes through unchanged
7. Empty string → returns empty string
8. Numbers → preserved in the slug

Run tests: `pnpm run test -- --testPathPattern=slug`

---

## Step 2: Standard Paginated Response Interface

### Why Standardize This Now?

Every list endpoint must return a consistent paginated response shape.
The architecture blueprint (Section 6.3) defines the contract. Implementing
it as a reusable interface now means every module adheres to the same format
from day one.

### What to Create

Create `src/common/interfaces/paginated-response.interface.ts` with three
exported interfaces:

1. **PaginationMeta** — contains: `totalItems`, `itemCount`, `itemsPerPage`,
   `totalPages`, `currentPage` (all numbers)
2. **PaginationLinks** — contains: `first` (string), `previous`
   (string | null), `next` (string | null), `last` (string)
3. **PaginatedResponse\<T\>** — generic wrapper with `data: T[]`,
   `meta: PaginationMeta`, `links: PaginationLinks`

Use interfaces, not classes. A class adds runtime overhead with no benefit
here — the response object is constructed manually in the service layer.

---

## Step 3: Category DTOs

### Design Decisions

1. **Separate Create and Update DTOs** — Update uses `PartialType` from
   `@nestjs/common/mapped-types` so all fields are optional. Create enforces
   required fields. Never use a single DTO for both operations.
2. **Whitelist + forbidNonWhitelisted** — Already configured in M1's
   ValidationPipe. Any undeclared field is rejected automatically.
3. **String length bounds on every string** — Prevents buffer-based DoS.
4. **No `tenant_id` in DTOs** — Tenant is injected by the middleware, never
   from the client.

### CreateCategoryDto

Create at `src/category/dto/create-category.dto.ts`. Fields:

- `name` (required) — string, not empty, min length 1, max length 120
- `slug` (optional) — string, max length 150. Auto-generated from name
  if omitted. This avoids forcing clients to compute slugs.
- `parentId` (optional) — UUID. Null or absent means top-level category.
  Must be a valid UUID; the service validates it belongs to this tenant.

**Why `parentId` is a UUID, not a name:** Names are not unique within a
tenant. IDs are. If the client passes a `parentId` that doesn't exist or
belongs to a different tenant, the service rejects it.

### UpdateCategoryDto

Create at `src/category/dto/update-category.dto.ts`. Simply extend
`CreateCategoryDto` using `PartialType`. This makes every property optional
while preserving the validation decorators — so a PATCH request can send
any subset of fields, and only the provided fields are validated.

### CategoryQueryDto

Create at `src/category/dto/category-query.dto.ts`. Fields for filtering
and pagination:

- `page` (optional, default 1) — positive integer, transform from string
  using `@Type(() => Number)` from `class-transformer`
- `limit` (optional, default 20) — positive integer, max 100 (arch blueprint
  Section 6.3 mandate), same `@Type` transform
- `search` (optional) — string, for case-insensitive name filtering
- `parentId` (optional) — string. Filter by parent. Special value "null"
  means return only root categories (where parent_id IS NULL)
- `includeChildren` (optional) — boolean string ("true"/"false"), controls
  whether to eagerly load children relation
- `sortBy` (optional, default "created_at") — restricted to "name",
  "created_at", "updated_at" via `@IsIn`
- `sortOrder` (optional, default "DESC") — restricted to "ASC" or "DESC"

**Why query params instead of request body for filtering?** REST convention:
GET requests use query parameters for filtering, sorting, and pagination.
Request bodies on GET are non-standard and break HTTP caching semantics.

**Why `@Type(() => Number)` on page and limit?** Query parameters arrive
as strings from the URL. class-transformer's `@Type` converts them to
numbers before validation. Without this, `@IsInt()` would reject the
string `"1"`.

---

## Step 4: Category Service

### Why the Service is the Core

The service contains ALL business logic. The controller is thin — it
delegates to the service. The repository is thin — it delegates to TypeORM.
The service is where:

- Tenant ID is injected into every query
- Slug uniqueness is enforced per tenant
- Tree traversal logic lives
- Pagination is calculated
- Soft-delete is managed

### What to Implement

Create `src/category/category.service.ts` as an `@Injectable()` class
with a constructor that injects the Category repository via
`@InjectRepository(Category)`.

**Methods to implement:**

#### `create(tenantId: string, dto: CreateCategoryDto): Promise<Category>`

1. Generate slug: if dto.slug is provided, slugify it; otherwise slugify
   dto.name
2. Assert slug uniqueness within this tenant (throw ConflictException if
   duplicate) — use a QueryBuilder query with `WHERE tenant_id = :tenantId
   AND slug = :slug AND deleted_at IS NULL`
3. If dto.parentId is provided, assert parent exists and belongs to this
   tenant (throw NotFoundException if not)
4. Create the entity using `repo.create()` with the name, slug, tenant
   relation (`{ id: tenantId }`), and parent relation if provided
5. Save with `repo.save()`
6. Catch PostgreSQL error code `23505` (unique violation) and translate
   to ConflictException — this handles the race condition where two
   concurrent requests try to create the same slug

**Why catch 23505?** The application-level slug check is a UX optimization
(fail fast with a clean message). The DB constraint is the final safety net.
Between the check and the insert, another request can slip through.

#### `findAll(tenantId: string, query: CategoryQueryDto): Promise<PaginatedResponse<Category>>`

1. Calculate pagination: `skip = (page - 1) * limit`
2. Build a QueryBuilder starting with `WHERE tenant_id = :tenantId AND
   deleted_at IS NULL`
3. If `query.search` is set, add `AND name ILIKE :search` with `%search%`
   wrapping
4. If `query.parentId` is set, handle the special "null" value as
   `AND parent_id IS NULL`, otherwise `AND parent_id = :parentId`
5. If `query.includeChildren === 'true'`, add `leftJoinAndSelect` for the
   children relation
6. Apply sorting via `orderBy(category.${sortBy}, ${sortOrder})`
7. Execute `skip(skip).take(limit).getManyAndCount()` to get both the data
   and total count in a single query
8. Build and return the PaginatedResponse with data, meta (totalItems,
   itemCount, itemsPerPage, totalPages, currentPage), and links (first,
   previous, next, last — using `/api/v1/categories?page=N&limit=N` format)

#### `findTree(tenantId: string): Promise<Category[]>`

1. Fetch all non-deleted categories for this tenant using `repo.find()`
   with `order: { name: 'ASC' }`
2. Build an in-memory tree using a Map-based approach:
   - Create a Map of id → node (each node starts with empty children array)
   - Iterate categories: if the category has a parent.id, look up the
     parent in the map and push this node into its children array. If the
     parent is not in the map (orphan), treat as root. If no parent.id,
     it's a root node.
3. Return the roots array

**Why Map instead of nested loops?** O(n) vs O(n²). For tenants with
thousands of categories, this matters. The Map approach also handles
orphaned nodes gracefully.

#### `findOne(tenantId: string, id: string): Promise<Category>`

1. Query with `findOne({ where: { id, tenant: { id: tenantId },
   deletedAt: IsNull() }, relations: ['parent', 'children'] })`
2. If null, throw NotFoundException
3. Return the category

#### `update(tenantId: string, id: string, dto: UpdateCategoryDto): Promise<Category>`

1. Fetch the existing category via `findOne(tenantId, id)`
2. If name changed and no explicit slug in dto, regenerate slug from new name
3. If explicit slug provided, use that instead (after slugifying)
4. In both cases, if the new slug differs from the current one, assert
   uniqueness (excluding the current record's ID)
5. If dto.parentId is set:
   - Reject if dto.parentId === id (self-referencing → ConflictException)
   - If parentId is non-null, assert parent exists and belongs to tenant
   - Set parent relation accordingly (null for top-level)
6. If dto.name is set, update the name
7. Save and handle 23505 errors same as create

#### `remove(tenantId: string, id: string): Promise<void>`

1. Fetch via findOne (throws 404 if not found)
2. Count children: `repo.count({ where: { parent: { id }, tenant: { id:
   tenantId }, deletedAt: IsNull() } })`
3. If children count > 0, throw ConflictException — cannot delete a
   category that has children. Client must delete or reassign children first.
4. Soft-delete via `repo.softRemove()`

**Never use `repo.delete()` — that's a hard delete. Architecture requires
soft deletes on all master-data entities.**

### Private Helpers

- `assertSlugUnique(tenantId, slug, excludeId?)` — QueryBuilder check,
  throws ConflictException if exists. excludeId is used during updates to
  exclude the current record.
- `assertParentExists(tenantId, parentId)` — findOne check, throws
  NotFoundException if not found or soft-deleted
- `buildTree(categories)` — the Map-based tree builder described above
- `buildLink(page, limit)` — returns the pagination URL string
- `isUniqueViolation(error)` — checks error.code === '23505'

---

## Step 5: Category Controller

### Why a Thin Controller?

Per AGENTS.md guardrails: controllers must contain zero business logic.
Their sole responsibility is: extract parameters, validate input (handled
by DTOs + ValidationPipe), delegate to service, return response with
correct HTTP status code.

### What to Implement

Create `src/category/category.controller.ts` with `@Controller('categories')`.
Inject CategoryService via constructor.

**Endpoints:**

| Method | Route | Handler | Status | Description |
|--------|-------|---------|--------|-------------|
| GET | `/` | findAll | 200 | Paginated list with filters |
| GET | `/tree` | findTree | 200 | Full hierarchical tree |
| GET | `/:id` | findOne | 200 | Single category with relations |
| POST | `/` | create | 201 | Create new category |
| PATCH | `/:id` | update | 200 | Partial update |
| DELETE | `/:id` | remove | 204 | Soft delete |

**For every handler:**
- Use `@TenantDecorator('id')` to extract the tenant ID from the request
- Use `@Param('id', ParseUUIDPipe)` on `:id` params — validates UUID at
  the controller boundary, returns 400 for invalid UUIDs before touching
  business logic
- Use `@Query() query: CategoryQueryDto` on the GET list handler — the
  global ValidationPipe rejects unknown query params automatically
- Use `@Body() dto: CreateCategoryDto` or `UpdateCategoryDto` on mutation
  handlers
- Use `@HttpCode(HttpStatus.CREATED)` on POST and
  `@HttpCode(HttpStatus.NO_CONTENT)` on DELETE — NestJS defaults to 200

**Route ordering matters:** Define `GET /tree` BEFORE `GET /:id`. Otherwise
NestJS matches "tree" as a UUID param and returns 400 (ParseUUIDPipe
rejects "tree" as a UUID). Always define literal routes before parameterized
routes.

---

## Step 6: Update Category Module

### What to Change

Update `src/category/category.module.ts`:

- Add `CategoryService` to `providers` array
- Add `CategoryController` to `controllers` array
- Keep `TypeOrmModule.forFeature([Category])` in imports
- Add `exports: [TypeOrmModule, CategoryService]`

**Why export CategoryService?** Other modules (Catalog, Search) will need
to look up categories by ID or slug. Exporting lets them inject it without
duplicating the repository registration.

---

## Step 7: Unit Tests — CategoryService

### Strategy

Mock the TypeORM repository entirely. Test business logic in isolation.

### What to Test

Create `src/category/category.service.spec.ts`. Use `Test.createTestingModule`
with a mock repository provider.

**Mock setup:** The mock repository needs these methods:
- `create`, `save`, `find`, `findOne`, `count`, `softRemove`
- `createQueryBuilder` (returns a chainable mock with `where`, `andWhere`,
  `orderBy`, `skip`, `take`, `getManyAndCount`, `getExists`)

**Test cases for `create`:**
1. Creates category with auto-generated slug from name
2. Creates category with explicit slug when provided
3. Throws ConflictException on DB unique violation (error code 23505)

**Test cases for `findAll`:**
1. Returns paginated response with correct meta and links
2. Applies search filter (verifies ILIKE is used)

**Test cases for `findOne`:**
1. Returns category by ID
2. Throws NotFoundException when not found

**Test cases for `update`:**
1. Updates name and regenerates slug

**Test cases for `remove`:**
1. Soft-deletes category when no children exist
2. Throws ConflictException when category has children

Run tests: `pnpm run test -- --testPathPattern=category.service`

---

## Step 8: E2E Tests — Category Controller

### Strategy

Wire up the full NestJS test application with mocked repositories.
Use `supertest` to make real HTTP requests and verify the complete
request lifecycle.

### What to Test

Create `test/category.e2e-spec.ts`.

**Test setup:** Create a NestJS TestingModule importing AppModule.
Override the Category and Tenant repository providers with mocks.
Initialize the app with the same global ValidationPipe.

**Test cases:**

1. **Missing X-Tenant-ID header → 400** — Verify the TenantMiddleware
   rejects requests without the header
2. **Invalid tenant UUID → 400** — Verify UUID format validation
3. **POST creates category → 201** — Send valid body with X-Tenant-ID,
   verify response has name, slug, id
4. **POST with empty name → 400** — Verify DTO validation rejects it
5. **GET returns paginated response → 200** — Verify body has `data`,
   `meta`, `links` properties

Run tests: `pnpm run test:e2e -- --testPathPattern=category`

---

## Request Lifecycle — M4 in Action

```
1. Client sends: GET /api/v1/categories?page=1&limit=20
   Header: X-Tenant-ID: 550e8400-e29b-41d4-a716-446655440000

2. RequestIdMiddleware
   └── Assigns X-Request-Id to response

3. TenantMiddleware
   ├── Extracts "550e8400-..." from X-Tenant-ID
   ├── Validates UUID format
   ├── Calls TenantService.findByIdAndValidate()
   ├── Finds active tenant in DB
   ├── Sets req.tenant = { id: "...", status: "active", ... }
   └── Calls next()

4. TenantGuard
   ├── Reads req.tenant
   ├── Verifies status === ACTIVE
   └── Returns true → proceed

5. TenantInterceptor
   ├── Reads req.tenantId
   └── Wraps call in tenantAsyncStorage.run({ tenantId }, ...)

6. CategoryController.findAll()
   ├── Reads @TenantDecorator('id') → "550e8400-..."
   ├── Reads @Query() → { page: 1, limit: 20 }
   └── Calls CategoryService.findAll(tenantId, query)

7. CategoryService.findAll()
   ├── Builds QueryBuilder with WHERE tenant_id = '550e8400-...'
   ├── Applies pagination (SKIP 0, TAKE 20)
   ├── Executes query → [data, totalItems]
   └── Returns { data, meta, links }

8. Response: 200 OK
   {
     "data": [...],
     "meta": { "totalItems": 45, "currentPage": 1, ... },
     "links": { "next": "/api/v1/categories?page=2&limit=20", ... }
   }
```

---

## Acceptance Criteria

M4 is complete when:

- [ ] `POST /api/v1/categories` creates a category with auto-generated slug
- [ ] `POST /api/v1/categories` rejects empty/missing name (400)
- [ ] `POST /api/v1/categories` rejects duplicate slug within tenant (409)
- [ ] `GET /api/v1/categories` returns paginated response with meta + links
- [ ] `GET /api/v1/categories?search=elec` filters by name (case-insensitive)
- [ ] `GET /api/v1/categories?parentId=null` returns only root categories
- [ ] `GET /api/v1/categories/tree` returns hierarchical tree structure
- [ ] `GET /api/v1/categories/:id` returns single category with parent + children
- [ ] `GET /api/v1/categories/:invalid-uuid` returns 400 (ParseUUIDPipe)
- [ ] `GET /api/v1/categories/:nonexistent-id` returns 404
- [ ] `PATCH /api/v1/categories/:id` updates name and regenerates slug
- [ ] `PATCH /api/v1/categories/:id` rejects self-referencing parent (409)
- [ ] `DELETE /api/v1/categories/:id` soft-deletes category
- [ ] `DELETE /api/v1/categories/:id-with-children` rejects with 409
- [ ] All endpoints require valid `X-Tenant-ID` header (400 without it)
- [ ] Tenant A cannot see, modify, or delete Tenant B's categories
- [ ] Unit tests pass: `pnpm run test`
- [ ] Build passes: `pnpm run build`
- [ ] Lint passes: `pnpm run lint`

---

## Common Pitfalls

### 1. Forgetting Tenant Scope in Queries

The #1 multi-tenancy bug. Every single query in the service MUST include
`WHERE tenant_id = :tenantId`. Without it, Tenant A sees Tenant B's data.
There is no automated guard at the query level — it's your responsibility
in the service layer to inject the tenant filter.

### 2. Not Exporting Service from Module

If you forget `exports: [CategoryService]` in the module, other modules
cannot inject it. The app compiles fine, but at runtime you get a
"Cannot resolve dependencies" error. Always export services and TypeOrmModule.

### 3. Using `save()` Without Prior `create()`

Calling `repo.save({ name: 'foo', tenant: { id } })` directly can produce
unexpected results with relations and lifecycle hooks. Always use
`repo.create()` first to get a managed entity instance, then `repo.save()`.

### 4. Slug Race Conditions

Two concurrent requests can both pass the application-level uniqueness
check, then the DB constraint rejects one with an opaque error. Always
catch PostgreSQL error code `23505` and translate it to a meaningful
`409 Conflict`. The application check is UX; the DB constraint is safety.

### 5. Allowing Self-Referencing Parents

If you update a category's parentId to its own ID, you create a circular
reference. The buildTree function will silently skip it (the node becomes
a root), but it's still data corruption. Explicitly reject this in update.

### 6. Not Soft-Deleting

Using `repo.delete()` instead of `repo.softRemove()` is a hard delete.
Products reference categories via foreign key. Hard-deleting a category
with active products causes FK constraint violations or data loss. Always
soft-delete.

### 7. Query Params Arriving as Strings

`page: "1"` instead of `page: 1`. TypeORM's `skip()` and `take()` expect
numbers. Always use `@Type(() => Number)` from `class-transformer` on
numeric query params in the DTO.

### 8. Route Ordering in Controller

If you define `@Get(':id')` before `@Get('tree')`, NestJS matches "tree"
as a UUID param. The ParseUUIDPipe rejects it with 400. Always define
literal routes (`/tree`) before parameterized routes (`/:id`).

---

## What NOT to Build in M4

- RBAC role checking — that's a separate concern (Auth + RBAC milestone)
- Audit logging of mutations — that's M6 territory
- Redis caching — premature optimization, add after the CRUD works
- Subcategory nesting depth limits — add later if business requires it
- Batch operations (bulk create/update) — save for Import/Export module
- Product/Variant CRUD — that's M5, follow this same pattern

---

## Next Steps After M4

Once M4 is done and tested, the pattern is proven. M5 should implement:

1. **Catalog Module (Product + Variant CRUD)** — follows identical pattern:
   DTOs → Service → Controller → Tests. The key addition is handling the
   Product→Variant→StockLevel chain and the JSONB `attributes` field.

2. **Warehouse CRUD** — simpler than Category (no hierarchy), good for
   parallel work.

3. **Supplier CRUD** — same pattern, straightforward.

All of these are mechanical applications of the M4 pattern. The hard
architectural decisions are already made.
