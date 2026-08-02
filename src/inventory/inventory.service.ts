import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { StockLevel } from './entities/stock-level.entity';
import {
  DataSource,
  IsNull,
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
import { async } from 'rxjs';

@Injectable()
export class InventoryService {
  constructor(
    @InjectDataSource()
    private dataSource: DataSource,
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
    return retryWithBackoff(async () => {
      return this.dataSource.transaction(async (manager) => {
        const stockLevelRepo = manager.getRepository(StockLevel);
        // const variantRepo = manager.getRepository(ProductVariant);

        const [variant, warehouse] = await Promise.all([
          this.variantService.findOneById(tenantId, dto.variantId),
          this.warehouseService.findOne(tenantId, dto.warehouseId),
        ]);

        const stockLevel = await stockLevelRepo.findOne({
          where: { tenantId, variant, warehouse },
        });

        if (!stockLevel) {
          throw new NotFoundException('There is no stock level with this info');
        }

        if (stockLevel.availableQuantity < dto.quantity) {
          throw new BadRequestException('insufficient stock quantity');
        }

        stockLevel.availableQuantity -= dto.quantity;
        stockLevel.reservedQuantity += dto.quantity;
      });
    }, this.retryOptions);
  }

  async findAll(
    tenantId: string,
    query: StockQueryDto,
  ): Promise<PaginatedResponse<StockLevel>> {
    const qb = this.inventoryRepo
      .createQueryBuilder('q')
      .where('q.tenant_id = :tenantId', { tenantId });

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

    const sortColumns: Record<string, string> = {
      created_at: 'q.created_at',
    };

    qb.orderBy(sortColumns[query.sortBy], query.sortOrder);

    const [data, counts] = await qb.getManyAndCount();
    const meta: PaginationMeta = {
      totalItems: counts,
      itemCount: data.length,
      totalPages: Math.ceil(counts / query.limit),
      itemsPerPage: query.limit,
      currentPage: query.page,
    };

    const links: PaginationLinks = {
      last: this.createLink(meta.totalPages, query.limit),
      first: this.createLink(1, query.limit),
      previous:
        query.page > 1 ? this.createLink(query.page - 1, query.limit) : null,
      next:
        query.page < meta.totalPages
          ? this.createLink(query.page + 1, query.limit)
          : null,
    };

    const paginationResult: PaginatedResponse<StockLevel> = {
      data,
      meta,
      links,
    };

    return paginationResult;
  }

  async findOrCreate(
    tenantId: string,
    warehouse: Warehouse,
    variant: ProductVariant,
  ): Promise<StockLevel> {
    const stock = await this.inventoryRepo.findOne({
      where: {
        tenantId,
        warehouse,
        variant,
      },
    });

    if (!stock) {
      return this.inventoryRepo.create({
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
    return retryWithBackoff(async () => {
      return this.dataSource.transaction(async () => {
        // warehouseId and tenantId validation
        const [warehouse, variant] = await Promise.all([
          this.warehouseService.findOne(tenantId, dto.warehouseId),
          this.variantService.findOneById(tenantId, dto.variantId),
        ]);

        const stock = await this.findOrCreate(tenantId, warehouse, variant);

        stock.availableQuantity += dto.quantity;

        await this.inventoryRepo.save(stock);
        return stock;
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
    return `app/v1/invetory?page=${page}&limit=${limit}`;
  }
}
