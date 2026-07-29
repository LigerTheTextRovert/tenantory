import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { StockLevel } from './entities/stock-level.entity';
import { DataSource, Repository } from 'typeorm';
import { StockQueryDto } from './dto/stock-query.dto';
import {
  PaginatedResponse,
  PaginationLinks,
  PaginationMeta,
} from '../common/interfaces/paginated-response.interface';

@Injectable()
export class InventoryService {
  constructor(
    @InjectDataSource()
    private dataSource: DataSource,
    @InjectRepository(StockLevel)
    private readonly inventoryRepo: Repository<StockLevel>,
  ) {}

  // async deductStock(
  //   tenantId: string,
  //   deductStockDto: DeductStockDto,
  // ): Promise<void> {
  //   return this.dataSource.transaction(async (manager) => {
  //     const stockLevelRepo = manager.getRepository(StockLevel);
  //     const variantRepo = manager.getRepository(ProductVariant);
  //   });
  // }

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

  private createLink(page: number, limit: number) {
    return `app/v1/invetory?page=${page}&limit=${limit}`;
  }
}
