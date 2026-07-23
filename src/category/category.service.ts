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

@Injectable()
export class CategoryService {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
  ) {}

  async create(tenantId: string, dto: CreateCategoryDto): Promise<Category> {
    const slug = dto.slug ? generateSlug(dto.slug) : generateSlug(dto.name);
    let parent: Category | null;

    await this.assertSlugUnique(tenantId, slug);

    if (dto.parentId) {
      parent = await this.assertParentExists(tenantId, dto.parentId);
    }

    const category = this.categoryRepo.create({
      name: dto.name,
      slug: slug,
      tenant: { id: tenantId } as Tenant,
      parent: parent ?? undefined,
    });

    try {
      await this.categoryRepo.save(category);
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
    const skip = (query.page - 1) * query.limit;
    const qb = this.categoryRepo
      .createQueryBuilder('category')
      .where('category.tenant_id = :tenantId', { tenantId });

    if (query.search) {
      qb.andWhere('category.name ILIKE :search', {
        search: `%${query.search}%`,
      });
    }

    if (query.parentId) {
      if (query.parentId === null || query.parentId === '') {
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

    // We already handled the default value in category query dto
    qb.orderBy(`category.${query.sortBy}`, query.sortOrder);

    const [data, counts] = await qb
      .skip(skip)
      .limit(query.limit)
      .getManyAndCount();

    const meta: PaginationMeta = {
      totalItems: counts,
      itemCount: data.length,
      totalPages: Math.ceil(counts / query.limit),
      itemsPerPage: query.limit,
      currentPage: query.page,
    };

    const links: PaginationLinks = {
      last: this.createLink(meta.totalPages, query.limit),
      first: this.createLink(1, query.limit),
      previous:
        query.page > 1 ? this.createLink(query.page - 1, query.limit) : null,
      next:
        query.page < meta.totalPages
          ? this.createLink(query.page + 1, query.limit)
          : null,
    };

    const paginationResult: PaginatedResponse<Category> = {
      data,
      meta,
      links,
    };

    return paginationResult;
  }

  async findTree(tenantId: string): Promise<Category[]> {
    const result = await this.categoryRepo.find({
      where: {
        tenant: { id: tenantId },
        deletedAt: IsNull(),
      },
      order: { name: 'ASC' },
    });

    if (!result) {
      throw new NotFoundException(
        `There is no category for tenant ${tenantId}`,
      );
    }

    return this.buildTree(result);
  }

  async findOne(tenantId: string, id: string): Promise<Category> {
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
        await this.assertParentExists(tenantId, dto.parentId);
      }
      target.parent = dto.parentId ? ({ id: dto.parentId } as Category) : null;
    }

    try {
      return await this.categoryRepo.save(target);
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

    const exist = await qb.getExists();
    if (exist) {
      throw new ConflictException(
        'the provided slug must be unique per-tenant',
      );
    }
  }

  private async assertParentExists(
    tenantId: string,
    parentId: string,
  ): Promise<Category | null> {
    const exist = await this.categoryRepo.findOne({
      where: {
        id: parentId,
        tenant: { id: tenantId },
        deletedAt: IsNull(),
      },
    });

    if (!exist) {
      throw new NotFoundException(
        `Parent category with ID "${parentId}" not found`,
      );
    }

    return exist;
  }

  private buildTree(categories: Category[]): Category[] {
    const map = new Map<string, Category>();

    categories.forEach((category) =>
      map.set(category.id, { ...category, children: [] }),
    );

    const roots: Category[] = [];

    for (const category of categories) {
      const node = map.get(category.id);

      if (category.parent?.id) {
        map.get(category.parent.id)?.children.push(node);
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
