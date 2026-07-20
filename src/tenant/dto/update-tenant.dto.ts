import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { TenantStatus } from '../entities/tenant.entity';

export class UpdateTenantDto {
  @ApiPropertyOptional({
    description: 'Unique domain name for the tenant',
    example: 'acme.example.com',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  domainName?: string;

  @ApiPropertyOptional({
    description: 'Business display name',
    example: 'Acme Corp',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  businessName?: string;

  @ApiPropertyOptional({
    description: 'Tenant account status',
    enum: TenantStatus,
  })
  @IsOptional()
  @IsEnum(TenantStatus)
  status?: TenantStatus;
}
