import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { User } from '../auth/entities/user.entity';
import { Tenant } from '../tenant/entities/tenant.entity';
import { SystemAdminController } from './controllers/system-admin.controller';
import { TenantAdminController } from './controllers/tenant-admin.controller';
import { TenantSetting } from './entities/tenant-setting.entity';
import { TenantProvisioningService } from './services/tenant-provisioning.service';
import { TenantSettingService } from './services/tenant-settings.service';
import { TenantUserManagementService } from './services/tenant-user-management.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([TenantSetting, User, Tenant]),
		AuditModule,
	],
	controllers: [SystemAdminController, TenantAdminController],
	providers: [
		TenantSettingService,
		TenantProvisioningService,
		TenantUserManagementService,
	],
})
export class AdminModule {}
