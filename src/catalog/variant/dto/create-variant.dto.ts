import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateVariantDto {
  @ApiProperty({
    description: 'Stock Keeping Unit identifier (unique within tenant)',
    example: 'TSH-BLU-M',
    minLength: 3,
    maxLength: 100,
  })
  @IsNotEmpty()
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  sku!: string;

  @ApiProperty({
    description: 'Unit price for this variant',
    example: 29.99,
    minimum: 0,
    exclusiveMinimum: true,
  })
  @Type(() => Number)
  @IsNotEmpty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  price!: number;

  @ApiPropertyOptional({
    description: 'Dynamic key-value attributes (e.g., color, size, material)',
    example: { color: 'blue', size: 'M' },
    default: {},
  })
  @IsOptional()
  @IsObject()
  @IsNotEmpty()
  @Transform(({ value }): Record<string, string> =>
    value === undefined ? {} : (value as Record<string, string>),
  )
  attributes?: Record<string, string> = {};
}
