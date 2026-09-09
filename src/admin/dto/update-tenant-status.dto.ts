import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { TenantStatus } from '../../tenant/entities/tenant.entity';

export class UpdateTenantStatusDto {
	@ApiProperty({
		enum: TenantStatus,
		example: TenantStatus.ACTIVE,
		description: 'The new status of the tenant',
	})
	@IsEnum(TenantStatus)
	@IsNotEmpty()
	status: TenantStatus;
}
