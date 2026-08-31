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
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { AuditedEntityType } from '../audit/enums/audited-entity-type';

@Injectable()
export class WarehouseService {
  constructor(
    @InjectRepository(Warehouse)
    private readonly warehouseRepo: Repository<Warehouse>,
    private readonly auditService: AuditService,
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
      const saved = await this.warehouseRepo.save(warehouse);
      this.auditService.record({
        action: AuditAction.CREATE,
        entityType: AuditedEntityType.WAREHOUSE,
        entityId: saved.id,
        newValues: {
          name: saved.name,
          location: saved.location ?? null,
        },
      });
      return saved;
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
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

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

    qb.orderBy(sortColumns[query.sortBy as string], query.sortOrder);

    const [data, totalItems] = await qb
      .skip(skip)
      .take(query.limit)
      .getManyAndCount();

    const totalPages = Math.ceil(totalItems / limit) || 1;

    const buildLink = (page: number): string =>
      `/api/v1/warehouses?page=${page}&limit=${query.limit}`;

    const meta: PaginationMeta = {
      totalItems,
      itemCount: data.length,
      itemsPerPage: limit,
      totalPages,
      currentPage: page,
    };

    const links: PaginationLinks = {
      first: buildLink(1),
      previous: page > 1 ? buildLink(page - 1) : null,
      next: page < totalPages ? buildLink(page + 1) : null,
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
      throw new NotFoundException(
        `Warehouse with ID "${id}" not found for tenant ${tenantId}`,
      );
    }

    return warehouse;
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateWarehouseDto,
  ): Promise<Warehouse> {
    const warehouse = await this.findOne(tenantId, id);
    const oldValues = {
      name: warehouse.name,
      location: warehouse.location ?? null,
    };

    if (dto.name) {
      await this.assertNameUnique(tenantId, dto.name, id);
      warehouse.name = dto.name;
    }

    if (dto.location !== undefined) {
      warehouse.location = dto.location;
    }

    try {
      const saved = await this.warehouseRepo.save(warehouse);
      this.auditService.record({
        action: AuditAction.UPDATE,
        entityType: AuditedEntityType.WAREHOUSE,
        entityId: saved.id,
        oldValues,
        newValues: {
          name: saved.name,
          location: saved.location ?? null,
        },
      });
      return saved;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'A warehouse with this name already exists for this tenant',
        );
      }
      throw error;
    }
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const warehouse = await this.findOne(tenantId, id);
    await this.warehouseRepo.softRemove(warehouse);
    this.auditService.record({
      action: AuditAction.DELETE,
      entityType: AuditedEntityType.WAREHOUSE,
      entityId: warehouse.id,
      oldValues: {
        name: warehouse.name,
        location: warehouse.location ?? null,
      },
    });
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
