import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Product } from '../entities/product.entity';
import { Repository } from 'typeorm';
import { CategoryService } from '../../category/category.service';
import { CreateProductDto } from './dto/create-product.dto';
import { isUniqueViolation } from '../../common/utils/assert-unique.util';

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

  async assertSkuUniqueness(skuPrefix: string, tenantId: string) {
    const qb = this.productRepo
      .createQueryBuilder('p')
      .where('tenant_id = :tenantId', { tenantId })
      .andWhere('sku_prefix = :skuPrefix', { skuPrefix })
      .andWhere('deleted_at IS NULL');

    const exist = await qb.getExists();

    if (!exist) {
      throw new ConflictException('The provided SKU already exist');
    }
  }
}
