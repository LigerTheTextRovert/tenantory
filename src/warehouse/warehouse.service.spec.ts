import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { IsNull } from 'typeorm';

import { WarehouseService } from './warehouse.service';
import { AuditService } from '../audit/audit.service';
import { Warehouse } from './entities/warehouse.entity';
import { WarehouseQueryDto } from './dto/warehouse-query.dto';

describe('WarehouseService', () => {
  let service: WarehouseService;
  let warehouseRepo: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    softRemove: jest.Mock;
    createQueryBuilder: jest.Mock;
  };

  const TENANT_ID = '550e8400-e29b-41d4-a716-446655440000';
  const WAREHOUSE_ID = 'w1234567-e5f6-7890-abcd-ef1234567890';
  const WAREHOUSE_NAME = 'Main Warehouse';

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
    warehouseRepo = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      softRemove: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WarehouseService,
        { provide: getRepositoryToken(Warehouse), useValue: warehouseRepo },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();

    service = module.get<WarehouseService>(WarehouseService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    const dto = {
      name: WAREHOUSE_NAME,
      location: '123 Warehouse Rd',
    };

    it('should create and save warehouse successfully when name is unique', async () => {
      const qb = mockQueryBuilder();
      qb.getExists.mockResolvedValue(false);
      warehouseRepo.createQueryBuilder.mockReturnValue(qb);

      const createdWarehouse = {
        id: WAREHOUSE_ID,
        ...dto,
        tenantId: TENANT_ID,
      } as unknown as Warehouse;
      warehouseRepo.create.mockReturnValue(createdWarehouse);
      warehouseRepo.save.mockResolvedValue(createdWarehouse);

      const result = await service.create(TENANT_ID, dto);

      expect(qb.getExists).toHaveBeenCalled();
      expect(warehouseRepo.create).toHaveBeenCalledWith({
        name: dto.name,
        location: dto.location,
        tenantId: TENANT_ID,
        tenant: { id: TENANT_ID },
      });
      expect(warehouseRepo.save).toHaveBeenCalledWith(createdWarehouse);
      expect(result).toBe(createdWarehouse);
    });

    it('should throw ConflictException if warehouse name already exists', async () => {
      const qb = mockQueryBuilder();
      qb.getExists.mockResolvedValue(true);
      warehouseRepo.createQueryBuilder.mockReturnValue(qb);

      await expect(service.create(TENANT_ID, dto)).rejects.toThrow(
        new ConflictException(
          'A warehouse with this name already exists for this tenant',
        ),
      );
      expect(warehouseRepo.save).not.toHaveBeenCalled();
    });

    it('should throw ConflictException on DB unique violation', async () => {
      const qb = mockQueryBuilder();
      qb.getExists.mockResolvedValue(false);
      warehouseRepo.createQueryBuilder.mockReturnValue(qb);

      warehouseRepo.create.mockReturnValue({});
      warehouseRepo.save.mockRejectedValue(
        Object.assign(new Error('duplicate key'), { code: '23505' }),
      );

      await expect(service.create(TENANT_ID, dto)).rejects.toThrow(
        new ConflictException(
          'A warehouse with this name already exists for this tenant',
        ),
      );
    });

    it('should rethrow other DB exceptions', async () => {
      const qb = mockQueryBuilder();
      qb.getExists.mockResolvedValue(false);
      warehouseRepo.createQueryBuilder.mockReturnValue(qb);

      warehouseRepo.create.mockReturnValue({});
      const dbError = new Error('Database down');
      warehouseRepo.save.mockRejectedValue(dbError);

      await expect(service.create(TENANT_ID, dto)).rejects.toThrow(dbError);
    });
  });

  describe('findAll', () => {
    it('should return paginated warehouses', async () => {
      const qb = mockQueryBuilder();
      const mockWarehouses = [
        { id: WAREHOUSE_ID, name: WAREHOUSE_NAME },
      ] as Warehouse[];
      qb.getManyAndCount.mockResolvedValue([mockWarehouses, 1]);
      warehouseRepo.createQueryBuilder.mockReturnValue(qb);

      const query: WarehouseQueryDto = {
        search: 'Main',
        sortBy: 'name',
        sortOrder: 'DESC',
        page: 1,
        limit: 10,
      };

      const result = await service.findAll(TENANT_ID, query);

      expect(warehouseRepo.createQueryBuilder).toHaveBeenCalledWith('w');
      expect(qb.where).toHaveBeenCalledWith('w.tenant_id = :tenantId', {
        tenantId: TENANT_ID,
      });
      expect(qb.andWhere).toHaveBeenNthCalledWith(1, 'w.deleted_at IS NULL');
      expect(qb.andWhere).toHaveBeenNthCalledWith(2, 'w.name ILIKE :search', {
        search: '%Main%',
      });
      expect(qb.orderBy).toHaveBeenCalledWith('w.name', 'DESC');
      expect(qb.skip).toHaveBeenCalledWith(0);
      expect(qb.take).toHaveBeenCalledWith(10);
      expect(result).toEqual({
        data: mockWarehouses,
        meta: {
          totalItems: 1,
          itemCount: 1,
          itemsPerPage: 10,
          totalPages: 1,
          currentPage: 1,
        },
        links: {
          first: '/api/v1/warehouses?page=1&limit=10',
          last: '/api/v1/warehouses?page=1&limit=10',
          previous: null,
          next: null,
        },
      });
    });
  });

  describe('findOne', () => {
    it('should return warehouse when found', async () => {
      const warehouse = { id: WAREHOUSE_ID, tenantId: TENANT_ID } as Warehouse;
      warehouseRepo.findOne.mockResolvedValue(warehouse);

      const result = await service.findOne(TENANT_ID, WAREHOUSE_ID);

      expect(warehouseRepo.findOne).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID, id: WAREHOUSE_ID, deletedAt: IsNull() },
      });
      expect(result).toBe(warehouse);
    });

    it('should throw NotFoundException when not found', async () => {
      warehouseRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne(TENANT_ID, WAREHOUSE_ID)).rejects.toThrow(
        new NotFoundException(
          `Warehouse with ID "${WAREHOUSE_ID}" not found for tenant ${TENANT_ID}`,
        ),
      );
    });
  });

  describe('update', () => {
    const existingWarehouse = {
      id: WAREHOUSE_ID,
      tenantId: TENANT_ID,
      name: 'Old Name',
      location: 'Old Loc',
    } as unknown as Warehouse;

    it('should update and save warehouse successfully', async () => {
      warehouseRepo.findOne.mockResolvedValue({ ...existingWarehouse });
      const qb = mockQueryBuilder();
      qb.getExists.mockResolvedValue(false);
      warehouseRepo.createQueryBuilder.mockReturnValue(qb);
      warehouseRepo.save.mockImplementation((w) => Promise.resolve(w));

      const updateDto = {
        name: WAREHOUSE_NAME,
        location: 'New Loc',
      };

      const result = await service.update(TENANT_ID, WAREHOUSE_ID, updateDto);

      expect(warehouseRepo.save).toHaveBeenCalled();
      expect(result.name).toBe(WAREHOUSE_NAME);
      expect(result.location).toBe('New Loc');
    });

    it('should throw ConflictException if warehouse name update collides', async () => {
      warehouseRepo.findOne.mockResolvedValue({ ...existingWarehouse });
      const qb = mockQueryBuilder();
      qb.getExists.mockResolvedValue(true);
      warehouseRepo.createQueryBuilder.mockReturnValue(qb);

      await expect(
        service.update(TENANT_ID, WAREHOUSE_ID, { name: WAREHOUSE_NAME }),
      ).rejects.toThrow(ConflictException);
      expect(warehouseRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should soft delete warehouse', async () => {
      const warehouse = { id: WAREHOUSE_ID } as Warehouse;
      warehouseRepo.findOne.mockResolvedValue(warehouse);
      warehouseRepo.softRemove.mockResolvedValue(warehouse);

      await service.remove(TENANT_ID, WAREHOUSE_ID);

      expect(warehouseRepo.softRemove).toHaveBeenCalledWith(warehouse);
    });
  });
});
