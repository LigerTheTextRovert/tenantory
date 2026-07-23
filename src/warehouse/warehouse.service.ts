import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Warehouse } from './entities/warehouse.entity';
import { IsNull, Repository } from 'typeorm';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { WarehouseQueryDto } from './dto/warehouse-query.dto';
import {
  PaginatedResponse,
  PaginationLinks,
  PaginationMeta,
} from '../common/interfaces/paginated-response.interface';
import { isUniqueViolation } from '../common/utils/assert-unique.util';

@Injectable()
export class WarehouseService {
  constructor(
    @InjectRepository(Warehouse)
    private readonly warehouseRepo: Repository<Warehouse>,
  ) {}

  async create(tenantId: string, dto: CreateWarehouseDto): Promise<Warehouse> {
    await this.assertNameUnique(tenantId, dto.name);

    const warehouse = this.warehouseRepo.create({
      name: dto.name,
      location: dto.location,
      tenantId,
      tenant: { id: tenantId },
    });

    try {
      return await this.warehouseRepo.save(warehouse);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'A warehouse with this name already exists for this tenant',
        );
      }
      throw error;
    }
  }

  async findAll(
    tenantId: string,
    query: WarehouseQueryDto,
  ): Promise<PaginatedResponse<Warehouse>> {
    const skip = (query.page - 1) * query.limit;

    const qb = this.warehouseRepo
      .createQueryBuilder('w')
      .where('w.tenant_id = :tenantId', { tenantId })
      .andWhere('w.deleted_at IS NULL');

    if (query.search) {
      qb.andWhere('w.name ILIKE :search', { search: `%${query.search}%` });
    }

    const sortColumns: Record<string, string> = {
      name: 'w.name',
      created_at: 'w.created_at',
      updated_at: 'w.updated_at',
    };

    qb.orderBy(sortColumns[query.sortBy], query.sortOrder);

    const [data, totalItems] = await qb
      .skip(skip)
      .take(query.limit)
      .getManyAndCount();

    const totalPages = Math.ceil(totalItems / query.limit) || 1;

    const buildLink = (page: number): string =>
      `/api/v1/warehouses?page=${page}&limit=${query.limit}`;

    const meta: PaginationMeta = {
      totalItems,
      itemCount: data.length,
      itemsPerPage: query.limit,
      totalPages,
      currentPage: query.page,
    };

    const links: PaginationLinks = {
      first: buildLink(1),
      previous: query.page > 1 ? buildLink(query.page - 1) : null,
      next: query.page < totalPages ? buildLink(query.page + 1) : null,
      last: buildLink(totalPages),
    };

    return { data, meta, links };
  }

  async findOne(tenantId: string, id: string): Promise<Warehouse> {
    const warehouse = await this.warehouseRepo.findOne({
      where: {
        tenantId,
        id,
        deletedAt: IsNull(),
      },
    });

    if (!warehouse) {
      throw new NotFoundException(`There is no warehouse by this ID:${id}`);
    }

    return warehouse;
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateWarehouseDto,
  ): Promise<Warehouse> {
    const warehouse = await this.findOne(tenantId, id);

    if (dto.name) {
      await this.assertNameUnique(tenantId, dto.name, id);
      warehouse.name = dto.name;
    }

    if (dto.location) {
      warehouse.location = dto.location;
    }

    try {
      await this.warehouseRepo.save(warehouse);
      return warehouse;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('There is a warehouse with this info');
      }
      throw error;
    }
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const warehouse = await this.findOne(tenantId, id);
    await this.warehouseRepo.softRemove(warehouse);
  }

  private async assertNameUnique(
    tenantId: string,
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const qb = this.warehouseRepo
      .createQueryBuilder('w')
      .where('w.tenant_id = :tenantId', { tenantId })
      .andWhere('w.name = :name', { name })
      .andWhere('w.deleted_at IS NULL');

    if (excludeId) {
      qb.andWhere('w.id != :excludeId', { excludeId });
    }

    const exists = await qb.getExists();
    if (exists) {
      throw new ConflictException(
        'A warehouse with this name already exists for this tenant',
      );
    }
  }
}
