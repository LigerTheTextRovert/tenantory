import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Tenant, TenantStatus } from './entities/tenant.entity';
import { Repository } from 'typeorm';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { isUniqueViolation } from '../common/utils/assert-unique.util';

@Injectable()
export class TenantService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
  ) {}

  async findAll(): Promise<Tenant[]> {
    return this.tenantRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async findById(id: string): Promise<Tenant | null> {
    return this.tenantRepository.findOne({ where: { id } });
  }

  async findOne(id: string): Promise<Tenant> {
    const tenant = await this.tenantRepository.findOne({ where: { id } });

    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${id} not found`);
    }

    return tenant;
  }

  async findByIdAndValidate(id: string): Promise<Tenant | null> {
    const tenant = await this.findById(id);

    if (!tenant) {
      return null;
    }

    if (tenant.status === TenantStatus.ARCHIVED) {
      return null;
    }

    return tenant;
  }

  async create(dto: CreateTenantDto): Promise<Tenant> {
    const tenant = this.tenantRepository.create({
      domainName: dto.domainName,
      businessName: dto.businessName,
      status: dto.status,
    });

    try {
      return await this.tenantRepository.save(tenant);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          `A tenant with domain name "${dto.domainName}" already exists`,
        );
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateTenantDto): Promise<Tenant> {
    const tenant = await this.findOne(id);

    if (dto.domainName !== undefined) {
      tenant.domainName = dto.domainName;
    }

    if (dto.businessName !== undefined) {
      tenant.businessName = dto.businessName;
    }

    if (dto.status !== undefined) {
      tenant.status = dto.status;
    }

    try {
      return await this.tenantRepository.save(tenant);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          `A tenant with domain name "${dto.domainName}" already exists`,
        );
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    const tenant = await this.findOne(id);
    await this.tenantRepository.softRemove(tenant);
  }
}
