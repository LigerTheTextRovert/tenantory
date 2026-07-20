import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { TenantStatus } from '../entities/tenant.entity';

export class CreateTenantDto {
  @ApiProperty({
    description: 'Unique domain name for the tenant',
    example: 'acme.example.com',
    maxLength: 255,
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  domainName!: string;

  @ApiProperty({
    description: 'Business display name',
    example: 'Acme Corp',
    maxLength: 255,
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  businessName!: string;

  @ApiProperty({
    description: 'Tenant account status',
    enum: TenantStatus,
    default: TenantStatus.ACTIVE,
  })
  @IsEnum(TenantStatus)
  status: TenantStatus = TenantStatus.ACTIVE;
}
