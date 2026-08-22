import { IsEnum, IsNotEmpty } from 'class-validator';
import { TenantStatus } from '../../tenant/entities/tenant.entity';

export class UpdateTenantStatusDto {
  @IsEnum(TenantStatus)
  @IsNotEmpty()
  status: TenantStatus;
}
