import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantSetting } from './entities/tenant-setting.entity';
import { User } from '../auth/entities/user.entity';
import { TenantSettingService } from './services/tenant-settings.service';
import { TenantProvisioningService } from './services/tenant-provisioning.service';
import { SystemAdminController } from './controllers/system-admin.controller';
import { TenantAdminController } from './controllers/tenant-admin.controller';
import { TenantUserManagementService } from './services/tenant-user-management.service';

@Module({
  imports: [TypeOrmModule.forFeature([TenantSetting, User])],
  controllers: [SystemAdminController, TenantAdminController],
  providers: [
    TenantSettingService,
    TenantProvisioningService,
    TenantUserManagementService,
  ],
})
export class AdminModule {}
