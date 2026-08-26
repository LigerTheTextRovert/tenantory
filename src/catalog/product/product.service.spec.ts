import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { IsNull } from 'typeorm';
import { ProductService } from './product.service';
import { Product } from '../entities/product.entity';
import { CategoryService } from '../../category/category.service';
import { ProductQueryDto } from './dto/product-query.dto';
import { CacheService } from '../../common/services/cache.service';
import { CACHE_TTL, CacheKeys } from '../../common/constants/cache.constants';

describe('ProductService', () => {
  let service: ProductService;
  let productRepo: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    softRemove: jest.Mock;
    createQueryBuilder: jest.Mock;
    manager: { getRepository: jest.Mock };
  };
  let categoryService: { findOne: jest.Mock };
  let cache: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
    delByPattern: jest.Mock;
    ttl: jest.Mock;
  };

  const TENANT_ID = '550e8400-e29b-41d4-a716-446655440000';
  const CATEGORY_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  const PRODUCT_ID = '11111111-2222-3333-4444-555555555555';

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
    const qb = mockQueryBuilder();

    productRepo = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      softRemove: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      manager: {
        getRepository: jest.fn(),
      },
    };

    categoryService = {
      findOne: jest.fn(),
    };

    cache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
      delByPattern: jest.fn().mockResolvedValue(undefined),
      ttl: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductService,
        { provide: getRepositoryToken(Product), useValue: productRepo },
        { provide: CategoryService, useValue: categoryService },
        { provide: CacheService, useValue: cache },
      ],
    }).compile();

    service = module.get<ProductService>(ProductService);
  });

  describe('create', () => {
    const dto = {
      name: 'Classic T-Shirt',
      categoryId: CATEGORY_ID,
      skuPrefix: 'TSH',
    };

    it('should create a product with valid categoryId', async () => {
      categoryService.findOne.mockResolvedValue({ id: CATEGORY_ID });

      const qb = mockQueryBuilder();
      qb.getExists.mockResolvedValue(false);
      productRepo.createQueryBuilder.mockReturnValue(qb);

      const savedProduct = {
        id: PRODUCT_ID,
        ...dto,
        tenantId: TENANT_ID,
        isActive: true,
      };
      productRepo.create.mockReturnValue(savedProduct);
      productRepo.save.mockResolvedValue(savedProduct);

      const result = await service.create(TENANT_ID, dto);

      expect(categoryService.findOne).toHaveBeenCalledWith(
        TENANT_ID,
        CATEGORY_ID,
      );
      expect(productRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Classic T-Shirt',
          skuPrefix: 'TSH',
        }),
      );
      expect(result.id).toBe(PRODUCT_ID);
      expect(result.name).toBe('Classic T-Shirt');
    });

    it('should throw NotFoundException when categoryId is invalid', async () => {
      categoryService.findOne.mockRejectedValue(
        new NotFoundException(
          `Category with ID "${CATEGORY_ID}" not found for tenant ${TENANT_ID}`,
        ),
      );

      await expect(service.create(TENANT_ID, dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ConflictException when skuPrefix already exists', async () => {
      categoryService.findOne.mockResolvedValue({ id: CATEGORY_ID });

      const qb = mockQueryBuilder();
      qb.getExists.mockResolvedValue(true);
      productRepo.createQueryBuilder.mockReturnValue(qb);

      await expect(service.create(TENANT_ID, dto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw ConflictException on DB unique violation (23505)', async () => {
      categoryService.findOne.mockResolvedValue({ id: CATEGORY_ID });

      const qb = mockQueryBuilder();
      qb.getExists.mockResolvedValue(false);
      productRepo.createQueryBuilder.mockReturnValue(qb);

      productRepo.create.mockReturnValue({ id: PRODUCT_ID });
      productRepo.save.mockRejectedValue(
        Object.assign(new Error('duplicate key'), { code: '23505' }),
      );

      await expect(service.create(TENANT_ID, dto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should pass isActive from dto to created entity', async () => {
      categoryService.findOne.mockResolvedValue({ id: CATEGORY_ID });

      const qb = mockQueryBuilder();
      qb.getExists.mockResolvedValue(false);
      productRepo.createQueryBuilder.mockReturnValue(qb);

      const savedProduct = {
        id: PRODUCT_ID,
        ...dto,
        tenantId: TENANT_ID,
        isActive: true,
      };
      productRepo.create.mockReturnValue(savedProduct);
      productRepo.save.mockResolvedValue(savedProduct);

      const dtoWithActive = { ...dto, isActive: false };
      await service.create(TENANT_ID, dtoWithActive);

      expect(productRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false }),
      );
    });
  });

  describe('findAll', () => {
    it('should return paginated response with correct meta and links', async () => {
      const qb = mockQueryBuilder();
      const data = [{ id: 'p1', name: 'Product 1' }];
      qb.getManyAndCount.mockResolvedValue([data, 1]);
      productRepo.createQueryBuilder.mockReturnValue(qb);

      const query: ProductQueryDto = {
        page: 1,
        limit: 20,
        sortBy: 'created_at',
        sortOrder: 'DESC',
      };

      const result = await service.findAll(TENANT_ID, query);

      expect(result.data).toEqual(data);
      expect(result.meta.totalItems).toBe(1);
      expect(result.meta.currentPage).toBe(1);
      expect(result.meta.totalPages).toBe(1);
      expect(result.links.first).toBe('/api/v1/products?page=1&limit=20');
      expect(result.links.last).toBe('/api/v1/products?page=1&limit=20');
      expect(result.links.previous).toBeNull();
      expect(result.links.next).toBeNull();
    });

    it('should apply search filter on name', async () => {
      const qb = mockQueryBuilder();
      qb.getManyAndCount.mockResolvedValue([[], 0]);
      productRepo.createQueryBuilder.mockReturnValue(qb);

      const query: ProductQueryDto = {
        page: 1,
        limit: 20,
        search: 'shirt',
        sortBy: 'created_at',
        sortOrder: 'DESC',
      };

      await service.findAll(TENANT_ID, query);

      expect(qb.andWhere).toHaveBeenCalledWith('p.name ILIKE :search', {
        search: '%shirt%',
      });
    });

    it('should filter by categoryId', async () => {
      const qb = mockQueryBuilder();
      qb.getManyAndCount.mockResolvedValue([[], 0]);
      productRepo.createQueryBuilder.mockReturnValue(qb);

      const query: ProductQueryDto = {
        page: 1,
        limit: 20,
        categoryId: CATEGORY_ID,
        sortBy: 'created_at',
        sortOrder: 'DESC',
      };

      await service.findAll(TENANT_ID, query);

      expect(qb.andWhere).toHaveBeenCalledWith('p.category_id = :categoryId', {
        categoryId: CATEGORY_ID,
      });
    });

    it('should filter by isActive', async () => {
      const qb = mockQueryBuilder();
      qb.getManyAndCount.mockResolvedValue([[], 0]);
      productRepo.createQueryBuilder.mockReturnValue(qb);

      const query: ProductQueryDto = {
        page: 1,
        limit: 20,
        isActive: 'false',
        sortBy: 'created_at',
        sortOrder: 'DESC',
      };

      await service.findAll(TENANT_ID, query);

      expect(qb.andWhere).toHaveBeenCalledWith('p.is_active = :isActive', {
        isActive: false,
      });
    });

    it('should handle pagination across multiple pages', async () => {
      const qb = mockQueryBuilder();
      const data = [{ id: 'p1' }, { id: 'p2' }];
      qb.getManyAndCount.mockResolvedValue([data, 25]);
      productRepo.createQueryBuilder.mockReturnValue(qb);

      const query: ProductQueryDto = {
        page: 2,
        limit: 10,
        sortBy: 'created_at',
        sortOrder: 'DESC',
      };

      const result = await service.findAll(TENANT_ID, query);

      expect(result.meta.totalItems).toBe(25);
      expect(result.meta.totalPages).toBe(3);
      expect(result.meta.currentPage).toBe(2);
      expect(result.links.previous).toBe('/api/v1/products?page=1&limit=10');
      expect(result.links.next).toBe('/api/v1/products?page=3&limit=10');
      expect(qb.skip).toHaveBeenCalledWith(10);
      expect(qb.take).toHaveBeenCalledWith(10);
    });
  });

  describe('findOne', () => {
    it('should return product with category and variants loaded', async () => {
      const product = {
        id: PRODUCT_ID,
        name: 'T-Shirt',
        category: { id: CATEGORY_ID },
        variants: [],
      };
      productRepo.findOne.mockResolvedValue(product);

      const result = await service.findOne(TENANT_ID, PRODUCT_ID);

      expect(result).toEqual(product);
      expect(productRepo.findOne).toHaveBeenCalledWith({
        where: {
          id: PRODUCT_ID,
          tenant: { id: TENANT_ID },
          deletedAt: IsNull(),
        },
        relations: { category: true, variants: true },
      });
    });

    it('should throw NotFoundException when product not found', async () => {
      productRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne(TENANT_ID, PRODUCT_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    const existingProduct = {
      id: PRODUCT_ID,
      name: 'T-Shirt',
      skuPrefix: 'TSH',
      category: { id: CATEGORY_ID },
      isActive: true,
    };

    beforeEach(() => {
      productRepo.findOne.mockResolvedValue({ ...existingProduct });
    });

    it('should update name successfully', async () => {
      productRepo.save.mockImplementation((p) => Promise.resolve(p));

      const result = await service.update(TENANT_ID, PRODUCT_ID, {
        name: 'Polo Shirt',
      });

      expect(result.name).toBe('Polo Shirt');
      expect(productRepo.save).toHaveBeenCalled();
    });

    it('should throw ConflictException when trying to change skuPrefix', async () => {
      await expect(
        service.update(TENANT_ID, PRODUCT_ID, { skuPrefix: 'NEW' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should allow update with same skuPrefix', async () => {
      productRepo.save.mockImplementation((p) => Promise.resolve(p));

      const result = await service.update(TENANT_ID, PRODUCT_ID, {
        skuPrefix: 'TSH',
      });

      expect(result.skuPrefix).toBe('TSH');
    });

    it('should update categoryId after validating new category', async () => {
      const NEW_CATEGORY_ID = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';
      categoryService.findOne.mockResolvedValue({ id: NEW_CATEGORY_ID });
      productRepo.save.mockImplementation((p) => Promise.resolve(p));

      await service.update(TENANT_ID, PRODUCT_ID, {
        categoryId: NEW_CATEGORY_ID,
      });

      expect(categoryService.findOne).toHaveBeenCalledWith(
        TENANT_ID,
        NEW_CATEGORY_ID,
      );
    });

    it('should update description including explicit null', async () => {
      productRepo.save.mockImplementation((p) => Promise.resolve(p));

      const result = await service.update(TENANT_ID, PRODUCT_ID, {
        description: null,
      });

      expect(result.description).toBeNull();
    });

    it('should update isActive', async () => {
      productRepo.save.mockImplementation((p) => Promise.resolve(p));

      const result = await service.update(TENANT_ID, PRODUCT_ID, {
        isActive: false,
      });

      expect(result.isActive).toBe(false);
    });

    it('should throw NotFoundException when product not found', async () => {
      productRepo.findOne.mockResolvedValue(null);

      await expect(
        service.update(TENANT_ID, PRODUCT_ID, { name: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException on DB unique violation', async () => {
      productRepo.save.mockRejectedValue(
        Object.assign(new Error('duplicate key'), { code: '23505' }),
      );

      await expect(
        service.update(TENANT_ID, PRODUCT_ID, { name: 'X' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    const existingProduct = {
      id: PRODUCT_ID,
      name: 'T-Shirt',
    };

    it('should soft-delete product when no variants exist', async () => {
      productRepo.findOne.mockResolvedValue({ ...existingProduct });

      const variantRepo = { count: jest.fn().mockResolvedValue(0) };
      productRepo.manager.getRepository.mockReturnValue(variantRepo);

      await service.remove(TENANT_ID, PRODUCT_ID);

      expect(productRepo.softRemove).toHaveBeenCalledWith(
        expect.objectContaining({ id: PRODUCT_ID }),
      );
    });

    it('should throw ConflictException when variants exist', async () => {
      productRepo.findOne.mockResolvedValue({ ...existingProduct });

      const variantRepo = { count: jest.fn().mockResolvedValue(3) };
      productRepo.manager.getRepository.mockReturnValue(variantRepo);

      await expect(service.remove(TENANT_ID, PRODUCT_ID)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw NotFoundException when product not found', async () => {
      productRepo.findOne.mockResolvedValue(null);

      await expect(service.remove(TENANT_ID, PRODUCT_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('assertSkuUniqueness', () => {
    it('should pass when skuPrefix does not exist', async () => {
      const qb = mockQueryBuilder();
      qb.getExists.mockResolvedValue(false);
      productRepo.createQueryBuilder.mockReturnValue(qb);

      await expect(
        service.assertSkuUniqueness('TSH', TENANT_ID),
      ).resolves.toBeUndefined();
    });

    it('should throw ConflictException when skuPrefix already exists', async () => {
      const qb = mockQueryBuilder();
      qb.getExists.mockResolvedValue(true);
      productRepo.createQueryBuilder.mockReturnValue(qb);

      await expect(
        service.assertSkuUniqueness('TSH', TENANT_ID),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('caching', () => {
    it('should return cached product on cache hit without querying the database', async () => {
      const cachedProduct = { id: PRODUCT_ID, name: 'Cached' };
      cache.get.mockResolvedValue(cachedProduct);

      const result = await service.findOne(TENANT_ID, PRODUCT_ID);

      expect(result).toEqual(cachedProduct);
      expect(cache.get).toHaveBeenCalledWith(
        CacheKeys.product(TENANT_ID, PRODUCT_ID),
      );
      expect(productRepo.findOne).not.toHaveBeenCalled();
    });

    it('should store database result in cache with product TTL on cache miss', async () => {
      const product = { id: PRODUCT_ID, name: 'T-Shirt' };
      productRepo.findOne.mockResolvedValue(product);

      const result = await service.findOne(TENANT_ID, PRODUCT_ID);

      expect(result).toEqual(product);
      expect(cache.set).toHaveBeenCalledWith(
        CacheKeys.product(TENANT_ID, PRODUCT_ID),
        product,
        CACHE_TTL.PRODUCT,
      );
    });

    it('should not cache when product is not found', async () => {
      productRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne(TENANT_ID, PRODUCT_ID)).rejects.toThrow(
        NotFoundException,
      );
      expect(cache.set).not.toHaveBeenCalled();
    });

    it('should return cached paginated list on cache hit without querying the database', async () => {
      const cachedResponse = { data: [], meta: {}, links: {} };
      cache.get.mockResolvedValue(cachedResponse);

      const query: ProductQueryDto = { page: 1, limit: 10 };
      const result = await service.findAll(TENANT_ID, query);

      expect(result).toBe(cachedResponse);
      expect(productRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('should invalidate entity key and list pattern after update succeeds', async () => {
      productRepo.findOne.mockResolvedValue({
        id: PRODUCT_ID,
        name: 'T-Shirt',
        skuPrefix: 'TSH',
        category: { id: CATEGORY_ID },
        isActive: true,
      });
      productRepo.save.mockImplementation((p) => Promise.resolve(p));

      await service.update(TENANT_ID, PRODUCT_ID, { name: 'Polo Shirt' });

      expect(productRepo.save).toHaveBeenCalled();
      expect(cache.del).toHaveBeenCalledWith(
        CacheKeys.product(TENANT_ID, PRODUCT_ID),
      );
      expect(cache.delByPattern).toHaveBeenCalledWith(
        CacheKeys.productsPattern(TENANT_ID),
      );
    });

    it('should not invalidate caches when update fails', async () => {
      productRepo.findOne.mockResolvedValue({
        id: PRODUCT_ID,
        name: 'T-Shirt',
        skuPrefix: 'TSH',
        category: { id: CATEGORY_ID },
        isActive: true,
      });
      productRepo.save.mockRejectedValue(new Error('db down'));

      await expect(
        service.update(TENANT_ID, PRODUCT_ID, { name: 'X' }),
      ).rejects.toThrow('db down');

      expect(cache.del).not.toHaveBeenCalled();
      expect(cache.delByPattern).not.toHaveBeenCalled();
    });

    it('should invalidate entity key and list pattern after delete succeeds', async () => {
      productRepo.findOne.mockResolvedValue({ id: PRODUCT_ID });
      const variantRepo = { count: jest.fn().mockResolvedValue(0) };
      productRepo.manager.getRepository.mockReturnValue(variantRepo);
      productRepo.softRemove.mockResolvedValue(undefined);

      await service.remove(TENANT_ID, PRODUCT_ID);

      expect(productRepo.softRemove).toHaveBeenCalled();
      expect(cache.del).toHaveBeenCalledWith(
        CacheKeys.product(TENANT_ID, PRODUCT_ID),
      );
      expect(cache.delByPattern).toHaveBeenCalledWith(
        CacheKeys.productsPattern(TENANT_ID),
      );
    });

    it('should invalidate list pattern after create succeeds', async () => {
      categoryService.findOne.mockResolvedValue({ id: CATEGORY_ID });

      const qb = mockQueryBuilder();
      qb.getExists.mockResolvedValue(false);
      productRepo.createQueryBuilder.mockReturnValue(qb);

      const savedProduct = { id: PRODUCT_ID, name: 'New' };
      productRepo.create.mockReturnValue(savedProduct);
      productRepo.save.mockResolvedValue(savedProduct);

      await service.create(TENANT_ID, {
        name: 'New',
        categoryId: CATEGORY_ID,
        skuPrefix: 'NEW',
      });

      expect(cache.delByPattern).toHaveBeenCalledWith(
        CacheKeys.productsPattern(TENANT_ID),
      );
    });
  });
});
