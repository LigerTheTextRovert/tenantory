import { PartialType, OmitType } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CreateProductDto } from './create-product.dto';

/**
 * All fields optional for partial update.
 *
 * NOTE: skuPrefix should NOT be changed after creation since existing
 * variant SKUs are constructed from it. The service layer enforces
 * this by throwing ConflictException on skuPrefix changes.
 */
export class UpdateProductDto extends PartialType(
  OmitType(CreateProductDto, ['description'] as const),
) {
  @ApiPropertyOptional({
    description: 'Product description (explicit null clears it)',
    example: 'A comfortable cotton t-shirt',
    maxLength: 5000,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string | null;
}
