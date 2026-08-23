import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { StockLevel } from './entities/stock-level.entity';
import {
  DataSource,
  EntityManager,
  OptimisticLockVersionMismatchError,
  Repository,
} from 'typeorm';
import { StockQueryDto } from './dto/stock-query.dto';
import {
  PaginatedResponse,
  PaginationLinks,
  PaginationMeta,
} from '../common/interfaces/paginated-response.interface';
import { ReplenishStockDto } from './dto/replenish-stock.dto';
import { VariantService } from '../catalog/variant/variant.service';
import { WarehouseService } from '../warehouse/warehouse.service';
import { Warehouse } from '../warehouse/entities/warehouse.entity';
import { ProductVariant } from '../catalog/entities/product-variant.entity';
import { DeductStockDto } from './dto/deduct-stock.dto';
import { RetryOptions, retryWithBackoff } from '../common/utils/retry.util';
import { ReleaseStockDto } from './dto/release-stock.dto';
import { ReserveStockDto } from './dto/reserve-stock.dto';

@Injectable()
export class InventoryService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(StockLevel)
    private readonly inventoryRepo: Repository<StockLevel>,
    private readonly variantService: VariantService,
    private readonly warehouseService: WarehouseService,
  ) {}

  private readonly retryOptions: RetryOptions = {
    maxAttempts: 5,
    baseDelayMs: 50,
    maxDelayMs: 300,
    retryableErrors: (err: any) =>
      err instanceof OptimisticLockVersionMismatchError,
  };

  async deductStock(tenantId: string, dto: DeductStockDto): Promise<void> {
    // Validate variant and warehouse outside of the transaction to keep lock times low
    const [variant, warehouse] = await Promise.all([
      this.variantService.findOneById(tenantId, dto.variantId),
      this.warehouseService.findOne(tenantId, dto.warehouseId),
    ]);

    await retryWithBackoff(async () => {
      await this.dataSource.transaction(async (manager) => {
        const stockLevelRepo = manager.getRepository(StockLevel);

        const stockLevel = await stockLevelRepo.findOne({
          where: {
            tenantId,
            variant: { id: variant.id },
            warehouse: { id: warehouse.id },
          },
        });

        if (!stockLevel) {
          throw new NotFoundException('There is no stock level with this info');
        }

        if (stockLevel.availableQuantity < dto.quantity) {
          throw new BadRequestException('insufficient stock quantity');
        }

        stockLevel.availableQuantity -= dto.quantity;

        // Persist change back to DB
        await manager.save(stockLevel);
      });
    }, this.retryOptions);
  }

  async findAll(
    tenantId: string,
    query: StockQueryDto,
  ): Promise<PaginatedResponse<StockLevel>> {
    const qb = this.inventoryRepo
      .createQueryBuilder('q')
      .where('q.tenantId = :tenantId', { tenantId });

    if (query.variantId) {
      qb.leftJoinAndSelect('q.variant', 'variant').andWhere(
        'variant.id = :variantId',
        { variantId: query.variantId },
      );
    }

    if (query.warehouseId) {
      qb.leftJoinAndSelect('q.warehouse', 'warehouse').andWhere(
        'warehouse.id = :warehouseId',
        { warehouseId: query.warehouseId },
      );
    }

    qb.orderBy(query.sortBy as string, query.sortOrder);

    // Apply pagination
    const limit = query.limit || 20;
    const page = query.page || 1;
    qb.take(limit).skip((page - 1) * limit);

    const [data, counts] = await qb.getManyAndCount();
    const meta: PaginationMeta = {
      totalItems: counts,
      itemCount: data.length,
      totalPages: Math.ceil(counts / limit),
      itemsPerPage: limit,
      currentPage: page,
    };

    const links: PaginationLinks = {
      last: this.createLink(meta.totalPages, limit),
      first: this.createLink(1, limit),
      previous: page > 1 ? this.createLink(page - 1, limit) : null,
      next: page < meta.totalPages ? this.createLink(page + 1, limit) : null,
    };

    return {
      data,
      meta,
      links,
    };
  }

  async findOrCreate(
    tenantId: string,
    warehouse: Warehouse,
    variant: ProductVariant,
    manager?: EntityManager,
  ): Promise<StockLevel> {
    const repo = manager
      ? manager.getRepository(StockLevel)
      : this.inventoryRepo;

    const stock = await repo.findOne({
      where: {
        tenantId,
        warehouse: { id: warehouse.id },
        variant: { id: variant.id },
      },
    });

    if (!stock) {
      return repo.create({
        tenantId,
        warehouse,
        variant,
        availableQuantity: 0,
        reservedQuantity: 0,
        safetyThreshold: 20,
      });
    }

    return stock;
  }

  async replenish(
    tenantId: string,
    dto: ReplenishStockDto,
  ): Promise<StockLevel> {
    // Validate outside transaction
    const [warehouse, variant] = await Promise.all([
      this.warehouseService.findOne(tenantId, dto.warehouseId),
      this.variantService.findOneById(tenantId, dto.variantId),
    ]);

    return retryWithBackoff(async () => {
      return this.dataSource.transaction(async (manager) => {
        const stock = await this.findOrCreate(
          tenantId,
          warehouse,
          variant,
          manager,
        );

        stock.availableQuantity += dto.quantity;

        // Use manager.save to execute within the active transaction
        return manager.save(stock);
      });
    }, this.retryOptions);
  }

  async reserveStock(tenantId: string, dto: ReserveStockDto): Promise<void> {
    return retryWithBackoff(async () => {
      return this.dataSource.transaction(async (manager) => {
        const stockLevel = await manager.findOne(StockLevel, {
          where: {
            tenantId,
            variant: { id: dto.variantId },
            warehouse: { id: dto.warehouseId },
          },
        });

        if (!stockLevel) {
          throw new NotFoundException('There is no stock level with this info');
        }

        if (stockLevel.availableQuantity < dto.quantity) {
          throw new BadRequestException(
            'Insufficient stock available for reservation',
          );
        }

        stockLevel.availableQuantity -= dto.quantity;
        stockLevel.reservedQuantity += dto.quantity;
        await manager.save(stockLevel);
      });
    }, this.retryOptions);
  }

  async releaseStock(tenantId: string, dto: ReleaseStockDto): Promise<void> {
    return retryWithBackoff(async () => {
      return this.dataSource.transaction(async (manager) => {
        const stockLevel = await manager.findOne(StockLevel, {
          where: {
            variant: { id: dto.variantId },
            warehouse: { id: dto.warehouseId },
            tenantId,
          },
        });

        if (!stockLevel) {
          throw new NotFoundException('Stock level record not found');
        }

        if (stockLevel.reservedQuantity < dto.quantity) {
          throw new BadRequestException(
            `Cannot release more stock than currently reserved. Reserved: ${stockLevel.reservedQuantity}`,
          );
        }

        stockLevel.availableQuantity += dto.quantity;
        stockLevel.reservedQuantity -= dto.quantity;

        await manager.save(stockLevel);
      });
    }, this.retryOptions);
  }

  private createLink(page: number, limit: number) {
    return `app/v1/inventory?page=${page}&limit=${limit}`;
  }
}
