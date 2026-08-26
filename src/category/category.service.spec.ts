import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { IsNull } from 'typeorm';
import { CategoryService } from './category.service';
import { Category } from './entities/category.entity';
import { CategoryQueryDto } from './dto/category-query.dto';
import { CacheService } from '../common/services/cache.service';
import { CACHE_TTL, CacheKeys } from '../common/constants/cache.constants';

describe('CategoryService', () => {
  let service: CategoryService;
  let categoryRepo: {
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
    count: jest.Mock;
    softRemove: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let cache: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
    delByPattern: jest.Mock;
    ttl: jest.Mock;
  };

  const TENANT_ID = '550e8400-e29b-41d4-a716-446655440000';
  const CATEGORY_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  const PARENT_ID = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';

  const mockQueryBuilder = () => ({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(),
    getExists: jest.fn(),
  });

  beforeEach(async () => {
    const qb = mockQueryBuilder();

    categoryRepo = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      count: jest.fn(),
      softRemove: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(qb),
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
        CategoryService,
        { provide: getRepositoryToken(Category), useValue: categoryRepo },
        { provide: CacheService, useValue: cache },
      ],
    }).compile();

    service = module.get<CategoryService>(CategoryService);
  });

  describe('create', () => {
    it('should create a category with auto-generated slug from name', async () => {
      const qb = mockQueryBuilder();
      qb.getExists.mockResolvedValue(false);
      categoryRepo.createQueryBuilder.mockReturnValue(qb);

      const dto = { name: 'Electronics' };
      const createdCategory = {
        id: CATEGORY_ID,
        name: 'Electronics',
        slug: 'electronics',
        tenant: { id: TENANT_ID },
      };
      categoryRepo.create.mockReturnValue(createdCategory);
      categoryRepo.save.mockResolvedValue(createdCategory);

      const result = await service.create(TENANT_ID, dto);

      expect(categoryRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Electronics',
          slug: 'electronics',
        }),
      );
      expect(result.name).toBe('Electronics');
      expect(result.slug).toBe('electronics');
    });

    it('should create a category with explicit slug when provided', async () => {
      const qb = mockQueryBuilder();
      qb.getExists.mockResolvedValue(false);
      categoryRepo.createQueryBuilder.mockReturnValue(qb);

      const dto = { name: 'Electronics', slug: 'ELECTRONICS' };
      const createdCategory = {
        id: CATEGORY_ID,
        name: 'Electronics',
        slug: 'electronics',
        tenant: { id: TENANT_ID },
      };
      categoryRepo.create.mockReturnValue(createdCategory);
      categoryRepo.save.mockResolvedValue(createdCategory);

      await service.create(TENANT_ID, dto);

      expect(categoryRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          slug: 'electronics',
        }),
      );
    });

    it('should throw ConflictException when slug already exists', async () => {
      const qb = mockQueryBuilder();
      qb.getExists.mockResolvedValue(true);
      categoryRepo.createQueryBuilder.mockReturnValue(qb);

      const dto = { name: 'Electronics' };

      await expect(service.create(TENANT_ID, dto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw ConflictException on DB unique violation (23505)', async () => {
      const qb = mockQueryBuilder();
      qb.getExists.mockResolvedValue(false);
      categoryRepo.createQueryBuilder.mockReturnValue(qb);

      categoryRepo.create.mockReturnValue({ id: CATEGORY_ID });
      categoryRepo.save.mockRejectedValue(
        Object.assign(new Error('duplicate key'), { code: '23505' }),
      );

      const dto = { name: 'Electronics' };

      await expect(service.create(TENANT_ID, dto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should create category with parentId when parent exists', async () => {
      const qb = mockQueryBuilder();
      qb.getExists.mockResolvedValue(false);
      categoryRepo.createQueryBuilder.mockReturnValue(qb);

      categoryRepo.findOne.mockResolvedValue({
        id: PARENT_ID,
        name: 'Root',
      });

      const dto = { name: 'Phones', parentId: PARENT_ID };
      const createdCategory = {
        id: CATEGORY_ID,
        name: 'Phones',
        slug: 'phones',
        parent: { id: PARENT_ID },
      };
      categoryRepo.create.mockReturnValue(createdCategory);
      categoryRepo.save.mockResolvedValue(createdCategory);

      const result = await service.create(TENANT_ID, dto);

      expect(result.parent).toEqual({ id: PARENT_ID });
    });

    it('should throw NotFoundException when parent does not exist', async () => {
      const qb = mockQueryBuilder();
      qb.getExists.mockResolvedValue(false);
      categoryRepo.createQueryBuilder.mockReturnValue(qb);

      categoryRepo.findOne.mockResolvedValue(null);

      const dto = { name: 'Phones', parentId: PARENT_ID };

      await expect(service.create(TENANT_ID, dto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findAll', () => {
    it('should return paginated response with correct meta and links', async () => {
      const qb = mockQueryBuilder();
      const data = [{ id: 'c1', name: 'Category 1' }];
      qb.getManyAndCount.mockResolvedValue([data, 1]);
      categoryRepo.createQueryBuilder.mockReturnValue(qb);

      const query: CategoryQueryDto = {
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
      expect(result.links.first).toBe('/api/v1/categories?page=1&limit=20');
      expect(result.links.last).toBe('/api/v1/categories?page=1&limit=20');
      expect(result.links.previous).toBeNull();
      expect(result.links.next).toBeNull();
    });

    it('should apply search filter on name', async () => {
      const qb = mockQueryBuilder();
      qb.getManyAndCount.mockResolvedValue([[], 0]);
      categoryRepo.createQueryBuilder.mockReturnValue(qb);

      const query: CategoryQueryDto = {
        page: 1,
        limit: 20,
        search: 'elec',
        sortBy: 'created_at',
        sortOrder: 'DESC',
      };

      await service.findAll(TENANT_ID, query);

      expect(qb.andWhere).toHaveBeenCalledWith('category.name ILIKE :search', {
        search: '%elec%',
      });
    });

    it('should filter by parentId', async () => {
      const qb = mockQueryBuilder();
      qb.getManyAndCount.mockResolvedValue([[], 0]);
      categoryRepo.createQueryBuilder.mockReturnValue(qb);

      const query: CategoryQueryDto = {
        page: 1,
        limit: 20,
        parentId: PARENT_ID,
        sortBy: 'created_at',
        sortOrder: 'DESC',
      };

      await service.findAll(TENANT_ID, query);

      expect(qb.andWhere).toHaveBeenCalledWith(
        'category.parent_id = :parentId',
        { parentId: PARENT_ID },
      );
    });

    it('should include children when includeChildren is true', async () => {
      const qb = mockQueryBuilder();
      qb.getManyAndCount.mockResolvedValue([[], 0]);
      categoryRepo.createQueryBuilder.mockReturnValue(qb);

      const query: CategoryQueryDto = {
        page: 1,
        limit: 20,
        includeChildren: 'true',
        sortBy: 'created_at',
        sortOrder: 'DESC',
      };

      await service.findAll(TENANT_ID, query);

      expect(qb.leftJoinAndSelect).toHaveBeenCalledWith(
        'category.children',
        'children',
      );
    });

    it('should handle pagination across multiple pages', async () => {
      const qb = mockQueryBuilder();
      const data = [{ id: 'c1' }, { id: 'c2' }];
      qb.getManyAndCount.mockResolvedValue([data, 25]);
      categoryRepo.createQueryBuilder.mockReturnValue(qb);

      const query: CategoryQueryDto = {
        page: 2,
        limit: 10,
        sortBy: 'created_at',
        sortOrder: 'DESC',
      };

      const result = await service.findAll(TENANT_ID, query);

      expect(result.meta.totalItems).toBe(25);
      expect(result.meta.totalPages).toBe(3);
      expect(result.meta.currentPage).toBe(2);
      expect(result.links.previous).toBe('/api/v1/categories?page=1&limit=10');
      expect(result.links.next).toBe('/api/v1/categories?page=3&limit=10');
      expect(qb.skip).toHaveBeenCalledWith(10);
      expect(qb.limit).toHaveBeenCalledWith(10);
    });
  });

  describe('findOne', () => {
    it('should return category by ID', async () => {
      const category = {
        id: CATEGORY_ID,
        name: 'Electronics',
        parent: null,
        children: [],
      };
      categoryRepo.findOne.mockResolvedValue(category);

      const result = await service.findOne(TENANT_ID, CATEGORY_ID);

      expect(result).toEqual(category);
      expect(categoryRepo.findOne).toHaveBeenCalledWith({
        where: {
          id: CATEGORY_ID,
          tenant: { id: TENANT_ID },
          deletedAt: IsNull(),
        },
        relations: { parent: true, children: true },
      });
    });

    it('should throw NotFoundException when category not found', async () => {
      categoryRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne(TENANT_ID, CATEGORY_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    const existingCategory = {
      id: CATEGORY_ID,
      name: 'Electronics',
      slug: 'electronics',
      parent: null,
    };

    beforeEach(() => {
      categoryRepo.findOne.mockResolvedValue({ ...existingCategory });
    });

    it('should update name and regenerate slug', async () => {
      const qb = mockQueryBuilder();
      qb.getExists.mockResolvedValue(false);
      categoryRepo.createQueryBuilder.mockReturnValue(qb);

      categoryRepo.save.mockImplementation((c) => Promise.resolve(c));

      const result = await service.update(TENANT_ID, CATEGORY_ID, {
        name: 'Computing',
      });

      expect(result.name).toBe('Computing');
      expect(result.slug).toBe('computing');
    });

    it('should use explicit slug when provided', async () => {
      const qb = mockQueryBuilder();
      qb.getExists.mockResolvedValue(false);
      categoryRepo.createQueryBuilder.mockReturnValue(qb);

      categoryRepo.save.mockImplementation((c) => Promise.resolve(c));

      const result = await service.update(TENANT_ID, CATEGORY_ID, {
        slug: 'COMPUTING',
      });

      expect(result.slug).toBe('computing');
    });

    it('should throw ConflictException when slug already exists', async () => {
      const qb = mockQueryBuilder();
      qb.getExists.mockResolvedValue(true);
      categoryRepo.createQueryBuilder.mockReturnValue(qb);

      await expect(
        service.update(TENANT_ID, CATEGORY_ID, { name: 'Phones' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should reject self-referencing parent', async () => {
      await expect(
        service.update(TENANT_ID, CATEGORY_ID, { parentId: CATEGORY_ID }),
      ).rejects.toThrow(ConflictException);
    });

    it('should update parentId to a valid parent', async () => {
      const qb = mockQueryBuilder();
      qb.getExists.mockResolvedValue(false);
      categoryRepo.createQueryBuilder.mockReturnValue(qb);

      categoryRepo.findOne
        .mockResolvedValueOnce({
          id: CATEGORY_ID,
          name: 'Electronics',
          slug: 'electronics',
          parent: null,
        })
        .mockResolvedValueOnce({ id: PARENT_ID, name: 'Root' });
      categoryRepo.save.mockImplementation((c) => Promise.resolve(c));

      const result = await service.update(TENANT_ID, CATEGORY_ID, {
        parentId: PARENT_ID,
      });

      expect(result.parent).toEqual(expect.objectContaining({ id: PARENT_ID }));
    });

    it('should set parent to null when parentId is empty string', async () => {
      const qb = mockQueryBuilder();
      qb.getExists.mockResolvedValue(false);
      categoryRepo.createQueryBuilder.mockReturnValue(qb);

      categoryRepo.save.mockImplementation((c) => Promise.resolve(c));

      const result = await service.update(TENANT_ID, CATEGORY_ID, {
        parentId: '',
      });

      expect(result.parent).toBeNull();
    });

    it('should throw NotFoundException when category not found', async () => {
      categoryRepo.findOne.mockResolvedValue(null);

      await expect(
        service.update(TENANT_ID, CATEGORY_ID, { name: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException on DB unique violation', async () => {
      const qb = mockQueryBuilder();
      qb.getExists.mockResolvedValue(false);
      categoryRepo.createQueryBuilder.mockReturnValue(qb);

      categoryRepo.save.mockRejectedValue(
        Object.assign(new Error('duplicate key'), { code: '23505' }),
      );

      await expect(
        service.update(TENANT_ID, CATEGORY_ID, { name: 'X' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    const existingCategory = {
      id: CATEGORY_ID,
      name: 'Electronics',
    };

    it('should soft-delete category when no children exist', async () => {
      categoryRepo.findOne.mockResolvedValue({ ...existingCategory });
      categoryRepo.count.mockResolvedValue(0);

      await service.remove(TENANT_ID, CATEGORY_ID);

      expect(categoryRepo.softRemove).toHaveBeenCalledWith(
        expect.objectContaining({ id: CATEGORY_ID }),
      );
    });

    it('should throw ConflictException when category has children', async () => {
      categoryRepo.findOne.mockResolvedValue({ ...existingCategory });
      categoryRepo.count.mockResolvedValue(3);

      await expect(service.remove(TENANT_ID, CATEGORY_ID)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw NotFoundException when category not found', async () => {
      categoryRepo.findOne.mockResolvedValue(null);

      await expect(service.remove(TENANT_ID, CATEGORY_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findTree', () => {
    it('should return hierarchical tree structure', async () => {
      const categories = [
        {
          id: 'root-1',
          name: 'Electronics',
          parent: null,
        },
        {
          id: 'child-1',
          name: 'Phones',
          parent: { id: 'root-1' },
        },
        {
          id: 'child-2',
          name: 'Laptops',
          parent: { id: 'root-1' },
        },
      ];
      categoryRepo.find.mockResolvedValue(categories);

      const result = await service.findTree(TENANT_ID);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('root-1');
      expect(result[0].children).toHaveLength(2);
    });

    it('should handle flat list (all root categories)', async () => {
      const categories = [
        { id: 'r1', name: 'A', parent: null },
        { id: 'r2', name: 'B', parent: null },
      ];
      categoryRepo.find.mockResolvedValue(categories);

      const result = await service.findTree(TENANT_ID);

      expect(result).toHaveLength(2);
      expect(result[0].children).toHaveLength(0);
      expect(result[1].children).toHaveLength(0);
    });

    it('should throw NotFoundException for empty result', async () => {
      categoryRepo.find.mockResolvedValue([]);

      await expect(service.findTree(TENANT_ID)).rejects.toThrow(
        NotFoundException,
      );
      expect(cache.set).not.toHaveBeenCalled();
    });
  });

  describe('caching', () => {
    it('should return cached category on cache hit without querying the database', async () => {
      const cachedCategory = { id: CATEGORY_ID, name: 'Cached' };
      cache.get.mockResolvedValue(cachedCategory);

      const result = await service.findOne(TENANT_ID, CATEGORY_ID);

      expect(result).toEqual(cachedCategory);
      expect(cache.get).toHaveBeenCalledWith(
        CacheKeys.category(TENANT_ID, CATEGORY_ID),
      );
      expect(categoryRepo.findOne).not.toHaveBeenCalled();
    });

    it('should store database result in cache with category TTL on cache miss', async () => {
      const category = { id: CATEGORY_ID, name: 'Electronics' };
      categoryRepo.findOne.mockResolvedValue(category);

      const result = await service.findOne(TENANT_ID, CATEGORY_ID);

      expect(result).toEqual(category);
      expect(cache.set).toHaveBeenCalledWith(
        CacheKeys.category(TENANT_ID, CATEGORY_ID),
        category,
        CACHE_TTL.CATEGORY,
      );
    });

    it('should not cache when category is not found', async () => {
      categoryRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne(TENANT_ID, CATEGORY_ID)).rejects.toThrow(
        NotFoundException,
      );
      expect(cache.set).not.toHaveBeenCalled();
    });

    it('should return cached paginated list on cache hit without querying the database', async () => {
      const cachedResponse = { data: [], meta: {}, links: {} };
      cache.get.mockResolvedValue(cachedResponse);

      const query: CategoryQueryDto = { page: 1, limit: 10 };
      const result = await service.findAll(TENANT_ID, query);

      expect(result).toBe(cachedResponse);
      expect(categoryRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('should return cached tree on cache hit without querying the database', async () => {
      const cachedTree = [{ id: 'root-1', children: [] }];
      cache.get.mockResolvedValue(cachedTree);

      const result = await service.findTree(TENANT_ID);

      expect(result).toBe(cachedTree);
      expect(cache.get).toHaveBeenCalledWith(
        CacheKeys.categoriesTree(TENANT_ID),
      );
      expect(categoryRepo.find).not.toHaveBeenCalled();
    });

    it('should invalidate entity key and collection patterns after update succeeds', async () => {
      const qb = mockQueryBuilder();
      qb.getExists.mockResolvedValue(false);
      categoryRepo.createQueryBuilder.mockReturnValue(qb);
      categoryRepo.findOne.mockResolvedValue({
        id: CATEGORY_ID,
        name: 'Electronics',
        slug: 'electronics',
        parent: null,
      });
      categoryRepo.save.mockImplementation((c) => Promise.resolve(c));

      await service.update(TENANT_ID, CATEGORY_ID, { name: 'Computing' });

      expect(categoryRepo.save).toHaveBeenCalled();
      expect(cache.del).toHaveBeenCalledWith(
        CacheKeys.category(TENANT_ID, CATEGORY_ID),
      );
      expect(cache.delByPattern).toHaveBeenCalledWith(
        CacheKeys.categoriesPattern(TENANT_ID),
      );
      expect(cache.delByPattern).toHaveBeenCalledWith(
        CacheKeys.productsPattern(TENANT_ID),
      );
    });

    it('should not invalidate caches when update fails', async () => {
      const qb = mockQueryBuilder();
      qb.getExists.mockResolvedValue(false);
      categoryRepo.createQueryBuilder.mockReturnValue(qb);
      categoryRepo.findOne.mockResolvedValue({
        id: CATEGORY_ID,
        name: 'Electronics',
        slug: 'electronics',
        parent: null,
      });
      categoryRepo.save.mockRejectedValue(new Error('db down'));

      await expect(
        service.update(TENANT_ID, CATEGORY_ID, { name: 'X' }),
      ).rejects.toThrow('db down');

      expect(cache.del).not.toHaveBeenCalled();
      expect(cache.delByPattern).not.toHaveBeenCalled();
    });

    it('should invalidate entity key and collection patterns after delete succeeds', async () => {
      categoryRepo.findOne.mockResolvedValue({ id: CATEGORY_ID });
      categoryRepo.count.mockResolvedValue(0);
      categoryRepo.softRemove.mockResolvedValue(undefined);

      await service.remove(TENANT_ID, CATEGORY_ID);

      expect(categoryRepo.softRemove).toHaveBeenCalled();
      expect(cache.del).toHaveBeenCalledWith(
        CacheKeys.category(TENANT_ID, CATEGORY_ID),
      );
      expect(cache.delByPattern).toHaveBeenCalledWith(
        CacheKeys.categoriesPattern(TENANT_ID),
      );
    });

    it('should invalidate collection patterns after create succeeds', async () => {
      const qb = mockQueryBuilder();
      qb.getExists.mockResolvedValue(false);
      categoryRepo.createQueryBuilder.mockReturnValue(qb);

      const created = { id: CATEGORY_ID, name: 'New', slug: 'new' };
      categoryRepo.create.mockReturnValue(created);
      categoryRepo.save.mockResolvedValue(created);

      await service.create(TENANT_ID, { name: 'New' });

      expect(cache.delByPattern).toHaveBeenCalledWith(
        CacheKeys.categoriesPattern(TENANT_ID),
      );
      expect(cache.delByPattern).toHaveBeenCalledWith(
        CacheKeys.productsPattern(TENANT_ID),
      );
    });
  });
});
