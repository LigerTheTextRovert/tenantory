import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource, OptimisticLockVersionMismatchError } from 'typeorm';

import { InventoryService } from './inventory.service';
import { StockLevel } from './entities/stock-level.entity';
import { VariantService } from '../catalog/variant/variant.service';
import { WarehouseService } from '../warehouse/warehouse.service';
import { StockQueryDto } from './dto/stock-query.dto';
import { Warehouse } from '../warehouse/entities/warehouse.entity';
import { ProductVariant } from '../catalog/entities/product-variant.entity';

describe('InventoryService', () => {
  let service: InventoryService;
  let dataSource: {
    transaction: jest.Mock;
  };
  let inventoryRepo: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let variantService: {
    findOneById: jest.Mock;
  };
  let warehouseService: {
    findOne: jest.Mock;
  };
  let entityManager: {
    getRepository: jest.Mock;
    findOne: jest.Mock;
    save: jest.Mock;
  };

  const TENANT_ID = '550e8400-e29b-41d4-a716-446655440000';
  const VARIANT_ID = 'v1234567-e5f6-7890-abcd-ef1234567890';
  const WAREHOUSE_ID = 'w1234567-e5f6-7890-abcd-ef1234567890';

  const mockQueryBuilder = () => ({
    where: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(),
  });

  beforeEach(async () => {
    entityManager = {
      getRepository: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
    };

    dataSource = {
      transaction: jest
        .fn()
        .mockImplementation((cb: (manager: typeof entityManager) => unknown) =>
          cb(entityManager),
        ),
    };

    inventoryRepo = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    variantService = {
      findOneById: jest.fn(),
    };

    warehouseService = {
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(StockLevel), useValue: inventoryRepo },
        { provide: VariantService, useValue: variantService },
        { provide: WarehouseService, useValue: warehouseService },
      ],
    }).compile();

    service = module.get<InventoryService>(InventoryService);
    jest.clearAllMocks();
  });

  describe('deductStock', () => {
    const dto = {
      variantId: VARIANT_ID,
      warehouseId: WAREHOUSE_ID,
      quantity: 5,
    };

    const mockVariant = { id: VARIANT_ID } as ProductVariant;
    const mockWarehouse = { id: WAREHOUSE_ID } as Warehouse;

    it('should deduct stock successfully', async () => {
      variantService.findOneById.mockResolvedValue(mockVariant);
      warehouseService.findOne.mockResolvedValue(mockWarehouse);

      const stockLevel = {
        tenantId: TENANT_ID,
        availableQuantity: 10,
        variant: mockVariant,
        warehouse: mockWarehouse,
      } as StockLevel;

      const subRepo = {
        findOne: jest.fn().mockResolvedValue(stockLevel),
      };
      entityManager.getRepository.mockReturnValue(subRepo);
      entityManager.save.mockResolvedValue(stockLevel);

      await service.deductStock(TENANT_ID, dto);

      expect(variantService.findOneById).toHaveBeenCalledWith(
        TENANT_ID,
        VARIANT_ID,
      );
      expect(warehouseService.findOne).toHaveBeenCalledWith(
        TENANT_ID,
        WAREHOUSE_ID,
      );
      expect(subRepo.findOne).toHaveBeenCalledWith({
        where: {
          tenantId: TENANT_ID,
          variant: { id: VARIANT_ID },
          warehouse: { id: WAREHOUSE_ID },
        },
      });
      expect(stockLevel.availableQuantity).toBe(5);
      expect(entityManager.save).toHaveBeenCalledWith(stockLevel);
    });

    it('should throw NotFoundException if stock level is not found', async () => {
      variantService.findOneById.mockResolvedValue(mockVariant);
      warehouseService.findOne.mockResolvedValue(mockWarehouse);

      const subRepo = {
        findOne: jest.fn().mockResolvedValue(null),
      };
      entityManager.getRepository.mockReturnValue(subRepo);

      await expect(service.deductStock(TENANT_ID, dto)).rejects.toThrow(
        new NotFoundException('There is no stock level with this info'),
      );
    });

    it('should throw BadRequestException if available quantity is insufficient', async () => {
      variantService.findOneById.mockResolvedValue(mockVariant);
      warehouseService.findOne.mockResolvedValue(mockWarehouse);

      const stockLevel = {
        tenantId: TENANT_ID,
        availableQuantity: 3,
        variant: mockVariant,
        warehouse: mockWarehouse,
      } as StockLevel;

      const subRepo = {
        findOne: jest.fn().mockResolvedValue(stockLevel),
      };
      entityManager.getRepository.mockReturnValue(subRepo);

      await expect(service.deductStock(TENANT_ID, dto)).rejects.toThrow(
        new BadRequestException('insufficient stock quantity'),
      );
    });

    it('should retry on OptimisticLockVersionMismatchError', async () => {
      variantService.findOneById.mockResolvedValue(mockVariant);
      warehouseService.findOne.mockResolvedValue(mockWarehouse);

      const stockLevel = {
        tenantId: TENANT_ID,
        availableQuantity: 10,
        variant: mockVariant,
        warehouse: mockWarehouse,
      } as StockLevel;

      const subRepo = {
        findOne: jest.fn().mockResolvedValue(stockLevel),
      };
      entityManager.getRepository.mockReturnValue(subRepo);

      let attempts = 0;
      entityManager.save.mockImplementation(() => {
        attempts++;
        if (attempts === 1) {
          throw new OptimisticLockVersionMismatchError('StockLevel', 1, 2);
        }
        return Promise.resolve(stockLevel);
      });

      await service.deductStock(TENANT_ID, dto);

      expect(attempts).toBe(2);
      expect(entityManager.save).toHaveBeenCalledTimes(2);
    });
  });

  describe('findAll', () => {
    it('should return paginated stock levels', async () => {
      const qb = mockQueryBuilder();
      const mockStockLevels = [
        { id: 's1', availableQuantity: 10 },
      ] as StockLevel[];
      qb.getManyAndCount.mockResolvedValue([mockStockLevels, 1]);
      inventoryRepo.createQueryBuilder.mockReturnValue(qb);

      const query: StockQueryDto = {
        variantId: VARIANT_ID,
        warehouseId: WAREHOUSE_ID,
        sortBy: 'q.availableQuantity',
        sortOrder: 'DESC',
        page: 1,
        limit: 10,
      };

      const result = await service.findAll(TENANT_ID, query);

      expect(inventoryRepo.createQueryBuilder).toHaveBeenCalledWith('q');
      expect(qb.where).toHaveBeenCalledWith('q.tenantId = :tenantId', {
        tenantId: TENANT_ID,
      });
      expect(qb.leftJoinAndSelect).toHaveBeenNthCalledWith(
        1,
        'q.variant',
        'variant',
      );
      expect(qb.andWhere).toHaveBeenNthCalledWith(
        1,
        'variant.id = :variantId',
        { variantId: VARIANT_ID },
      );
      expect(qb.leftJoinAndSelect).toHaveBeenNthCalledWith(
        2,
        'q.warehouse',
        'warehouse',
      );
      expect(qb.andWhere).toHaveBeenNthCalledWith(
        2,
        'warehouse.id = :warehouseId',
        { warehouseId: WAREHOUSE_ID },
      );
      expect(qb.orderBy).toHaveBeenCalledWith('q.availableQuantity', 'DESC');
      expect(qb.take).toHaveBeenCalledWith(10);
      expect(qb.skip).toHaveBeenCalledWith(0);
      expect(result).toEqual({
        data: mockStockLevels,
        meta: {
          totalItems: 1,
          itemCount: 1,
          totalPages: 1,
          itemsPerPage: 10,
          currentPage: 1,
        },
        links: {
          first: 'app/v1/inventory?page=1&limit=10',
          last: 'app/v1/inventory?page=1&limit=10',
          previous: null,
          next: null,
        },
      });
    });
  });

  describe('findOrCreate', () => {
    const mockWarehouse = { id: WAREHOUSE_ID } as Warehouse;
    const mockVariant = { id: VARIANT_ID } as ProductVariant;

    it('should return existing stock if found', async () => {
      const existingStock = { id: 's1', availableQuantity: 5 } as StockLevel;
      inventoryRepo.findOne.mockResolvedValue(existingStock);

      const result = await service.findOrCreate(
        TENANT_ID,
        mockWarehouse,
        mockVariant,
      );

      expect(inventoryRepo.findOne).toHaveBeenCalledWith({
        where: {
          tenantId: TENANT_ID,
          warehouse: { id: WAREHOUSE_ID },
          variant: { id: VARIANT_ID },
        },
      });
      expect(result).toBe(existingStock);
    });

    it('should create and return new stock if not found', async () => {
      inventoryRepo.findOne.mockResolvedValue(null);
      const createdStock = {
        tenantId: TENANT_ID,
        availableQuantity: 0,
      } as StockLevel;
      inventoryRepo.create.mockReturnValue(createdStock);

      const result = await service.findOrCreate(
        TENANT_ID,
        mockWarehouse,
        mockVariant,
      );

      expect(inventoryRepo.create).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        warehouse: mockWarehouse,
        variant: mockVariant,
        availableQuantity: 0,
        reservedQuantity: 0,
        safetyThreshold: 20,
      });
      expect(result).toBe(createdStock);
    });
  });

  describe('replenish', () => {
    const dto = {
      variantId: VARIANT_ID,
      warehouseId: WAREHOUSE_ID,
      quantity: 15,
    };
    const mockWarehouse = { id: WAREHOUSE_ID } as Warehouse;
    const mockVariant = { id: VARIANT_ID } as ProductVariant;

    it('should replenish stock level', async () => {
      warehouseService.findOne.mockResolvedValue(mockWarehouse);
      variantService.findOneById.mockResolvedValue(mockVariant);

      const stockLevel = {
        tenantId: TENANT_ID,
        availableQuantity: 10,
        warehouse: mockWarehouse,
        variant: mockVariant,
      } as StockLevel;

      const subRepo = {
        findOne: jest.fn().mockResolvedValue(stockLevel),
      };
      entityManager.getRepository.mockReturnValue(subRepo);
      entityManager.save.mockImplementation((s) => Promise.resolve(s));

      const result = await service.replenish(TENANT_ID, dto);

      expect(warehouseService.findOne).toHaveBeenCalledWith(
        TENANT_ID,
        WAREHOUSE_ID,
      );
      expect(variantService.findOneById).toHaveBeenCalledWith(
        TENANT_ID,
        VARIANT_ID,
      );
      expect(stockLevel.availableQuantity).toBe(25);
      expect(entityManager.save).toHaveBeenCalledWith(stockLevel);
      expect(result).toBe(stockLevel);
    });
  });

  describe('reserveStock', () => {
    const dto = {
      variantId: VARIANT_ID,
      warehouseId: WAREHOUSE_ID,
      quantity: 5,
    };

    it('should reserve stock successfully', async () => {
      const stockLevel = {
        tenantId: TENANT_ID,
        availableQuantity: 10,
        reservedQuantity: 2,
      } as StockLevel;

      entityManager.findOne.mockResolvedValue(stockLevel);
      entityManager.save.mockResolvedValue(stockLevel);

      await service.reserveStock(TENANT_ID, dto);

      expect(entityManager.findOne).toHaveBeenCalledWith(StockLevel, {
        where: {
          tenantId: TENANT_ID,
          variant: { id: VARIANT_ID },
          warehouse: { id: WAREHOUSE_ID },
        },
      });
      expect(stockLevel.availableQuantity).toBe(5);
      expect(stockLevel.reservedQuantity).toBe(7);
      expect(entityManager.save).toHaveBeenCalledWith(stockLevel);
    });

    it('should throw NotFoundException if stock level is not found', async () => {
      entityManager.findOne.mockResolvedValue(null);

      await expect(service.reserveStock(TENANT_ID, dto)).rejects.toThrow(
        new NotFoundException('There is no stock level with this info'),
      );
    });

    it('should throw BadRequestException if available quantity is insufficient for reservation', async () => {
      const stockLevel = {
        tenantId: TENANT_ID,
        availableQuantity: 3,
        reservedQuantity: 2,
      } as StockLevel;

      entityManager.findOne.mockResolvedValue(stockLevel);

      await expect(service.reserveStock(TENANT_ID, dto)).rejects.toThrow(
        new BadRequestException('Insufficient stock available for reservation'),
      );
    });
  });

  describe('releaseStock', () => {
    const dto = {
      variantId: VARIANT_ID,
      warehouseId: WAREHOUSE_ID,
      quantity: 5,
    };

    it('should release stock successfully', async () => {
      const stockLevel = {
        tenantId: TENANT_ID,
        availableQuantity: 10,
        reservedQuantity: 7,
      } as StockLevel;

      entityManager.findOne.mockResolvedValue(stockLevel);
      entityManager.save.mockResolvedValue(stockLevel);

      await service.releaseStock(TENANT_ID, dto);

      expect(entityManager.findOne).toHaveBeenCalledWith(StockLevel, {
        where: {
          variant: { id: VARIANT_ID },
          warehouse: { id: WAREHOUSE_ID },
          tenantId: TENANT_ID,
        },
      });
      expect(stockLevel.availableQuantity).toBe(15);
      expect(stockLevel.reservedQuantity).toBe(2);
      expect(entityManager.save).toHaveBeenCalledWith(stockLevel);
    });

    it('should throw NotFoundException if stock level is not found', async () => {
      entityManager.findOne.mockResolvedValue(null);

      await expect(service.releaseStock(TENANT_ID, dto)).rejects.toThrow(
        new NotFoundException('Stock level record not found'),
      );
    });

    it('should throw BadRequestException if release quantity exceeds reserved quantity', async () => {
      const stockLevel = {
        tenantId: TENANT_ID,
        availableQuantity: 10,
        reservedQuantity: 3,
      } as StockLevel;

      entityManager.findOne.mockResolvedValue(stockLevel);

      await expect(service.releaseStock(TENANT_ID, dto)).rejects.toThrow(
        new BadRequestException(
          'Cannot release more stock than currently reserved. Reserved: 3',
        ),
      );
    });
  });
});
