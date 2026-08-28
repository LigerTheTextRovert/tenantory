import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import * as bcrypt from 'bcryptjs';

import { TenantProvisioningService } from './tenant-provisioning.service';
import { Tenant, TenantStatus } from '../../tenant/entities/tenant.entity';
import { TenantSetting } from '../entities/tenant-setting.entity';
import { User } from '../../auth/entities/user.entity';
import { UserRole } from '../../auth/enum/user-role.enum';

jest.mock('bcryptjs');

describe('TenantProvisioningService', () => {
  let service: TenantProvisioningService;
  let tenantRepo: {
    findOne: jest.Mock;
    save: jest.Mock;
  };
  let dataSource: {
    createQueryRunner: jest.Mock;
  };
  let queryRunner: {
    connect: jest.Mock;
    startTransaction: jest.Mock;
    commitTransaction: jest.Mock;
    rollbackTransaction: jest.Mock;
    release: jest.Mock;
    manager: {
      findOne: jest.Mock;
      create: jest.Mock;
      save: jest.Mock;
    };
  };

  const TENANT_ID = 't1234567-e5f6-7890-abcd-ef1234567890';
  const DOMAIN_NAME = 'acme.tenantory.com';

  beforeEach(async () => {
    tenantRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
    };

    queryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      manager: {
        findOne: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
      },
    };

    dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(queryRunner),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantProvisioningService,
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(Tenant), useValue: tenantRepo },
      ],
    }).compile();

    service = module.get<TenantProvisioningService>(TenantProvisioningService);
    jest.clearAllMocks();
  });

  describe('createTenant', () => {
    const dto = {
      domainName: DOMAIN_NAME,
      businessName: 'Acme Corp',
      adminEmail: 'admin@acme.com',
      adminPassword: 'securepassword',
      adminFirstName: 'John',
      adminLastName: 'Doe',
    };

    it('should provision tenant, admin user, and settings successfully', async () => {
      // 1. Tenant search returns null (tenant domain available)
      queryRunner.manager.findOne.mockResolvedValueOnce(null);

      const mockTenant = { id: TENANT_ID, domainName: DOMAIN_NAME } as Tenant;
      queryRunner.manager.create.mockReturnValueOnce(mockTenant);
      queryRunner.manager.save.mockResolvedValueOnce(mockTenant);

      // 2. User search returns null (admin email available)
      queryRunner.manager.findOne.mockResolvedValueOnce(null);

      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_admin_password');

      const mockUser = { id: 'u1' } as User;
      const mockSettings = { id: 's1' } as TenantSetting;
      queryRunner.manager.create
        .mockReturnValueOnce(mockUser) // admin user
        .mockReturnValueOnce(mockSettings); // tenant settings

      queryRunner.manager.save
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce(mockSettings);

      const result = await service.createTenant(dto);

      expect(queryRunner.connect).toHaveBeenCalled();
      expect(queryRunner.startTransaction).toHaveBeenCalled();
      expect(queryRunner.manager.findOne).toHaveBeenNthCalledWith(1, Tenant, {
        where: { domainName: DOMAIN_NAME },
      });
      expect(queryRunner.manager.create).toHaveBeenNthCalledWith(1, Tenant, {
        status: TenantStatus.ACTIVE,
        domainName: DOMAIN_NAME,
        businessName: 'Acme Corp',
      });
      expect(queryRunner.manager.save).toHaveBeenNthCalledWith(1, mockTenant);
      expect(queryRunner.manager.findOne).toHaveBeenNthCalledWith(2, User, {
        where: { email: dto.adminEmail, tenantId: TENANT_ID },
      });
      expect(bcrypt.hash).toHaveBeenCalledWith(dto.adminPassword, 12);
      expect(queryRunner.manager.create).toHaveBeenNthCalledWith(2, User, {
        tenantId: TENANT_ID,
        email: dto.adminEmail,
        firstName: dto.adminFirstName,
        lastName: dto.adminLastName,
        passwordHash: 'hashed_admin_password',
        role: UserRole.TENANT_ADMIN,
        isActive: true,
      });
      expect(queryRunner.manager.save).toHaveBeenNthCalledWith(2, mockUser);
      expect(queryRunner.manager.create).toHaveBeenNthCalledWith(
        3,
        TenantSetting,
        {
          tenantId: TENANT_ID,
          config: { currency: 'USD', theme: 'light' },
        },
      );
      expect(queryRunner.manager.save).toHaveBeenNthCalledWith(3, mockSettings);
      expect(queryRunner.commitTransaction).toHaveBeenCalled();
      expect(queryRunner.release).toHaveBeenCalled();
      expect(result).toBe(mockTenant);
    });

    it('should throw BadRequestException if tenant domain already exists', async () => {
      queryRunner.manager.findOne.mockResolvedValueOnce({
        id: 'existing-tenant',
      });

      await expect(service.createTenant(dto)).rejects.toThrow(
        new BadRequestException('A tenant with this domain already exists.'),
      );

      expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(queryRunner.release).toHaveBeenCalled();
    });

    it('should throw BadRequestException if admin user email already exists', async () => {
      queryRunner.manager.findOne.mockResolvedValueOnce(null);

      const mockTenant = { id: TENANT_ID, domainName: DOMAIN_NAME } as Tenant;
      queryRunner.manager.create.mockReturnValueOnce(mockTenant);
      queryRunner.manager.save.mockResolvedValueOnce(mockTenant);

      queryRunner.manager.findOne.mockResolvedValueOnce({
        id: 'existing-user',
      });

      await expect(service.createTenant(dto)).rejects.toThrow(
        new BadRequestException(
          'A user with this email already exists in this tenant.',
        ),
      );

      expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(queryRunner.release).toHaveBeenCalled();
    });

    it('should throw ConflictException on DB unique violation', async () => {
      queryRunner.manager.findOne.mockRejectedValue(
        Object.assign(new Error('duplicate key'), { code: '23505' }),
      );

      await expect(service.createTenant(dto)).rejects.toThrow(
        new ConflictException(
          'A record with unique identifiers already exists.',
        ),
      );

      expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(queryRunner.release).toHaveBeenCalled();
    });

    it('should throw InternalServerErrorException on general error', async () => {
      queryRunner.manager.findOne.mockRejectedValue(
        new Error('DB connection reset'),
      );

      await expect(service.createTenant(dto)).rejects.toThrow(
        new InternalServerErrorException(
          'An error occurred during tenant provisioning.',
        ),
      );

      expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(queryRunner.release).toHaveBeenCalled();
    });
  });

  describe('updateTenantStatus', () => {
    it('should update tenant status successfully', async () => {
      const mockTenant = {
        id: TENANT_ID,
        status: TenantStatus.SUSPENDED,
      } as Tenant;
      tenantRepo.findOne.mockResolvedValue(mockTenant);
      tenantRepo.save.mockImplementation((t) => Promise.resolve(t));

      const result = await service.updateTenantStatus(
        TENANT_ID,
        TenantStatus.ACTIVE,
      );

      expect(tenantRepo.findOne).toHaveBeenCalledWith({
        where: { id: TENANT_ID, deletedAt: IsNull() },
      });
      expect(mockTenant.status).toBe(TenantStatus.ACTIVE);
      expect(tenantRepo.save).toHaveBeenCalledWith(mockTenant);
      expect(result).toBe(mockTenant);
    });

    it('should throw NotFoundException if tenant not found', async () => {
      tenantRepo.findOne.mockResolvedValue(null);

      await expect(
        service.updateTenantStatus(TENANT_ID, TenantStatus.ACTIVE),
      ).rejects.toThrow(new NotFoundException('Tenant not found'));
    });

    it('should throw InternalServerErrorException if save fails', async () => {
      const mockTenant = {
        id: TENANT_ID,
        status: TenantStatus.SUSPENDED,
      } as Tenant;
      tenantRepo.findOne.mockResolvedValue(mockTenant);
      tenantRepo.save.mockRejectedValue(new Error('Write lock failed'));

      await expect(
        service.updateTenantStatus(TENANT_ID, TenantStatus.ACTIVE),
      ).rejects.toThrow(
        new InternalServerErrorException('Failed to update tenant status'),
      );
    });
  });
});
