import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ProductVariant } from '../entities/product-variant.entity';
import { IsNull, Repository } from 'typeorm';

@Injectable()
export class VariantService {
  constructor(
    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,
  ) {}

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
}
