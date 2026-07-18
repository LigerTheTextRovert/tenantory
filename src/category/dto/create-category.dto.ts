import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({
    description: 'Display name of the category',
    example: 'Electronics',
    minLength: 1,
    maxLength: 120,
  })
  @IsNotEmpty()
  @IsString()
  @Min(1)
  @Max(120)
  name!: string;

  @ApiPropertyOptional({
    description: 'URL-friendly slug. Auto-generated from name if omitted.',
    example: 'electronics',
    maxLength: 150,
  })
  @IsOptional()
  @IsString()
  @Max(150)
  slug?: string;

  @ApiPropertyOptional({
    description: 'UUID of the parent category. Omit to create a root category.',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsOptional()
  @IsUUID()
  parentId?: string;
}
