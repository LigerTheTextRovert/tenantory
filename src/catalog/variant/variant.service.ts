import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ProductVariant } from '../entities/product-variant.entity';
import { IsNull, Repository } from 'typeorm';
import { Product } from '../entities/product.entity';
import { CreateVariantDto } from './dto/create-variant.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { VariantQueryDto } from './dto/variant-query.dto';
import { PaginatedResponse } from '../../common/interfaces/paginated-response.interface';
import { isUniqueViolation } from '../../common/utils/assert-unique.util';

@Injectable()
export class VariantService {
  constructor(
    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
  ) {}

  async create(
    tenantId: string,
    productId: string,
    dto: CreateVariantDto,
  ): Promise<ProductVariant> {
    const product = await this.productRepo.findOne({
      where: {
        id: productId,
        tenant: { id: tenantId },
        deletedAt: IsNull(),
      },
    });

    if (!product) {
      throw new NotFoundException(
        `There is no product in this tenant with this ID: ${productId}`,
      );
    }

    await this.assertSkuUniqueness(tenantId, dto.sku);

    const newVariant = this.variantRepo.create({
      sku: dto.sku,
      price: dto.price,
      attributes: dto.attributes ?? {},
      product: { id: productId },
      tenant: { id: tenantId },
      tenantId,
    });

    try {
      return await this.variantRepo.save(newVariant);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'The provided SKU must be unique per-tenant',
        );
      }
      throw error;
    }
  }

  // helper function for variant validation in other services
  async findOneById(
    tenantId: string,
    variantId: string,
  ): Promise<ProductVariant> {
    const variant = await this.variantRepo.findOne({
      where: { id: variantId, tenant: { id: tenantId }, deletedAt: IsNull() },
    });

    if (!variant) {
      throw new NotFoundException(
        `There is no variant with this Id in tenant ${tenantId}`,
      );
    }

    return variant;
  }

  async findAll(
    tenantId: string,
    productId: string,
    query: VariantQueryDto,
  ): Promise<PaginatedResponse<ProductVariant>> {
    const product = await this.productRepo.findOne({
      where: {
        id: productId,
        tenant: { id: tenantId },
        deletedAt: IsNull(),
      },
    });

    if (!product) {
      throw new NotFoundException(
        `There is no product in this tenant with this ID: ${productId}`,
      );
    }

    const { search, minPrice, maxPrice, sortBy, sortOrder } = query;
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const qb = this.variantRepo
      .createQueryBuilder('v')
      .where('v.tenant_id = :tenantId', { tenantId })
      .andWhere('v.product_id = :productId', { productId })
      .andWhere('v.deleted_at IS NULL');

    if (search) {
      qb.andWhere('v.sku ILIKE :search', { search: `%${search}%` });
    }

    if (minPrice !== undefined) {
      qb.andWhere('v.price >= :minPrice', { minPrice });
    }

    if (maxPrice !== undefined) {
      qb.andWhere('v.price <= :maxPrice', { maxPrice });
    }

    const sortColumns: Record<string, string> = {
      sku: 'v.sku',
      price: 'v.price',
      created_at: 'v.created_at',
      updated_at: 'v.updated_at',
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
      `/api/v1/products/${productId}/variants?page=${targetPage}&limit=${limit}`;

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

  async findOne(
    tenantId: string,
    productId: string,
    variantId: string,
  ): Promise<ProductVariant> {
    const variant = await this.variantRepo.findOne({
      where: {
        id: variantId,
        tenant: { id: tenantId },
        product: { id: productId },
        deletedAt: IsNull(),
      },
    });

    if (!variant) {
      throw new NotFoundException(
        `There is no product variant with ID: ${variantId}`,
      );
    }

    return variant;
  }

  async update(
    tenantId: string,
    productId: string,
    variantId: string,
    dto: UpdateVariantDto,
  ): Promise<ProductVariant> {
    const variant = await this.findOne(tenantId, productId, variantId);

    if (dto.sku && dto.sku !== variant.sku) {
      await this.assertSkuUniqueness(tenantId, dto.sku, variantId);
      variant.sku = dto.sku;
    }

    if (dto.price !== undefined) {
      variant.price = dto.price;
    }

    if (dto.attributes !== undefined) {
      variant.attributes = dto.attributes;
    }

    try {
      return await this.variantRepo.save(variant);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'The provided SKU must be unique per-tenant',
        );
      }
      throw error;
    }
  }

  async remove(
    tenantId: string,
    productId: string,
    variantId: string,
  ): Promise<void> {
    const variant = await this.findOne(tenantId, productId, variantId);
    await this.variantRepo.softRemove(variant);
  }

  private async assertSkuUniqueness(
    tenantId: string,
    sku: string,
    excludeId?: string,
  ): Promise<void> {
    const qb = this.variantRepo
      .createQueryBuilder('v')
      .where('v.tenant_id = :tenantId', { tenantId })
      .andWhere('v.sku = :sku', { sku })
      .andWhere('v.deleted_at IS NULL');

    if (excludeId) {
      qb.andWhere('v.id != :excludeId', { excludeId });
    }

    const exist = await qb.getExists();

    if (exist) {
      throw new ConflictException('The provided SKU already exists');
    }
  }
}
