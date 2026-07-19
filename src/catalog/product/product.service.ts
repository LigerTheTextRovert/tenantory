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
import { isUniqueViolation } from '../../common/utils/assert-unique.util';
import { ProductQueryDto } from './dto/product-query.dto';
import { PaginatedResponse } from '../../common/interfaces/paginated-response.interface';
import { NotFoundError } from 'rxjs';

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
    const { page, limit, categoryId, search, isActive, sortBy, sortOrder } =
      query;
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

    qb.orderBy(`p.${sortBy}`, sortOrder);
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
