# M5 — Catalog Module: Product & Variant CRUD

## Overview

This milestone builds the **core commerce engine** — the Product and
ProductVariant CRUD system. Where M4 proved the multi-tenancy pattern
with a simple entity, M5 introduces the first **entity chain**: a Product
owns multiple Variants, and each Variant carries its own SKU, price,
and JSONB attributes.

This is where the architecture earns its keep. You will handle:
- Cross-module dependency validation (Product requires a valid Category)
- Nested resource routing (`/api/v1/products/:id/variants`)
- SKU uniqueness enforcement per-tenant
- JSONB attribute storage and retrieval
- Conditional cascading soft-deletes

If M4 was "mechanical repetition of the pattern," M5 is "the pattern
under real domain pressure."

---

## What You Will Build

```
Request → TenantMiddleware → TenantGuard → TenantInterceptor
    → ProductController → ProductService → ProductRepository → PostgreSQL
         │                                        │
    @TenantDecorator('id')              validates Category exists
    validates input via                 enforces SKU uniqueness
    class-validator DTOs                manages Variant chain
         │
    VariantController → VariantService → VariantRepository → PostgreSQL
         │
    Nested under Product routes
    SKU scoped to tenant
    JSONB attributes
```

A full REST API:

```
GET    /api/v1/products                  → List products (paginated, filterable)
GET    /api/v1/products/:id              → Get single product with variants
POST   /api/v1/products                  → Create a new product
PATCH  /api/v1/products/:id              → Update a product
DELETE /api/v1/products/:id              → Soft-delete a product (must have no variants)

GET    /api/v1/products/:productId/variants              → List variants for a product
GET    /api/v1/products/:productId/variants/:variantId   → Get single variant
POST   /api/v1/products/:productId/variants              → Create a variant
PATCH  /api/v1/products/:productId/variants/:variantId   → Update a variant
DELETE /api/v1/products/:productId/variants/:variantId   → Soft-delete a variant
```

---

## Prerequisites

Before starting, ensure you have:

- M4 complete: Category CRUD working, PaginatedResponse interface exists,
  slug utility exists
- Product entity exists at `src/catalog/entities/product.entity.ts`
  with `@ManyToOne` Category relation and `@OneToMany` Variant relation
- ProductVariant entity exists at `src/catalog/entities/product-variant.entity.ts`
  with `@ManyToOne` Product relation, `@Unique(['tenant', 'sku'])`
- CatalogModule registers both entities via `TypeOrmModule.forFeature`
- CategoryModule is exported (you will inject CategoryService to validate
  category existence)

---

## File Structure You Will Create

```
src/
├── catalog/
│   ├── catalog.module.ts                 # Updated — add providers, controllers, imports
│   ├── product/
│   │   ├── product.service.ts            # New — Product CRUD business logic
│   │   ├── product.controller.ts         # New — Product REST endpoints
│   │   └── dto/
│   │       ├── create-product.dto.ts     # New — input validation for product creation
│   │       ├── update-product.dto.ts     # New — input validation for product updates
│   │       └── product-query.dto.ts      # New — query param validation (pagination, filters)
│   └── variant/
│       ├── variant.service.ts            # New — Variant CRUD business logic
│       ├── variant.controller.ts         # New — Variant REST endpoints
│       └── dto/
│           ├── create-variant.dto.ts     # New — input validation for variant creation
│           ├── update-variant.dto.ts     # New — input validation for variant updates
│           └── variant-query.dto.ts      # New — query param validation
```

---

## Step 1: Catalog Module Restructure

### Why Restructure?

The current CatalogModule is a flat container with just entity
registrations. The M5 pattern has two distinct sub-domains: Products and
Variants. NestJS does not require sub-modules for this — you keep
everything inside CatalogModule but organize by subdirectory.

### What to Change

Update `src/catalog/catalog.module.ts`:

1. Add `CategoryModule` to `imports` — the ProductService needs
   CategoryService to validate that a product's `categoryId` points to
   an existing category belonging to this tenant. Do NOT import the
   Category repository directly; use the exported CategoryService from
   CategoryModule.
2. Add `ProductService` and `VariantService` to `providers`
3. Add `ProductController` and `VariantController` to `controllers`
4. Export `TypeOrmModule`, `ProductService`, and `VariantService` —
   other modules (Inventory, Search, Import/Export) will need to look
   up products and variants

**Why import CategoryModule instead of registering the Category repository?**
Circular dependency prevention. If CatalogModule imports the Category
repository and CategoryModule imports the Product repository, you get a
compile-time or runtime circular dependency. Using the exported service
from CategoryModule keeps the dependency graph acyclic.

---

## Step 2: Product DTOs

### CreateProductDto

Create at `src/catalog/product/dto/create-product.dto.ts`. Fields:

- `name` (required) — string, not empty, min length 1, max length 255.
  This matches the entity column definition.
- `description` (optional) — string, max length 5000. The entity allows
  nullable text. Bound the length to prevent absurd payloads.
- `categoryId` (required) — UUID. The service validates it belongs to
  this tenant. You name it `categoryId` in the DTO but map it to the
  `category` relation in the service layer. Never accept `tenant_id` from
  the client.
- `skuPrefix` (required) — string, exactly 3 uppercase alphanumeric
  characters. This is the tenant-scoped prefix that will be prepended
  to variant SKUs. Use `@Matches(/^[A-Z0-9]{3}$/)` for strict
  validation. The service enforces uniqueness within the tenant.
- `isActive` (optional) — boolean, default `true`. Use `@IsBoolean()`
  with `@Transform` from class-transformer to coerce string "true"/"false"
  from JSON bodies into actual booleans.

**Why enforce `skuPrefix` at the DTO level?** Because downstream Variant
SKU generation depends on it being a consistent, well-formed prefix.
Allowing garbage in guarantees garbage out when constructing full SKUs.

### UpdateProductDto

Create at `src/catalog/product/dto/update-product.dto.ts`. Extend
`CreateProductDto` using `PartialType`. Every field becomes optional.

The one difference: `skuPrefix` should ideally NOT change after creation
since existing variant SKUs are constructed from it. The service layer
should reject changes to `skuPrefix` after creation (throw
`ConflictException` explaining that changing the prefix would invalidate
existing variant SKUs). Document this in the DTO with a comment, but the
enforcement lives in the service.

### ProductQueryDto

Create at `src/catalog/product/dto/product-query.dto.ts`. Fields:

- `page` (optional, default 1) — positive integer with `@Type(() => Number)`
- `limit` (optional, default 20) — positive integer, max 100, with `@Type(() => Number)`
- `search` (optional) — string, for case-insensitive name filtering
- `categoryId` (optional) — UUID string, filter by category
- `isActive` (optional) — boolean string ("true"/"false"), filter by active status
- `sortBy` (optional, default "created_at") — restricted to "name",
  "created_at", "updated_at" via `@IsIn`
- `sortOrder` (optional, default "DESC") — restricted to "ASC" or "DESC"

This follows the exact same shape as `CategoryQueryDto` from M4.

---

## Step 3: Variant DTOs

### CreateVariantDto

Create at `src/catalog/variant/dto/create-variant.dto.ts`. Fields:

- `sku` (required) — string, min length 3, max length 100, not empty.
  The entity has `@Unique(['tenant', 'sku'])` so the database enforces
  uniqueness. The service checks before insert for a clean error message.
- `price` (required) — number, must be positive (`@IsPositive()`). The
  entity uses `decimal(12, 2)`. Use `@Type(() => Number)` to handle
  string-to-number coercion.
- `attributes` (optional) — object with `@IsObject()` and
  `@IsNotEmpty()`. This is the JSONB field. Keep validation loose at the
  DTO level — any key-value string map is valid. The service does NOT
  validate attribute semantics; that is a business concern for later
  (e.g., when attribute schemas are introduced). Default to empty object.

**Why keep attributes validation loose?** Because different product
categories have different attribute schemas (a shirt has color/size,
a laptop has RAM/storage). Enforcing a fixed schema at the DTO level
would make the system rigid. JSONB flexibility is the whole point.

### UpdateVariantDto

Create at `src/catalog/variant/dto/update-variant.dto.ts`. Extend
`CreateVariantDto` using `PartialType`.

### VariantQueryDto

Create at `src/catalog/variant/dto/variant-query.dto.ts`. Fields:

- `page` (optional, default 1) — same pattern as ProductQueryDto
- `limit` (optional, default 20) — same pattern
- `search` (optional) — string, for case-insensitive SKU filtering
- `minPrice` (optional) — number, `@Type(() => Number)`, `@IsOptional()`
- `maxPrice` (optional) — number, `@Type(() => Number)`, `@IsOptional()`
- `sortBy` (optional, default "created_at") — restricted to "sku",
  "price", "created_at", "updated_at"
- `sortOrder` (optional, default "DESC") — restricted to "ASC" or "DESC"

---

## Step 4: ProductService

### What to Implement

Create `src/catalog/product/product.service.ts` as an `@Injectable()`
class. Constructor injections:

- `@InjectRepository(Product)` — the Product repository
- `CategoryService` — from the imported CategoryModule, to validate
  category existence

**Methods to implement:**

#### `create(tenantId: string, dto: CreateProductDto): Promise<Product>`

1. Validate that `dto.categoryId` belongs to this tenant by calling
   `CategoryService.findOne(tenantId, dto.categoryId)`. If it throws
   `NotFoundException`, let it propagate — the category does not exist
   or does not belong to this tenant. Do not catch and re-wrap; the
   CategoryService already provides a clear error message.
2. Assert `skuPrefix` uniqueness within this tenant. Build a QueryBuilder
   query: `WHERE tenant_id = :tenantId AND sku_prefix = :skuPrefix
   AND deleted_at IS NULL`. If exists, throw `ConflictException`.
3. Create the entity with `repo.create()` passing name, description,
   skuPrefix, isActive, the category relation (`{ id: dto.categoryId }`),
   and the tenant relation (`{ id: tenantId }`).
4. Save and catch PostgreSQL error code `23505` (unique violation),
   translating to `ConflictException`. Same pattern as M4's CategoryService.

#### `findAll(tenantId: string, query: ProductQueryDto): Promise<PaginatedResponse<Product>>`

1. Calculate `skip = (query.page - 1) * query.limit`
2. Build QueryBuilder: `WHERE product.tenant_id = :tenantId AND
   product.deleted_at IS NULL`
3. If `query.search` is set: `AND product.name ILIKE :search` with
   `%${query.search}%`
4. If `query.categoryId` is set: `AND product.category_id = :categoryId`
5. If `query.isActive` is set: `AND product.is_active = :isActive`
6. Apply sorting via `orderBy(product.${sortBy}, ${sortOrder})`
7. Execute `skip(skip).take(limit).getManyAndCount()`
8. Build and return `PaginatedResponse<Product>` with the same meta/links
   structure from M4

**Key difference from Category:** You do NOT eager-load variants in the
list endpoint. Loading all variants for every product in a paginated list
is an N+1 trap. Variants are loaded only on `findOne` (the detail view)
or on the dedicated variant list endpoint.

#### `findOne(tenantId: string, id: string): Promise<Product>`

1. Query: `findOne({ where: { id, tenant: { id: tenantId }, deletedAt:
   IsNull() }, relations: { category: true, variants: true } })`
2. If null, throw `NotFoundException`
3. Return the product WITH its category and variants loaded

**Why load variants here?** Because the detail view of a product
inherently includes its variants. A product without variants is
meaningless in the commerce model. This is the one read path where
eager loading is correct — it's a single record, not a paginated list.

#### `update(tenantId: string, id: string, dto: UpdateProductDto): Promise<Product>`

1. Fetch existing product via `findOne(tenantId, id)`
2. If `dto.skuPrefix` is present and differs from current, throw
   `ConflictException` — "Cannot change skuPrefix after creation.
   Existing variant SKUs depend on this prefix."
3. If `dto.categoryId` is present, validate the new category belongs
   to this tenant via `CategoryService.findOne()`
4. If `dto.name` is present, update it
5. If `dto.description` is present (including explicit null to clear it),
   update it
6. If `dto.isActive` is present, update it
7. Save and handle 23505 errors

#### `remove(tenantId: string, id: string): Promise<void>`

1. Fetch via `findOne` (throws 404 if not found)
2. Count variants: `repo.manager.getRepository(ProductVariant).count({
   where: { product: { id }, tenant: { id: tenantId }, deletedAt:
   IsNull() } })`
3. If variants count > 0, throw `ConflictException` — "Cannot delete
   product that has variants. Delete or reassign all variants first."
4. Soft-delete via `repo.softRemove()`

**Why count variants before delete?** Because the Product entity has
`onDelete: 'CASCADE'` on the ProductVariant relation, but that is a
database-level cascade. You want to enforce this at the application level
with a clear error message rather than letting PostgreSQL silently cascade
delete all variants. The DB cascade is a safety net, not a feature.

**Alternative approach:** You could inject `VariantService` and call its
`remove` for each variant in a transaction. But that adds complexity and
the business rule is simple: block the delete if children exist. The
client must explicitly delete variants first.

### Private Helpers

- `assertSkuPrefixUnique(tenantId, skuPrefix, excludeId?)` — QueryBuilder
  check, throws ConflictException
- `isUniqueViolation(error)` — same helper from M4, check error.code === '23505'
- `createLink(page, limit)` — returns `/api/v1/products?page=N&limit=N`

---

## Step 5: ProductController

### What to Implement

Create `src/catalog/product/product.controller.ts` with
`@Controller('products')`. Inject `ProductService` via constructor.

**Endpoints:**

| Method | Route       | Handler | Status | Description                        |
|--------|-------------|---------|--------|------------------------------------|
| GET    | `/`         | findAll | 200    | Paginated list with filters        |
| GET    | `/:id`      | findOne | 200    | Single product with variants       |
| POST   | `/`         | create  | 201    | Create new product                 |
| PATCH  | `/:id`      | update  | 200    | Partial update                     |
| DELETE | `/:id`      | remove  | 204    | Soft delete (must have no variants)|

**Per-handler rules (same as M4):**
- `@TenantDecorator('id')` for tenant extraction
- `@Param('id', ParseUUIDPipe)` on `:id` params
- `@Body() dto: CreateProductDto` / `UpdateProductDto` on mutations
- `@Query() query: ProductQueryDto` on GET list
- `@HttpCode(HttpStatus.CREATED)` on POST
- `@HttpCode(HttpStatus.NO_CONTENT)` on DELETE

---

## Step 6: VariantService

### What to Implement

Create `src/catalog/variant/variant.service.ts` as an `@Injectable()`
class. Constructor injections:

- `@InjectRepository(ProductVariant)` — the Variant repository
- `@InjectRepository(Product)` — the Product repository (to validate
  parent product existence)

**Methods to implement:**

#### `create(tenantId: string, productId: string, dto: CreateVariantDto): Promise<ProductVariant>`

1. Validate that the parent product exists and belongs to this tenant.
   Query: `productRepo.findOne({ where: { id: productId, tenant: { id:
   tenantId }, deletedAt: IsNull() } })`. If null, throw
   `NotFoundException`.
2. Assert SKU uniqueness within this tenant: `WHERE tenant_id = :tenantId
   AND sku = :sku AND deleted_at IS NULL`. If exists, throw
   `ConflictException`.
3. Create the entity with `repo.create()` passing sku, price, attributes
  (default to `{}` if not provided), the product relation (`{ id: productId }`),
   and the tenant relation (`{ id: tenantId }`).
4. Save and catch 23505 errors.

**Why validate product existence here even though the URL already
contains productId?** Because the URL only proves the client knows a
UUID. It does not prove the product belongs to this tenant. A malicious
client could guess a UUID from Tenant A and try to create a variant
under it from Tenant B's context. The tenant filter in the query prevents
this.

#### `findAll(tenantId: string, productId: string, query: VariantQueryDto): Promise<PaginatedResponse<ProductVariant>>`

1. First, validate the parent product exists and belongs to this tenant
   (same as create step 1). Throw 404 if not.
2. Calculate skip from page and limit
3. Build QueryBuilder: `WHERE variant.tenant_id = :tenantId AND
   variant.product_id = :productId AND variant.deleted_at IS NULL`
4. If `query.search` is set: `AND variant.sku ILIKE :search` with
   `%${query.search}%`
5. If `query.minPrice` is set: `AND variant.price >= :minPrice`
6. If `query.maxPrice` is set: `AND variant.price <= :maxPrice`
7. Apply sorting and pagination
8. Return `PaginatedResponse<ProductVariant>`

**Why validate parent product on every list call?** Because without this
check, a client could enumerate variants of a product from another
tenant by guessing the product UUID. The product existence check doubles
as a tenant isolation gate. Yes, it adds one query. But security is not
a performance optimization.

#### `findOne(tenantId: string, productId: string, variantId: string): Promise<ProductVariant>`

1. Query: `findOne({ where: { id: variantId, product: { id: productId },
   tenant: { id: tenantId }, deletedAt: IsNull() } })`
2. If null, throw `NotFoundException`
3. Return the variant

**Note:** The query filters on BOTH productId and variantId. This
prevents a client from accessing a variant that belongs to a different
product, even if the variant UUID is valid.

#### `update(tenantId: string, productId: string, variantId: string, dto: UpdateVariantDto): Promise<ProductVariant>`

1. Fetch existing variant via `findOne(tenantId, productId, variantId)`
2. If `dto.sku` is present and differs from current:
   - Assert SKU uniqueness within tenant (excluding this variant's ID)
   - If duplicate, throw `ConflictException`
   - Update the sku
3. If `dto.price` is present, update it
4. If `dto.attributes` is present, replace the entire attributes object.
   Do NOT merge — this is a PATCH, but JSONB attribute replacement is
   intentional. If the client sends `{ "color": "blue" }`, that becomes
   the complete attributes set. This prevents stale keys from persisting.
5. Save and handle 23505 errors

#### `remove(tenantId: string, productId: string, variantId: string): Promise<void>`

1. Fetch via `findOne` (throws 404 if not found)
2. Soft-delete via `repo.softRemove()`

**Why no child-count check here?** Unlike Product→Variant, the Variant
does not have child entities in the current schema. StockLevels reference
variants via FK, but that is handled separately in M7 (Inventory). For
M5, a variant with active stock levels would be blocked by the DB
FK constraint if you tried to hard-delete. Since we soft-delete, the
FK remains intact and no constraint violation occurs.

---

## Step 7: VariantController

### What to Implement

Create `src/catalog/variant/variant.controller.ts` with
`@Controller('products/:productId/variants')`. This is a **nested
resource controller** — every route is scoped under a parent product.

Inject `VariantService` via constructor.

**Endpoints:**

| Method | Route                              | Handler | Status | Description                       |
|--------|------------------------------------|---------|--------|-----------------------------------|
| GET    | `/`                                | findAll | 200    | Paginated variants for product    |
| GET    | `/:variantId`                      | findOne | 200    | Single variant                    |
| POST   | `/`                                | create  | 201    | Create variant under product      |
| PATCH  | `/:variantId`                      | update  | 200    | Partial update                    |
| DELETE | `/:variantId`                      | remove  | 204    | Soft delete variant               |

**Critical routing detail:** Use `@Param('productId', ParseUUIDPipe)` on
every handler. This validates the parent product UUID at the controller
boundary. The `:variantId` param also uses `ParseUUIDPipe`.

**Why nest under products instead of a flat `/api/v1/variants` route?**
Because variants have no meaning without their parent product. The URL
structure communicates the ownership relationship explicitly. It also
makes tenant isolation more natural — the productId in the URL becomes
an additional validation point in the service, not just a filter.

---

## Step 8: Catalog Module Final Wiring

After implementing all services and controllers, the final
`src/catalog/catalog.module.ts` should look like:

- `imports`: `TypeOrmModule.forFeature([Product, ProductVariant])`,
  `CategoryModule` (from `../category/category.module`)
- `providers`: `ProductService`, `VariantService`
- `controllers`: `ProductController`, `VariantController`
- `exports`: `TypeOrmModule`, `ProductService`, `VariantService`

**Why export both services?** The InventoryModule (M7) will inject
ProductVariantService to look up variants when managing stock levels.
The SearchModule will need ProductService for catalog search results.
Exporting now prevents rewiring later.

---

## Step 9: Unit Tests — ProductService

### Strategy

Mock the Product repository and CategoryService. Test business logic
in isolation.

### Mock Setup

The mock repository needs: `create`, `save`, `find`, `findOne`, `count`,
`softRemove`, `createQueryBuilder` (chainable mock). The mock
CategoryService needs: `findOne` (returns a category or throws).

### Test Cases

**create:**
1. Creates product with valid categoryId → succeeds, returns product with category
2. Throws NotFoundException when categoryId is invalid or belongs to
   another tenant
3. Throws ConflictException on duplicate skuPrefix (23505 error)
4. Creates product with isActive defaulting to true when not provided

**findAll:**
1. Returns paginated response with correct meta/links
2. Applies search filter on name
3. Filters by categoryId
4. Filters by isActive

**findOne:**
1. Returns product with category and variants loaded
2. Throws NotFoundException when not found

**update:**
1. Updates name successfully
2. Throws ConflictException when trying to change skuPrefix
3. Updates categoryId after validating new category belongs to tenant

**remove:**
1. Soft-deletes when no variants exist
2. Throws ConflictException when variants exist

Run tests: `pnpm run test -- --testPathPattern=product.service`

---

## Step 10: Unit Tests — VariantService

### Mock Setup

Mock both ProductVariant repository and Product repository. The Product
mock needs `findOne` to validate parent product existence.

### Test Cases

**create:**
1. Creates variant with valid productId and unique sku
2. Throws NotFoundException when productId is invalid or belongs to
   another tenant
3. Throws ConflictException on duplicate sku (23505 error)
4. Creates variant with empty attributes default when not provided

**findAll:**
1. Returns paginated variants scoped to the product
2. Throws NotFoundException when product does not exist
3. Filters by price range (minPrice, maxPrice)
4. Filters by sku search

**findOne:**
1. Returns variant by ID
2. Throws NotFoundException when not found

**update:**
1. Updates price successfully
2. Replaces attributes entirely (does not merge)
3. Throws ConflictException on duplicate sku

**remove:**
1. Soft-deletes variant

Run tests: `pnpm run test -- --testPathPattern=variant.service`

---

## Step 11: E2E Tests — Product Controller

### Strategy

Wire up the full NestJS TestingModule with mocked repositories for
Product, ProductVariant, and Category. Use `supertest` for HTTP requests.

### Test Cases

1. **POST creates product → 201** — Send valid body with name,
   categoryId, skuPrefix. Verify response has all fields.
2. **POST with missing categoryId → 400** — DTO validation rejects it.
3. **POST with invalid skuPrefix format → 400** — e.g., "ab" (too short),
   "abcd" (too long), "abc" (lowercase) all rejected.
4. **GET returns paginated products → 200** — Verify data, meta, links
   structure.
5. **GET /:id returns product with variants → 200**
6. **GET /:invalid-uuid returns 400** — ParseUUIDPipe
7. **DELETE with active variants → 409** — Business rule enforcement.
8. **All endpoints require X-Tenant-ID → 400 without it**

Run tests: `pnpm run test:e2e -- --testPathPattern=product`

---

## Step 12: E2E Tests — Variant Controller

### Test Cases

1. **POST creates variant → 201** — Valid body with sku, price.
2. **POST with duplicate sku → 409**
3. **POST under nonexistent product → 404**
4. **GET returns variants → 200** — Paginated response.
5. **GET with price range filter → 200** — Verify results are within range.
6. **DELETE variant → 204**

Run tests: `pnpm run test:e2e -- --testPathPattern=variant`

---

## Request Lifecycle — M5 in Action

```
1. Client sends: POST /api/v1/products
   Header: X-Tenant-ID: 550e8400-e29b-41d4-a716-446655440000
   Body: {
     "name": "Classic T-Shirt",
     "categoryId": "abc-123-...",
     "skuPrefix": "TSH",
     "isActive": true
   }

2. TenantMiddleware → TenantGuard → TenantInterceptor
   (same as M4 — tenant context established)

3. ProductController.create()
   ├── Reads @TenantDecorator('id') → "550e8400-..."
   ├── Reads @Body() → CreateProductDto (validated by ValidationPipe)
   └── Calls ProductService.create(tenantId, dto)

4. ProductService.create()
   ├── Calls CategoryService.findOne(tenantId, dto.categoryId)
   │   └── Validates category exists and belongs to this tenant
   ├── Asserts skuPrefix "TSH" is unique within this tenant
   ├── Creates Product entity with category relation
   ├── Saves — catches 23505 if race condition on skuPrefix
   └── Returns the created Product

5. Response: 201 Created
   {
     "id": "...",
     "name": "Classic T-Shirt",
     "skuPrefix": "TSH",
     "isActive": true,
     "category": { "id": "...", "name": "Clothing", ... },
     "createdAt": "..."
   }
```

```
1. Client sends: POST /api/v1/products/:productId/variants
   Header: X-Tenant-ID: 550e8400-...
   Body: {
     "sku": "TSH-BLU-M",
     "price": 29.99,
     "attributes": { "color": "blue", "size": "M" }
   }

2. VariantController.create()
   ├── Reads @Param('productId', ParseUUIDPipe) → validates UUID
   ├── Reads @Body() → CreateVariantDto (validated)
   └── Calls VariantService.create(tenantId, productId, dto)

3. VariantService.create()
   ├── Validates product exists and belongs to this tenant
   ├── Asserts sku "TSH-BLU-M" is unique within this tenant
   ├── Creates ProductVariant entity with product and tenant relations
   ├── Saves — catches 23505 if race condition on sku
   └── Returns the created ProductVariant

4. Response: 201 Created
   {
     "id": "...",
     "sku": "TSH-BLU-M",
     "price": 29.99,
     "attributes": { "color": "blue", "size": "M" },
     "createdAt": "..."
   }
```

---

## Acceptance Criteria

M5 is complete when:

- [ ] `POST /api/v1/products` creates a product with valid categoryId
- [ ] `POST /api/v1/products` rejects missing categoryId (400)
- [ ] `POST /api/v1/products` rejects invalid skuPrefix format (400)
- [ ] `POST /api/v1/products` rejects duplicate skuPrefix within tenant (409)
- [ ] `POST /api/v1/products` rejects categoryId from another tenant (404)
- [ ] `GET /api/v1/products` returns paginated products with meta + links
- [ ] `GET /api/v1/products?search=shirt` filters by name
- [ ] `GET /api/v1/products?categoryId=...` filters by category
- [ ] `GET /api/v1/products?isActive=false` filters by active status
- [ ] `GET /api/v1/products/:id` returns product with category and variants
- [ ] `GET /api/v1/products/:invalid-uuid` returns 400
- [ ] `PATCH /api/v1/products/:id` updates name and description
- [ ] `PATCH /api/v1/products/:id` rejects skuPrefix changes (409)
- [ ] `DELETE /api/v1/products/:id` soft-deletes when no variants
- [ ] `DELETE /api/v1/products/:id-with-variants` rejects (409)
- [ ] `POST /api/v1/products/:productId/variants` creates a variant
- [ ] `POST /api/v1/products/:productId/variants` rejects duplicate sku (409)
- [ ] `POST /api/v1/products/:productId/variants` rejects nonexistent product (404)
- [ ] `GET /api/v1/products/:productId/variants` returns paginated variants
- [ ] `GET /api/v1/products/:productId/variants?minPrice=10&maxPrice=50` filters
- [ ] `GET /api/v1/products/:productId/variants/:variantId` returns single variant
- [ ] `PATCH /api/v1/products/:productId/variants/:variantId` updates price/attributes
- [ ] `DELETE /api/v1/products/:productId/variants/:variantId` soft-deletes
- [ ] Tenant A cannot see, modify, or delete Tenant B's products or variants
- [ ] Unit tests pass: `pnpm run test`
- [ ] Build passes: `pnpm run build`
- [ ] Lint passes: `pnpm run lint`

---

## Common Pitfalls

### 1. Not Validating Category Tenant Ownership

The most dangerous bug in M5: validating that a category EXISTS but
not that it BELONGS to the requesting tenant. A query like
`categoryRepo.findOne({ where: { id: categoryId } })` without the
tenant filter will let Tenant A create products under Tenant B's
categories. Always pass tenantId through to the CategoryService lookup.

### 2. Eager-Loading Variants in List Endpoints

Loading variants on `GET /api/v1/products` (the paginated list) will
cause severe performance degradation. For a tenant with 500 products
averaging 5 variants each, that is 2,500 extra rows hydrated per page.
Load variants ONLY on the detail endpoint (`findOne`) and the dedicated
variant list endpoint.

### 3. Allowing skuPrefix Changes After Creation

If you allow `skuPrefix` updates, every existing variant's full SKU
becomes inconsistent. Variant SKUs are constructed from the prefix.
Changing the prefix mid-flight creates orphaned SKU patterns that break
search, import/export, and warehouse identification. Block it at the
service level.

### 4. Merging JSONB Attributes Instead of Replacing

When updating `attributes`, the naive approach is to merge: spread the
existing attributes with the new ones. This causes stale keys to persist.
If a variant previously had `{"color": "red", "size": "L"}` and the
client sends `{"color": "blue", "size": "M"}`, the result should be
exactly what the client sent — not `{"color": "blue", "size": "M"}`.
Replace the entire object.

### 5. Not Filtering Variants by Product ID in Queries

A variant query that only filters by `tenant_id` but not `product_id`
would return variants from ALL products. The service must always scope
queries to the specific product in the URL. This is a tenant isolation
pattern applied at the resource level.

### 6. Using repo.delete() Instead of repo.softRemove()

Same rule as M4. Hard deletes on variants break stock level foreign keys.
Always soft-delete.

### 7. Not Using ParseUUIDPipe on Product ID in Variant Controller

If you forget `ParseUUIDPipe` on the `:productId` param in the variant
controller, a non-UUID string like "abc" would reach the service layer,
which would fail with an opaque database error instead of a clean 400.
Always validate UUID format at the controller boundary.

---

## What NOT to Build in M5

- Stock level management — that is M7 (Inventory)
- Product image/media upload — that is M8 (Media Storage)
- Bulk product import — that is M9 (Import/Export)
- Audit logging of mutations — that is M6
- Redis caching of product reads — add after CRUD works
- Product search with pg_trgm — that is M10 (Search)
- SKU auto-generation from prefix — the client provides the full variant
  SKU. Auto-generation from prefix+sequence is an optimization for later.

---

## Next Steps After M5

Once M5 is done, the catalog foundation is solid. The natural progression:

1. **M6 — Audit Logging**: An AuditInterceptor that captures all
   mutating requests (POST/PATCH/DELETE) across Catalog and Category
   modules, storing before/after diffs. This retrofits onto the existing
   controllers without modification.

2. **M7 — Inventory & Warehouse CRUD**: Warehouse CRUD (simpler, no
   hierarchy) and the StockLevel management with optimistic locking.
   WarehouseService follows the exact same pattern as M4's
   CategoryService. StockLevel introduces `@VersionColumn` and the
   retry-on-optimistic-lock pattern from AGENTS.md Section 4.

3. **M8 — Supplier CRUD**: Straightforward CRUD, identical pattern to
   M4. No special complexity.

4. **M9 — Import/Export**: BullMQ-driven CSV ingestion for bulk product
   and variant creation. This builds on M5's ProductService and
   VariantService.

5. **M10 — Search**: pg_trgm fuzzy search across products and categories.
   Builds on M5's Product entity and M4's Category entity.
