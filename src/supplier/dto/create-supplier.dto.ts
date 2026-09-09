import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateSupplierDto {
  @ApiProperty({
    description: 'Company name of the supplier',
    example: 'Acme Fabrics Ltd.',
    minLength: 1,
    maxLength: 255,
  })
  @IsNotEmpty()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  companyName!: string;

  @ApiPropertyOptional({
    description: 'Primary contact email address',
    example: 'sales@acmefabrics.com',
    maxLength: 255,
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  contactEmail?: string;

  @ApiPropertyOptional({
    description: 'Primary contact phone number',
    example: '+1-555-0199',
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  contactPhone?: string;

  @ApiPropertyOptional({
    description: 'Supplier address',
    example: '123 Industrial Blvd, Suite 400, Portland, OR 97201',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional({
    description: 'Average lead time in days for orders from this supplier',
    example: 14,
    minimum: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  leadTimeDays?: number;
}
