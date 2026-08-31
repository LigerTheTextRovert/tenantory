import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateTenantDto } from '../dto/create-tenant.dto';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Tenant, TenantStatus } from '../../tenant/entities/tenant.entity';
import { TenantSetting } from '../entities/tenant-setting.entity';
import { DataSource, IsNull, Repository } from 'typeorm';
import { isUniqueViolation } from '../../common/utils/assert-unique.util';
import { User } from '../../auth/entities/user.entity';
import { UserRole } from '../../auth/enum/user-role.enum';
import * as bcrypt from 'bcryptjs';
import { AuditService } from '../../audit/audit.service';
import { AuditAction } from '../../audit/enums/audit-action.enum';
import { AuditedEntityType } from '../../audit/enums/audited-entity-type';

@Injectable()
export class TenantProvisioningService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    private readonly auditService: AuditService,
  ) {}

  async createTenant(dto: CreateTenantDto): Promise<Tenant> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const existingTenant = await queryRunner.manager.findOne(Tenant, {
        where: { domainName: dto.domainName },
      });

      if (existingTenant) {
        throw new BadRequestException(
          'A tenant with this domain already exists.',
        );
      }

      const tenant = queryRunner.manager.create(Tenant, {
        status: TenantStatus.ACTIVE,
        domainName: dto.domainName,
        businessName: dto.businessName,
      });

      const savedTenant = await queryRunner.manager.save(tenant);

      const existingUser = await queryRunner.manager.findOne(User, {
        where: { email: dto.adminEmail, tenantId: savedTenant.id },
      });

      if (existingUser) {
        throw new BadRequestException(
          'A user with this email already exists in this tenant.',
        );
      }

      const passwordHash = await bcrypt.hash(dto.adminPassword, 12);

      const adminUser = queryRunner.manager.create(User, {
        tenantId: savedTenant.id,
        email: dto.adminEmail,
        firstName: dto.adminFirstName,
        lastName: dto.adminLastName,
        passwordHash,
        role: UserRole.TENANT_ADMIN,
        isActive: true,
      });

      await queryRunner.manager.save(adminUser);

      const tenantSetting = queryRunner.manager.create(TenantSetting, {
        tenantId: savedTenant.id,
        config: {
          currency: 'USD',
          theme: 'light',
        },
      });

      await queryRunner.manager.save(tenantSetting);

      await queryRunner.commitTransaction();

      // Emitted only after a successful commit — a rolled-back provisioning
      // must never leave an audit trail of a tenant that does not exist.
      this.auditService.record({
        action: AuditAction.CREATE,
        entityType: AuditedEntityType.TENANT,
        entityId: savedTenant.id,
        newValues: {
          domainName: savedTenant.domainName,
          businessName: savedTenant.businessName,
          status: savedTenant.status,
          adminUserId: adminUser.id,
        },
      });

      return savedTenant;
    } catch (error: unknown) {
      await queryRunner.rollbackTransaction();
      if (error instanceof BadRequestException) {
        throw error;
      }
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'A record with unique identifiers already exists.',
        );
      }
      throw new InternalServerErrorException(
        'An error occurred during tenant provisioning.',
      );
    } finally {
      await queryRunner.release();
    }
  }

  async updateTenantStatus(
    tenantId: string,
    newStatus: TenantStatus,
  ): Promise<Tenant> {
    const tenant = await this.tenantRepo.findOne({
      where: { id: tenantId, deletedAt: IsNull() },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const oldStatus = tenant.status;
    tenant.status = newStatus;

    try {
      const saved = await this.tenantRepo.save(tenant);
      this.auditService.record({
        action: AuditAction.UPDATE,
        entityType: AuditedEntityType.TENANT,
        entityId: saved.id,
        oldValues: { status: oldStatus },
        newValues: { status: saved.status },
      });
      return saved;
    } catch {
      throw new InternalServerErrorException('Failed to update tenant status');
    }
  }
}
