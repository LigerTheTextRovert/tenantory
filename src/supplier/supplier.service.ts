import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Supplier } from './entities/supplier.entity';
import { IsNull, Repository } from 'typeorm';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { SupplierQueryDto } from './dto/supplier-query.dto';
import {
  PaginatedResponse,
  PaginationLinks,
  PaginationMeta,
} from '../common/interfaces/paginated-response.interface';
import { isUniqueViolation } from '../common/utils/assert-unique.util';

@Injectable()
export class SupplierService {
  constructor(
    @InjectRepository(Supplier)
    private readonly supplierRepo: Repository<Supplier>,
  ) {}

  async create(tenantId: string, dto: CreateSupplierDto): Promise<Supplier> {
    await this.assertCompanyNameUnique(tenantId, dto.companyName);

    const supplier = this.supplierRepo.create({
      companyName: dto.companyName,
      contactEmail: dto.contactEmail,
      contactPhone: dto.contactPhone,
      address: dto.address,
      leadTimeDays: dto.leadTimeDays,
      tenantId,
      tenant: { id: tenantId },
    });

    try {
      return await this.supplierRepo.save(supplier);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'A supplier with this company name already exists for this tenant',
        );
      }
      throw error;
    }
  }

  async findAll(
    tenantId: string,
    query: SupplierQueryDto,
  ): Promise<PaginatedResponse<Supplier>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const qb = this.supplierRepo
      .createQueryBuilder('s')
      .where('s.tenant_id = :tenantId', { tenantId })
      .andWhere('s.deleted_at IS NULL');

    if (query.search) {
      qb.andWhere('s.company_name ILIKE :search', {
        search: `%${query.search}%`,
      });
    }

    const sortColumns: Record<string, string> = {
      company_name: 's.company_name',
      lead_time_days: 's.lead_time_days',
      created_at: 's.created_at',
      updated_at: 's.updated_at',
    };

    qb.orderBy(sortColumns[query.sortBy as string], query.sortOrder);

    const [data, totalItems] = await qb
      .skip(skip)
      .take(query.limit)
      .getManyAndCount();

    const totalPages = Math.ceil(totalItems / limit) || 1;

    const buildLink = (page: number): string =>
      `/api/v1/suppliers?page=${page}&limit=${limit}`;

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

  async findOne(tenantId: string, id: string): Promise<Supplier> {
    const supplier = await this.supplierRepo.findOne({
      where: {
        tenantId,
        id,
        deletedAt: IsNull(),
      },
    });

    if (!supplier) {
      throw new NotFoundException(
        `Supplier with ID "${id}" not found for tenant ${tenantId}`,
      );
    }

    return supplier;
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateSupplierDto,
  ): Promise<Supplier> {
    const supplier = await this.findOne(tenantId, id);

    if (dto.companyName) {
      await this.assertCompanyNameUnique(tenantId, dto.companyName, id);
      supplier.companyName = dto.companyName;
    }

    if (dto.contactEmail !== undefined) {
      supplier.contactEmail = dto.contactEmail;
    }

    if (dto.contactPhone !== undefined) {
      supplier.contactPhone = dto.contactPhone;
    }

    if (dto.address !== undefined) {
      supplier.address = dto.address;
    }

    if (dto.leadTimeDays !== undefined) {
      supplier.leadTimeDays = dto.leadTimeDays;
    }

    try {
      return await this.supplierRepo.save(supplier);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'A supplier with this company name already exists for this tenant',
        );
      }
      throw error;
    }
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const supplier = await this.findOne(tenantId, id);
    await this.supplierRepo.softRemove(supplier);
  }

  private async assertCompanyNameUnique(
    tenantId: string,
    companyName: string,
    excludeId?: string,
  ): Promise<void> {
    const qb = this.supplierRepo
      .createQueryBuilder('s')
      .where('s.tenant_id = :tenantId', { tenantId })
      .andWhere('s.company_name = :companyName', { companyName })
      .andWhere('s.deleted_at IS NULL');

    if (excludeId) {
      qb.andWhere('s.id != :excludeId', { excludeId });
    }

    const exists = await qb.getExists();
    if (exists) {
      throw new ConflictException(
        'A supplier with this company name already exists for this tenant',
      );
    }
  }
}
