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

    await this.categoryRepo.save(category);

    try {
      await this.categoryRepo.save(category);
      return category;
    } catch (err) {
      if (err.code === '23505') {
        // PG unique_violation
        throw new ConflictException(
          'The provided slug must be unique per-tenant',
        );
      }
      throw err;
    }
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
}
