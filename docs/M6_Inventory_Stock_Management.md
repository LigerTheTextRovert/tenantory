# M6 — Inventory Module: Stock Management

## Overview

This milestone builds the **Inventory Management Engine** for our multi-tenant catalog system. Where M5 introduced the catalog entity chains (Product and ProductVariant), M6 introduces the inventory layer which tracks availability, safety thresholds, and handles volatile concurrent transactions.

Because stock levels are highly volatile (e.g., hundreds of carts checking out the same product variant concurrently), standard CRUD is insufficient. You will implement:
- **Multi-Tenant Row-Level Isolation**: Ensure no tenant can read or write stock levels belonging to another tenant.
- **Optimistic Locking**: Track row state mutations with a `@VersionColumn` to prevent double-allocations (overselling) without blocking database reads.
- **Automatic Jittered Retries**: Capture database transaction locks (`OptimisticLockVersionMismatchError`) at the service layer and transparently retry the transaction using the `retryWithBackoff` utility.

---

## What You Will Build

```
Request → TenantMiddleware → TenantGuard → TenantInterceptor
    │
    └─► InventoryController → InventoryService (Transaction Block + retryWithBackoff)
             │                        │
      @TenantDecorator('id')          ├──► Validates Variant & Warehouse exist for Tenant
      Validates payload via           ├──► Performs Stock Math (available / reserved)
      class-validator DTOs            ├──► Saves StockLevel Entity (Triggers Version check)
                                      └──► Catches Locking Failures & Retries
```

You will build the following endpoints under `/api/v1/inventory`:

```
GET    /api/v1/inventory             → List stock levels (paginated, filterable)
POST   /api/v1/inventory/replenish   → Add stock levels / Initial count
POST   /api/v1/inventory/deduct      → Deduct stock (committed sale or checkout completion)
POST   /api/v1/inventory/reserve     → Reserve stock (checkout session cart lock)
POST   /api/v1/inventory/release     → Release stock reservation (canceled cart / cart timeout)
```

---

## Prerequisites

Before starting, ensure you have:
- Completed M5 (Product & ProductVariant CRUD).
- Verified the `StockLevel` entity exists at `src/inventory/entities/stock-level.entity.ts` and contains the `@VersionColumn()` decorator.
- Verified the `retryWithBackoff` utility exists at `src/common/utils/retry.util.ts` and correctly propagates the original error.

---

## File Structure You Will Create

```
src/
└── inventory/
    ├── inventory.module.ts              # Updated — register controllers, services, and exports
    ├── inventory.controller.ts          # Updated — define HTTP endpoints and swagger metadata
    ├── inventory.service.ts             # Updated — define transactions, retries, and stock arithmetic
    └── dto/
        ├── deduct-stock.dto.ts          # (Already exists) For stock deductions
        ├── replenish-stock.dto.ts       # New — input validation for stock replenishment
        ├── reserve-stock.dto.ts         # New — input validation for stock reservation
        ├── release-stock.dto.ts         # New — input validation for reservation release
        └── stock-query.dto.ts           # New — query parameter validation for list endpoint
```

---

## Step 1: Inventory Module Schema & Entity Check

Open `src/inventory/entities/stock-level.entity.ts` and ensure it matches the database requirements:

- **Row-Level Filtering**: Must have a `tenant_id` column and an explicit FK pointing to the `tenants` table.
- **Unique Constraint**: The combination of `variant` and `warehouse` must be unique (`@Unique(['variant', 'warehouse'])`).
- **Optimistic Locking**: Ensure the `version` column is decorated with `@VersionColumn()` to support TypeORM version tracking.

---

## Step 2: Define Data Transfer Objects (DTOs)

Ensure all incoming payloads are decorated with `class-validator` rules. Whitelist validation is enabled globally, meaning any undeclared fields in requests will be stripped or cause validation failures.

### ReplenishStockDto

Create at `src/inventory/dto/replenish-stock.dto.ts`:
- `warehouseId` (required) — UUID of the target warehouse.
- `variantId` (required) — UUID of the product variant.
- `quantity` (required) — positive integer (`@Min(1)`).

```typescript
import { Type } from 'class-transformer';
import { IsInt, IsUUID, Min } from 'class-validator';

export class ReplenishStockDto {
  @IsUUID()
  warehouseId: string;

  @IsUUID()
  variantId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;
}
```

### ReserveStockDto

Create at `src/inventory/dto/reserve-stock.dto.ts`:
- `warehouseId` (required) — UUID.
- `variantId` (required) — UUID.
- `quantity` (required) — positive integer (`@Min(1)`).
- `referenceId` (optional) — UUID (e.g. order ID, checkout session ID).
- `reason` (optional) — string, max length 255.

```typescript
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';

export class ReserveStockDto {
  @IsUUID()
  warehouseId: string;

  @IsUUID()
  variantId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  @IsUUID()
  @IsOptional()
  referenceId?: string;

  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(255)
  reason?: string;
}
```

### ReleaseStockDto

Create at `src/inventory/dto/release-stock.dto.ts`. The structure matches `ReserveStockDto` exactly:

```typescript
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';

export class ReleaseStockDto {
  @IsUUID()
  warehouseId: string;

  @IsUUID()
  variantId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  @IsUUID()
  @IsOptional()
  referenceId?: string;

  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(255)
  reason?: string;
}
```

### StockQueryDto

Create at `src/inventory/dto/stock-query.dto.ts` for filtering and paginating stock levels:

```typescript
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class StockQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 20;

  @IsUUID()
  @IsOptional()
  warehouseId?: string;

  @IsUUID()
  @IsOptional()
  variantId?: string;

  @IsString()
  @IsOptional()
  sortBy?: string = 'created_at';

  @IsString()
  @IsOptional()
  sortOrder?: 'ASC' | 'DESC' = 'DESC';
}
```

---

## Step 3: Concurrency Strategy & Retry Wrapper

When multiple transactions mutate the same `StockLevel` row simultaneously, TypeORM updates the row and validates that the `version` matches what was read. If another transaction updated the row in the meantime, the version check fails, throwing an `OptimisticLockVersionMismatchError`.

Instead of bubbling this error as a `500 Internal Server Error`, we wrap each database transaction in the `retryWithBackoff` utility.

### Retry Options configuration:
```typescript
private readonly retryOptions = {
  maxAttempts: 5,
  baseDelayMs: 50,
  maxDelayMs: 300,
  retryableErrors: (err: any) => err instanceof OptimisticLockVersionMismatchError,
};
```
If an optimistic locking mismatch is thrown, the handler waits for a jittered exponential backoff and retries the entire transaction block. Because we fetch the entity *inside* the transaction block, the subsequent retry will fetch the updated version, run the business logic checks against it, and attempt to save it again.

---

## Step 4: Implement `InventoryService`

Create at `src/inventory/inventory.service.ts`.

### Service Requirements:
1. **Replenish Stock**:
   - Query if the `ProductVariant` and `Warehouse` exist for the tenant. If not, throw `NotFoundException`.
   - Fetch the `StockLevel` row. If it exists, add the quantity to `availableQuantity`.
   - If it does not exist, create a new `StockLevel` row with the quantity assigned to `availableQuantity`.
   - Wrap the operation in `retryWithBackoff`.
2. **Deduct Stock**:
   - Fetch the `StockLevel` row. If not found, throw `NotFoundException`.
   - Validate `availableQuantity >= quantity`. If insufficient, throw `BadRequestException`.
   - Subtract the quantity from `availableQuantity` and save.
   - Wrap the operation in `retryWithBackoff`.
3. **Reserve Stock**:
   - Fetch the `StockLevel` row. If not found, throw `NotFoundException`.
   - Validate `availableQuantity >= quantity`. If insufficient, throw `BadRequestException`.
   - Decrement `availableQuantity` by quantity, and increment `reservedQuantity` by quantity.
   - Save and wrap in `retryWithBackoff`.
4. **Release Stock**:
   - Fetch the `StockLevel` row. If not found, throw `NotFoundException`.
   - Validate `reservedQuantity >= quantity`. If insufficient, throw `BadRequestException`.
   - Decrement `reservedQuantity` by quantity, and increment `availableQuantity` by quantity.
   - Save and wrap in `retryWithBackoff`.
5. **List / Paginate Stock Levels**:
   - Use `TypeORM` query builder, joining variants and warehouses, filtered by `tenantId`.

```typescript
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, OptimisticLockVersionMismatchError } from 'typeorm';
import { StockLevel } from './entities/stock-level.entity';
import { ProductVariant } from '../catalog/entities/product-variant.entity';
import { Warehouse } from '../warehouse/entities/warehouse.entity';
import { DeductStockDto } from './dto/deduct-stock.dto';
import { ReplenishStockDto } from './dto/replenish-stock.dto';
import { ReserveStockDto } from './dto/reserve-stock.dto';
import { ReleaseStockDto } from './dto/release-stock.dto';
import { StockQueryDto } from './dto/stock-query.dto';
import { PaginatedResponse } from '../common/interfaces/paginated-response.interface';
import { retryWithBackoff } from '../common/utils/retry.util';

@Injectable()
export class InventoryService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  private readonly retryOptions = {
    maxAttempts: 5,
    baseDelayMs: 50,
    maxDelayMs: 300,
    retryableErrors: (err: any) => err instanceof OptimisticLockVersionMismatchError,
  };

  async replenishStock(tenantId: string, dto: ReplenishStockDto): Promise<StockLevel> {
    return retryWithBackoff(async () => {
      return this.dataSource.transaction(async (manager) => {
        const variant = await manager.findOne(ProductVariant, {
          where: { id: dto.variantId, tenantId },
        });
        if (!variant) throw new NotFoundException('Product variant not found');

        const warehouse = await manager.findOne(Warehouse, {
          where: { id: dto.warehouseId, tenantId },
        });
        if (!warehouse) throw new NotFoundException('Warehouse not found');

        let stockLevel = await manager.findOne(StockLevel, {
          where: { variant: { id: dto.variantId }, warehouse: { id: dto.warehouseId }, tenantId },
        });

        if (!stockLevel) {
          stockLevel = manager.create(StockLevel, {
            tenantId,
            tenant: { id: tenantId },
            variant,
            warehouse,
            availableQuantity: dto.quantity,
            reservedQuantity: 0,
          });
        } else {
          stockLevel.availableQuantity += dto.quantity;
        }

        return manager.save(stockLevel);
      });
    }, this.retryOptions);
  }

  async deductStock(tenantId: string, dto: DeductStockDto): Promise<void> {
    await retryWithBackoff(async () => {
      await this.dataSource.transaction(async (manager) => {
        const stockLevel = await manager.findOne(StockLevel, {
          where: { variant: { id: dto.variantId }, warehouse: { id: dto.warehouseId }, tenantId },
        });

        if (!stockLevel) {
          throw new NotFoundException('Stock level record not found');
        }

        if (stockLevel.availableQuantity < dto.quantity) {
          throw new BadRequestException(
            `Insufficient available stock. Requested: ${dto.quantity}, Available: ${stockLevel.availableQuantity}`,
          );
        }

        stockLevel.availableQuantity -= dto.quantity;
        await manager.save(stockLevel);
      });
    }, this.retryOptions);
  }

  async reserveStock(tenantId: string, dto: ReserveStockDto): Promise<void> {
    await retryWithBackoff(async () => {
      await this.dataSource.transaction(async (manager) => {
        const stockLevel = await manager.findOne(StockLevel, {
          where: { variant: { id: dto.variantId }, warehouse: { id: dto.warehouseId }, tenantId },
        });

        if (!stockLevel) {
          throw new NotFoundException('Stock level record not found');
        }

        if (stockLevel.availableQuantity < dto.quantity) {
          throw new BadRequestException('Insufficient stock available for reservation');
        }

        stockLevel.availableQuantity -= dto.quantity;
        stockLevel.reservedQuantity += dto.quantity;
        await manager.save(stockLevel);
      });
    }, this.retryOptions);
  }

  async releaseStock(tenantId: string, dto: ReleaseStockDto): Promise<void> {
    await retryWithBackoff(async () => {
      await this.dataSource.transaction(async (manager) => {
        const stockLevel = await manager.findOne(StockLevel, {
          where: { variant: { id: dto.variantId }, warehouse: { id: dto.warehouseId }, tenantId },
        });

        if (!stockLevel) {
          throw new NotFoundException('Stock level record not found');
        }

        if (stockLevel.reservedQuantity < dto.quantity) {
          throw new BadRequestException(
            `Cannot release more stock than currently reserved. Reserved: ${stockLevel.reservedQuantity}`,
          );
        }

        stockLevel.reservedQuantity -= dto.quantity;
        stockLevel.availableQuantity += dto.quantity;
        await manager.save(stockLevel);
      });
    }, this.retryOptions);
  }

  async findAll(
    tenantId: string,
    query: StockQueryDto,
  ): Promise<PaginatedResponse<StockLevel>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const qb = this.dataSource
      .getRepository(StockLevel)
      .createQueryBuilder('sl')
      .leftJoinAndSelect('sl.variant', 'variant')
      .leftJoinAndSelect('sl.warehouse', 'warehouse')
      .where('sl.tenant_id = :tenantId', { tenantId });

    if (query.warehouseId) {
      qb.andWhere('sl.warehouse_id = :warehouseId', { warehouseId: query.warehouseId });
    }

    if (query.variantId) {
      qb.andWhere('sl.variant_id = :variantId', { variantId: query.variantId });
    }

    const sortColumns: Record<string, string> = {
      available_quantity: 'sl.available_quantity',
      reserved_quantity: 'sl.reserved_quantity',
      created_at: 'sl.created_at',
      updated_at: 'sl.updated_at',
    };

    const sortBy = sortColumns[query.sortBy ?? 'created_at'] || 'sl.created_at';
    const sortOrder = query.sortOrder ?? 'DESC';
    qb.orderBy(sortBy, sortOrder);

    const [data, totalItems] = await qb
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    const totalPages = Math.ceil(totalItems / limit) || 1;

    return {
      data,
      meta: {
        totalItems,
        itemCount: data.length,
        itemsPerPage: limit,
        totalPages,
        currentPage: page,
      },
      links: {
        first: `/api/v1/inventory?page=1&limit=${limit}`,
        previous: page > 1 ? `/api/v1/inventory?page=${page - 1}&limit=${limit}` : null,
        next: page < totalPages ? `/api/v1/inventory?page=${page + 1}&limit=${limit}` : null,
        last: `/api/v1/inventory?page=${totalPages}&limit=${limit}`,
      },
    };
  }
}
```

---

## Step 5: Implement `InventoryController`

Create at `src/inventory/inventory.controller.ts`.

Ensure endpoints are fully decorated with Swagger UI components for API self-documentation. Extract tenant references at the controller boundaries using `@TenantDecorator('id')`.

```typescript
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity } from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { DeductStockDto } from './dto/deduct-stock.dto';
import { ReplenishStockDto } from './dto/replenish-stock.dto';
import { ReserveStockDto } from './dto/reserve-stock.dto';
import { ReleaseStockDto } from './dto/release-stock.dto';
import { StockQueryDto } from './dto/stock-query.dto';
import { TenantDecorator } from '../common/decorators/tenant.decorator';

@ApiTags('Inventory')
@ApiSecurity('X-Tenant-Id')
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @ApiOperation({
    summary: 'List stock levels',
    description: 'Returns a paginated list of stock levels for the current tenant.',
  })
  @ApiResponse({ status: 200, description: 'Paginated inventory levels returned.' })
  findAll(
    @TenantDecorator('id') tenantId: string,
    @Query() query: StockQueryDto,
  ) {
    return this.inventoryService.findAll(tenantId, query);
  }

  @Post('replenish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Replenish stock',
    description: 'Increases available stock for a product variant in a warehouse.',
  })
  @ApiResponse({ status: 200, description: 'Stock levels updated.' })
  replenish(
    @TenantDecorator('id') tenantId: string,
    @Body() dto: ReplenishStockDto,
  ) {
    return this.inventoryService.replenishStock(tenantId, dto);
  }

  @Post('deduct')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Deduct stock',
    description: 'Deducts available stock physically (e.g. direct sale or checkout completion).',
  })
  @ApiResponse({ status: 200, description: 'Stock successfully deducted.' })
  @ApiResponse({ status: 400, description: 'Insufficient stock or invalid input.' })
  deduct(
    @TenantDecorator('id') tenantId: string,
    @Body() dto: DeductStockDto,
  ) {
    return this.inventoryService.deductStock(tenantId, dto);
  }

  @Post('reserve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reserve stock',
    description: 'Moves stock from available to reserved to lock it during a cart checkout.',
  })
  @ApiResponse({ status: 200, description: 'Stock successfully reserved.' })
  @ApiResponse({ status: 400, description: 'Insufficient stock available.' })
  reserve(
    @TenantDecorator('id') tenantId: string,
    @Body() dto: ReserveStockDto,
  ) {
    return this.inventoryService.reserveStock(tenantId, dto);
  }

  @Post('release')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Release stock reservation',
    description: 'Moves stock from reserved back to available (e.g., cart expired or canceled).',
  })
  @ApiResponse({ status: 200, description: 'Reserved stock successfully released.' })
  release(
    @TenantDecorator('id') tenantId: string,
    @Body() dto: ReleaseStockDto,
  ) {
    return this.inventoryService.releaseStock(tenantId, dto);
  }
}
```

---

## Step 6: Verify and Wire the Module

Verify your wiring in `src/inventory/inventory.module.ts`:
- Make sure `InventoryController` is registered in `controllers`.
- Make sure `InventoryService` is registered in `providers`.
- Ensure `TypeOrmModule.forFeature([StockLevel])` is in `imports`.

Finally, run the build and validation scripts to guarantee compliance:
```bash
pnpm build
pnpm lint
```
