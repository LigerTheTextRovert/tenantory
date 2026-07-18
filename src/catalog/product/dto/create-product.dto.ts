import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CreateProductDto {
  @ApiProperty({
    description: 'Display name of the product',
    example: 'Classic T-Shirt',
    minLength: 1,
    maxLength: 255,
  })
  @IsNotEmpty()
  @IsString()
  @Min(1)
  @Max(255)
  name!: string;

  @ApiPropertyOptional({
    description: 'Product description',
    example: 'A comfortable cotton t-shirt',
    maxLength: 5000,
  })
  @IsOptional()
  @IsString()
  @Max(5000)
  description?: string;

  @ApiProperty({
    description: 'UUID of the category this product belongs to',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsNotEmpty()
  @IsUUID()
  categoryId!: string;

  @ApiProperty({
    description:
      'Tenant-scoped SKU prefix (3 uppercase alphanumeric characters)',
    example: 'TSH',
    pattern: '^[A-Z0-9]{3}$',
  })
  @IsNotEmpty()
  @IsString()
  @Matches(/^[A-Z0-9]{3}$/)
  skuPrefix!: string;

  @ApiPropertyOptional({
    description: 'Whether the product is active',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }): boolean => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value as boolean;
  })
  isActive?: boolean = true;
}
