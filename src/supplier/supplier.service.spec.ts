import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { IsNull } from 'typeorm';

import { SupplierService } from './supplier.service';
import { Supplier } from './entities/supplier.entity';
import { SupplierQueryDto } from './dto/supplier-query.dto';
import { AuditService } from '../audit/audit.service';

describe('SupplierService', () => {
  let service: SupplierService;
  let supplierRepo: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    softRemove: jest.Mock;
    createQueryBuilder: jest.Mock;
  };

  const TENANT_ID = '550e8400-e29b-41d4-a716-446655440000';
  const SUPPLIER_ID = 's1234567-e5f6-7890-abcd-ef1234567890';
  const COMPANY_NAME = 'Acme Corp';

  const mockQueryBuilder = () => ({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(),
    getExists: jest.fn(),
  });

  beforeEach(async () => {
    supplierRepo = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      softRemove: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupplierService,
        { provide: getRepositoryToken(Supplier), useValue: supplierRepo },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();

    service = module.get<SupplierService>(SupplierService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    const dto = {
      companyName: COMPANY_NAME,
      contactEmail: 'contact@acme.com',
      contactPhone: '123-456-7890',
      address: '123 Acme St',
      leadTimeDays: 5,
    };

    it('should create and save supplier successfully when company name is unique', async () => {
      const qb = mockQueryBuilder();
      qb.getExists.mockResolvedValue(false);
      supplierRepo.createQueryBuilder.mockReturnValue(qb);

      const createdSupplier = { id: SUPPLIER_ID, ...dto, tenantId: TENANT_ID };
      supplierRepo.create.mockReturnValue(createdSupplier);
      supplierRepo.save.mockResolvedValue(createdSupplier);

      const result = await service.create(TENANT_ID, dto);

      expect(qb.getExists).toHaveBeenCalled();
      expect(supplierRepo.create).toHaveBeenCalledWith({
        ...dto,
        tenantId: TENANT_ID,
        tenant: { id: TENANT_ID },
      });
      expect(supplierRepo.save).toHaveBeenCalledWith(createdSupplier);
      expect(result).toBe(createdSupplier);
    });

    it('should throw ConflictException if company name already exists (assertCompanyNameUnique)', async () => {
      const qb = mockQueryBuilder();
      qb.getExists.mockResolvedValue(true);
      supplierRepo.createQueryBuilder.mockReturnValue(qb);

      await expect(service.create(TENANT_ID, dto)).rejects.toThrow(
        new ConflictException(
          'A supplier with this company name already exists for this tenant',
        ),
      );
      expect(supplierRepo.save).not.toHaveBeenCalled();
    });

    it('should throw ConflictException on DB unique violation', async () => {
      const qb = mockQueryBuilder();
      qb.getExists.mockResolvedValue(false);
      supplierRepo.createQueryBuilder.mockReturnValue(qb);

      supplierRepo.create.mockReturnValue({});
      supplierRepo.save.mockRejectedValue(
        Object.assign(new Error('duplicate key'), { code: '23505' }),
      );

      await expect(service.create(TENANT_ID, dto)).rejects.toThrow(
        new ConflictException(
          'A supplier with this company name already exists for this tenant',
        ),
      );
    });

    it('should rethrow other DB exceptions', async () => {
      const qb = mockQueryBuilder();
      qb.getExists.mockResolvedValue(false);
      supplierRepo.createQueryBuilder.mockReturnValue(qb);

      supplierRepo.create.mockReturnValue({});
      const dbError = new Error('Database down');
      supplierRepo.save.mockRejectedValue(dbError);

      await expect(service.create(TENANT_ID, dto)).rejects.toThrow(dbError);
    });
  });

  describe('findAll', () => {
    it('should return paginated suppliers', async () => {
      const qb = mockQueryBuilder();
      const mockSuppliers = [
        { id: SUPPLIER_ID, companyName: COMPANY_NAME },
      ] as Supplier[];
      qb.getManyAndCount.mockResolvedValue([mockSuppliers, 1]);
      supplierRepo.createQueryBuilder.mockReturnValue(qb);

      const query: SupplierQueryDto = {
        search: 'Acme',
        sortBy: 'company_name',
        sortOrder: 'DESC',
        page: 1,
        limit: 10,
      };

      const result = await service.findAll(TENANT_ID, query);

      expect(supplierRepo.createQueryBuilder).toHaveBeenCalledWith('s');
      expect(qb.where).toHaveBeenCalledWith('s.tenant_id = :tenantId', {
        tenantId: TENANT_ID,
      });
      expect(qb.andWhere).toHaveBeenNthCalledWith(1, 's.deleted_at IS NULL');
      expect(qb.andWhere).toHaveBeenNthCalledWith(
        2,
        's.company_name ILIKE :search',
        { search: '%Acme%' },
      );
      expect(qb.orderBy).toHaveBeenCalledWith('s.company_name', 'DESC');
      expect(qb.skip).toHaveBeenCalledWith(0);
      expect(qb.take).toHaveBeenCalledWith(10);
      expect(result).toEqual({
        data: mockSuppliers,
        meta: {
          totalItems: 1,
          itemCount: 1,
          itemsPerPage: 10,
          totalPages: 1,
          currentPage: 1,
        },
        links: {
          first: '/api/v1/suppliers?page=1&limit=10',
          last: '/api/v1/suppliers?page=1&limit=10',
          previous: null,
          next: null,
        },
      });
    });
  });

  describe('findOne', () => {
    it('should return supplier when found', async () => {
      const supplier = { id: SUPPLIER_ID, tenantId: TENANT_ID } as Supplier;
      supplierRepo.findOne.mockResolvedValue(supplier);

      const result = await service.findOne(TENANT_ID, SUPPLIER_ID);

      expect(supplierRepo.findOne).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID, id: SUPPLIER_ID, deletedAt: IsNull() },
      });
      expect(result).toBe(supplier);
    });

    it('should throw NotFoundException when not found', async () => {
      supplierRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne(TENANT_ID, SUPPLIER_ID)).rejects.toThrow(
        new NotFoundException(
          `Supplier with ID "${SUPPLIER_ID}" not found for tenant ${TENANT_ID}`,
        ),
      );
    });
  });

  describe('update', () => {
    const existingSupplier = {
      id: SUPPLIER_ID,
      tenantId: TENANT_ID,
      companyName: 'Old Name',
      contactEmail: 'old@email.com',
      contactPhone: '000',
      address: 'Old Addr',
      leadTimeDays: 3,
    } as Supplier;

    it('should update and save supplier successfully', async () => {
      supplierRepo.findOne.mockResolvedValue({ ...existingSupplier });
      const qb = mockQueryBuilder();
      qb.getExists.mockResolvedValue(false);
      supplierRepo.createQueryBuilder.mockReturnValue(qb);
      supplierRepo.save.mockImplementation((s) => Promise.resolve(s));

      const updateDto = {
        companyName: COMPANY_NAME,
        contactEmail: 'new@email.com',
        contactPhone: '111',
        address: 'New Addr',
        leadTimeDays: 7,
      };

      const result = await service.update(TENANT_ID, SUPPLIER_ID, updateDto);

      expect(supplierRepo.save).toHaveBeenCalled();
      expect(result.companyName).toBe(COMPANY_NAME);
      expect(result.contactEmail).toBe('new@email.com');
      expect(result.contactPhone).toBe('111');
      expect(result.address).toBe('New Addr');
      expect(result.leadTimeDays).toBe(7);
    });

    it('should throw ConflictException if company name update collides', async () => {
      supplierRepo.findOne.mockResolvedValue({ ...existingSupplier });
      const qb = mockQueryBuilder();
      qb.getExists.mockResolvedValue(true);
      supplierRepo.createQueryBuilder.mockReturnValue(qb);

      await expect(
        service.update(TENANT_ID, SUPPLIER_ID, { companyName: COMPANY_NAME }),
      ).rejects.toThrow(ConflictException);
      expect(supplierRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should soft delete supplier', async () => {
      const supplier = { id: SUPPLIER_ID } as Supplier;
      supplierRepo.findOne.mockResolvedValue(supplier);
      supplierRepo.softRemove.mockResolvedValue(supplier);

      await service.remove(TENANT_ID, SUPPLIER_ID);

      expect(supplierRepo.softRemove).toHaveBeenCalledWith(supplier);
    });
  });
});
