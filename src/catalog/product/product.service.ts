import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Product } from '../entities/product.entity';
import { IsNull, Repository } from 'typeorm';
import { CategoryService } from '../../category/category.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { isUniqueViolation } from '../../common/utils/assert-unique.util';
import { ProductQueryDto } from './dto/product-query.dto';
import { PaginatedResponse } from '../../common/interfaces/paginated-response.interface';
import { ProductVariant } from '../entities/product-variant.entity';

@Injectable()
export class ProductService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    private readonly categoryService: CategoryService,
  ) {}

  async create(tenantId: string, dto: CreateProductDto): Promise<Product> {
    await this.categoryService.findOne(tenantId, dto.categoryId);
    await this.assertSkuUniqueness(dto.skuPrefix, tenantId);

    const newProduct = this.productRepo.create({
      name: dto.name,
      skuPrefix: dto.skuPrefix,
      category: { id: dto.categoryId },
      tenantId: tenantId,
      tenant: { id: tenantId },
      isActive: dto.isActive,
      description: dto.description,
    });

    try {
      const result = await this.productRepo.save(newProduct);
      return result;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'The provided SKU must be unique per-tenant',
        );
      }
      throw error;
    }
  }

  async findAll(
    tenantId: string,
    query: ProductQueryDto,
  ): Promise<PaginatedResponse<Product>> {
    const { categoryId, search, isActive, sortBy, sortOrder } = query;
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const qb = this.productRepo
      .createQueryBuilder('p')
      .where('p.tenant_id = :tenantId', { tenantId })
      .andWhere('p.deleted_at IS NULL');

    if (search) {
      qb.andWhere('p.name ILIKE :search', { search: `%${search}%` });
    }

    if (categoryId) {
      qb.andWhere('p.category_id = :categoryId', { categoryId });
    }

    if (isActive !== undefined) {
      qb.andWhere('p.is_active = :isActive', {
        isActive: isActive === 'true',
      });
    }

    const sortColumns: Record<string, string> = {
      name: 'p.name',
      created_at: 'p.created_at',
      updated_at: 'p.updated_at',
    };

    qb.orderBy(sortColumns[sortBy as string], sortOrder);

    const [data, totalItems] = await qb
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    const totalPages = Math.ceil(totalItems / limit) || 1;
    const currentPage = page;
    const itemCount = data.length;

    const buildLink = (targetPage: number): string =>
      `/api/v1/products?page=${targetPage}&limit=${limit}`;

    return {
      data,
      meta: {
        totalItems,
        itemCount,
        itemsPerPage: limit,
        totalPages,
        currentPage,
      },
      links: {
        first: buildLink(1),
        previous: currentPage > 1 ? buildLink(currentPage - 1) : null,
        next: currentPage < totalPages ? buildLink(currentPage + 1) : null,
        last: buildLink(totalPages),
      },
    };
  }

  async findOne(tenantId: string, id: string): Promise<Product> {
    const product = await this.productRepo.findOne({
      where: {
        id,
        tenant: { id: tenantId },
        deletedAt: IsNull(),
      },
      relations: { category: true, variants: true },
    });

    if (!product) {
      throw new NotFoundException(
        `There is no product with ID ${id} in tenant ${tenantId}`,
      );
    }

    return product;
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateProductDto,
  ): Promise<Product> {
    const product = await this.findOne(tenantId, id);

    if (dto.skuPrefix && dto.skuPrefix !== product.skuPrefix) {
      throw new ConflictException(
        'Cannot change skuPrefix after creation. Existing variant SKUs depend on this prefix.',
      );
    }

    if (dto.categoryId) {
      await this.categoryService.findOne(tenantId, dto.categoryId);
      product.category = { id: dto.categoryId } as Product['category'];
    }

    if (dto.name !== undefined) {
      product.name = dto.name;
    }

    if (dto.description !== undefined) {
      product.description = dto.description;
    }

    if (dto.isActive !== undefined) {
      product.isActive = dto.isActive;
    }

    try {
      return await this.productRepo.save(product);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'The provided SKU must be unique per-tenant',
        );
      }
      throw error;
    }
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const product = await this.findOne(tenantId, id);

    const variantCount = await this.productRepo.manager
      .getRepository(ProductVariant)
      .count({
        where: {
          product: { id: product.id },
          tenant: { id: tenantId },
          deletedAt: IsNull(),
        },
      });

    if (variantCount > 0) {
      throw new ConflictException(
        'Cannot delete product that has variants. Delete or reassign all variants first.',
      );
    }

    await this.productRepo.softRemove(product);
  }

  async assertSkuUniqueness(skuPrefix: string, tenantId: string) {
    const qb = this.productRepo
      .createQueryBuilder('p')
      .where('p.tenant_id = :tenantId', { tenantId })
      .andWhere('p.sku_prefix = :skuPrefix', { skuPrefix })
      .andWhere('p.deleted_at IS NULL');

    const exist = await qb.getExists();

    if (exist) {
      throw new ConflictException('The provided SKU already exist');
    }
  }
}
