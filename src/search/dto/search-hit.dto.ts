import { ApiProperty } from '@nestjs/swagger';
import { Product } from '../../catalog/entities/product.entity';
import { ProductVariant } from '../../catalog/entities/product-variant.entity';

export class ProductHitDto {
  @ApiProperty({
    description: 'Trigram similarity score (0-1), higher is more relevant',
    example: 0.87,
  })
  score!: number;

  @ApiProperty({ type: () => Product })
  product!: Product;
}

export class VariantHitDto {
  @ApiProperty({
    description: 'Trigram similarity score (0-1), higher is more relevant',
    example: 0.92,
  })
  score!: number;

  @ApiProperty({ type: () => ProductVariant })
  variant!: ProductVariant;
}
