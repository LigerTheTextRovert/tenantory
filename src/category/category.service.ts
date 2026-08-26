import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Category } from './entities/category.entity';
import { IsNull, Repository } from 'typeorm';
import { CreateCategoryDto } from './dto/create-category.dto';
import { generateSlug } from '../common/utils/slug.util';
import { Tenant } from '../tenant/entities/tenant.entity';
import { CategoryQueryDto } from './dto/category-query.dto';
import {
  PaginatedResponse,
  PaginationMeta,
  PaginationLinks,
} from '../common/interfaces/paginated-response.interface';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { isUniqueViolation } from '../common/utils/assert-unique.util';
import { CacheService } from '../common/services/cache.service';
import { CACHE_TTL, CacheKeys } from '../common/constants/cache.constants';

@Injectable()
export class CategoryService {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
    private readonly cache: CacheService,
  ) {}

  async create(tenantId: string, dto: CreateCategoryDto): Promise<Category> {
    const slug = dto.slug ? generateSlug(dto.slug) : generateSlug(dto.name);
    await this.assertSlugUnique(tenantId, slug);

    let parent: Category | undefined;
    if (dto.parentId) {
      parent = await this.assertParentExists(tenantId, dto.parentId);
    }

    const categoryData: Partial<Category> = {
      name: dto.name,
      slug: slug,
      tenant: { id: tenantId } as Tenant,
    };

    if (parent) {
      categoryData.parent = parent;
    }

    const category = this.categoryRepo.create(categoryData);

    try {
      await this.categoryRepo.save(category);
      await this.invalidateCollections(tenantId);
      return category;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          'The provided slug must be unique per-tenant',
        );
      }
      throw err;
    }
  }

  async findAll(
    tenantId: string,
    query: CategoryQueryDto,
  ): Promise<PaginatedResponse<Category>> {
    const cacheKey = CacheKeys.categoriesList(tenantId, query);
    const cached = await this.cache.get<PaginatedResponse<Category>>(cacheKey);
    if (cached) {
      return cached;
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const qb = this.categoryRepo
      .createQueryBuilder('category')
      .where('category.tenant_id = :tenantId', { tenantId });

    if (query.search) {
      qb.andWhere('category.name ILIKE :search', {
        search: `%${query.search}%`,
      });
    }

    if (query.parentId !== undefined && query.parentId !== null) {
      if (query.parentId === '') {
        qb.andWhere('category.deleted_at IS NULL');
      } else {
        qb.andWhere('category.parent_id = :parentId', {
          parentId: query.parentId,
        });
      }
    }

    if (query.includeChildren === 'true') {
      qb.leftJoinAndSelect('category.children', 'children');
    }

    const sortBy = query.sortBy ?? 'name';
    const sortOrder = query.sortOrder ?? 'ASC';
    qb.orderBy(`category.${sortBy}`, sortOrder);

    const [data, counts] = await qb.skip(skip).limit(limit).getManyAndCount();

    const totalPages = Math.ceil(counts / limit);

    const meta: PaginationMeta = {
      totalItems: counts,
      itemCount: data.length,
      totalPages: totalPages,
      itemsPerPage: limit,
      currentPage: page,
    };

    const links: PaginationLinks = {
      last: this.createLink(totalPages, limit),
      first: this.createLink(1, limit),
      previous: page > 1 ? this.createLink(page - 1, limit) : null,
      next: page < totalPages ? this.createLink(page + 1, limit) : null,
    };

    const response: PaginatedResponse<Category> = {
      data,
      meta,
      links,
    };

    await this.cache.set(cacheKey, response, CACHE_TTL.CATEGORY);

    return response;
  }

  async findTree(tenantId: string): Promise<Category[]> {
    const cacheKey = CacheKeys.categoriesTree(tenantId);
    const cached = await this.cache.get<Category[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await this.categoryRepo.find({
      where: {
        tenant: { id: tenantId },
        deletedAt: IsNull(),
      },
      order: { name: 'ASC' },
    });

    if (result.length === 0) {
      throw new NotFoundException(
        `There is no category for tenant ${tenantId}`,
      );
    }

    const tree = this.buildTree(result);
    await this.cache.set(cacheKey, tree, CACHE_TTL.CATEGORY);

    return tree;
  }

  async findOne(tenantId: string, id: string): Promise<Category> {
    const cacheKey = CacheKeys.category(tenantId, id);
    const cached = await this.cache.get<Category>(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await this.categoryRepo.findOne({
      where: {
        id,
        tenant: { id: tenantId },
        deletedAt: IsNull(),
      },
      relations: { parent: true, children: true },
    });

    if (!result) {
      throw new NotFoundException(
        `Category with ID "${id}" not found for tenant ${tenantId}`,
      );
    }

    await this.cache.set(cacheKey, result, CACHE_TTL.CATEGORY);

    return result;
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateCategoryDto,
  ): Promise<Category> {
    const target = await this.findOne(tenantId, id);

    if (dto.name) {
      target.name = dto.name;
    }

    if (dto.slug) {
      target.slug = generateSlug(dto.slug);
    } else if (dto.name && !dto.slug) {
      target.slug = generateSlug(dto.name);
    }

    await this.assertSlugUnique(tenantId, target.slug, id);

    if (dto.parentId !== undefined) {
      if (dto.parentId === id) {
        throw new ConflictException('A category cannot be its own parent');
      }

      if (dto.parentId) {
        const parent = await this.assertParentExists(tenantId, dto.parentId);
        target.parent = parent;
      } else {
        target.parent = null;
      }
    }

    try {
      const saved = await this.categoryRepo.save(target);
      await this.cache.del(CacheKeys.category(tenantId, id));
      await this.invalidateCollections(tenantId);
      return saved;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'The provided slug must be unique per-tenant',
        );
      }
      throw error;
    }
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const target = await this.findOne(tenantId, id);

    const numberOfChildren = await this.categoryRepo.count({
      where: { parent: { id }, tenant: { id: tenantId } },
    });

    if (numberOfChildren > 0) {
      throw new ConflictException(
        `Cannot delete category "${id}" because it has child categories. Please delete or reassign all child categories first.`,
      );
    }

    await this.categoryRepo.softRemove(target);
    await this.cache.del(CacheKeys.category(tenantId, id));
    await this.invalidateCollections(tenantId);
  }

  private async invalidateCollections(tenantId: string): Promise<void> {
    await this.cache.delByPattern(CacheKeys.categoriesPattern(tenantId));
    await this.cache.delByPattern(CacheKeys.productsPattern(tenantId));
  }

  private async assertSlugUnique(
    tenantId: string,
    slug: string,
    excludeId?: string,
  ): Promise<void> {
    const qb = this.categoryRepo
      .createQueryBuilder('category')
      .where('category.tenant_id = :tenantId', { tenantId })
      .andWhere('category.slug = :slug', { slug })
      .andWhere('category.deleted_at IS NULL');

    if (excludeId) {
      qb.andWhere('category.id != :excludeId', { excludeId });
    }

    const exists = await qb.getExists();
    if (exists) {
      throw new ConflictException(
        'The provided slug must be unique per-tenant',
      );
    }
  }

  private async assertParentExists(
    tenantId: string,
    parentId: string,
  ): Promise<Category> {
    const parent = await this.categoryRepo.findOne({
      where: {
        id: parentId,
        tenant: { id: tenantId },
        deletedAt: IsNull(),
      },
    });

    if (!parent) {
      throw new NotFoundException(
        `Parent category with ID "${parentId}" not found`,
      );
    }

    return parent; // Return the actual entity, not nullable
  }

  private buildTree(categories: Category[]): Category[] {
    const map = new Map<string, Category & { children: Category[] }>();

    for (const category of categories) {
      map.set(category.id, {
        ...category,
        children: [],
      });
    }

    const roots: Category[] = [];

    for (const category of categories) {
      const node = map.get(category.id);
      if (!node) continue;

      if (category.parent?.id) {
        const parentNode = map.get(category.parent.id);
        if (parentNode) {
          parentNode.children.push(node);
        }
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  private createLink(page: number, limit: number): string {
    return `/api/v1/categories?page=${page}&limit=${limit}`;
  }
}
