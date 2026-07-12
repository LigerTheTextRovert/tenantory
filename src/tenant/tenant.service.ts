import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Tenant, TenantStatus } from './entities/tenant.entity';
import { Repository } from 'typeorm';

@Injectable()
export class TenantService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
  ) {}

  async findById(id: string): Promise<Tenant | null> {
    return this.tenantRepository.findOne({ where: { id } });
  }

  async findByIdAndValidate(id: string): Promise<Tenant> {
    const tenant = await this.findById(id);
    if (!tenant) {
      return null;
    }
    if (tenant.status === TenantStatus.ARCHIVED) {
      return null;
    }
    return tenant;
  }
}
