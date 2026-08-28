import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';

import { TenantService } from './tenant.service';
import { Tenant, TenantStatus } from './entities/tenant.entity';

describe('TenantService', () => {
  let service: TenantService;
  let tenantRepo: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    softRemove: jest.Mock;
  };

  const TENANT_ID = 't1234567-e5f6-7890-abcd-ef1234567890';
  const DOMAIN_NAME = 'test.tenantory.com';

  beforeEach(async () => {
    tenantRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      softRemove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantService,
        { provide: getRepositoryToken(Tenant), useValue: tenantRepo },
      ],
    }).compile();

    service = module.get<TenantService>(TenantService);
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return all tenants ordered by createdAt DESC', async () => {
      const mockTenants = [{ id: '1' }, { id: '2' }] as Tenant[];
      tenantRepo.find.mockResolvedValue(mockTenants);

      const result = await service.findAll();

      expect(tenantRepo.find).toHaveBeenCalledWith({
        order: { createdAt: 'DESC' },
      });
      expect(result).toBe(mockTenants);
    });
  });

  describe('findById', () => {
    it('should return tenant by ID', async () => {
      const mockTenant = { id: TENANT_ID } as Tenant;
      tenantRepo.findOne.mockResolvedValue(mockTenant);

      const result = await service.findById(TENANT_ID);

      expect(tenantRepo.findOne).toHaveBeenCalledWith({
        where: { id: TENANT_ID },
      });
      expect(result).toBe(mockTenant);
    });
  });

  describe('findOne', () => {
    it('should return tenant when found', async () => {
      const mockTenant = { id: TENANT_ID } as Tenant;
      tenantRepo.findOne.mockResolvedValue(mockTenant);

      const result = await service.findOne(TENANT_ID);

      expect(result).toBe(mockTenant);
    });

    it('should throw NotFoundException when tenant not found', async () => {
      tenantRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne(TENANT_ID)).rejects.toThrow(
        new NotFoundException(`Tenant with ID ${TENANT_ID} not found`),
      );
    });
  });

  describe('findByIdAndValidate', () => {
    it('should return tenant when active', async () => {
      const mockTenant = {
        id: TENANT_ID,
        status: TenantStatus.ACTIVE,
      } as Tenant;
      tenantRepo.findOne.mockResolvedValue(mockTenant);

      const result = await service.findByIdAndValidate(TENANT_ID);

      expect(result).toBe(mockTenant);
    });

    it('should return null when tenant is archived', async () => {
      const mockTenant = {
        id: TENANT_ID,
        status: TenantStatus.ARCHIVED,
      } as Tenant;
      tenantRepo.findOne.mockResolvedValue(mockTenant);

      const result = await service.findByIdAndValidate(TENANT_ID);

      expect(result).toBeNull();
    });

    it('should return null when tenant not found', async () => {
      tenantRepo.findOne.mockResolvedValue(null);

      const result = await service.findByIdAndValidate(TENANT_ID);

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    const dto = {
      domainName: DOMAIN_NAME,
      businessName: 'Test Business',
      status: TenantStatus.ACTIVE,
    };

    it('should create and save tenant successfully', async () => {
      const mockTenant = { id: TENANT_ID, ...dto } as Tenant;
      tenantRepo.create.mockReturnValue(mockTenant);
      tenantRepo.save.mockResolvedValue(mockTenant);

      const result = await service.create(dto);

      expect(tenantRepo.create).toHaveBeenCalledWith({
        domainName: dto.domainName,
        businessName: dto.businessName,
        status: dto.status,
      });
      expect(tenantRepo.save).toHaveBeenCalledWith(mockTenant);
      expect(result).toBe(mockTenant);
    });

    it('should throw ConflictException on unique violation', async () => {
      tenantRepo.create.mockReturnValue({});
      tenantRepo.save.mockRejectedValue(
        Object.assign(new Error('duplicate key'), { code: '23505' }),
      );

      await expect(service.create(dto)).rejects.toThrow(
        new ConflictException(
          `A tenant with domain name "${dto.domainName}" already exists`,
        ),
      );
    });

    it('should rethrow other errors', async () => {
      tenantRepo.create.mockReturnValue({});
      const dbError = new Error('Database down');
      tenantRepo.save.mockRejectedValue(dbError);

      await expect(service.create(dto)).rejects.toThrow(dbError);
    });
  });

  describe('update', () => {
    const existingTenant = {
      id: TENANT_ID,
      domainName: 'old.tenantory.com',
      businessName: 'Old Business',
      status: TenantStatus.SUSPENDED,
    } as Tenant;

    it('should update and save tenant successfully', async () => {
      tenantRepo.findOne.mockResolvedValue({ ...existingTenant });
      tenantRepo.save.mockImplementation((t) => Promise.resolve(t));

      const updateDto = {
        domainName: DOMAIN_NAME,
        businessName: 'New Business',
        status: TenantStatus.ACTIVE,
      };

      const result = await service.update(TENANT_ID, updateDto);

      expect(tenantRepo.save).toHaveBeenCalled();
      expect(result.domainName).toBe(DOMAIN_NAME);
      expect(result.businessName).toBe('New Business');
      expect(result.status).toBe(TenantStatus.ACTIVE);
    });

    it('should throw ConflictException if domain name update collides', async () => {
      tenantRepo.findOne.mockResolvedValue({ ...existingTenant });
      tenantRepo.save.mockRejectedValue(
        Object.assign(new Error('duplicate key'), { code: '23505' }),
      );

      const updateDto = { domainName: DOMAIN_NAME };

      await expect(service.update(TENANT_ID, updateDto)).rejects.toThrow(
        new ConflictException(
          `A tenant with domain name "${DOMAIN_NAME}" already exists`,
        ),
      );
    });
  });

  describe('remove', () => {
    it('should soft delete tenant', async () => {
      const mockTenant = { id: TENANT_ID } as Tenant;
      tenantRepo.findOne.mockResolvedValue(mockTenant);
      tenantRepo.softRemove.mockResolvedValue(mockTenant);

      await service.remove(TENANT_ID);

      expect(tenantRepo.softRemove).toHaveBeenCalledWith(mockTenant);
    });
  });
});
