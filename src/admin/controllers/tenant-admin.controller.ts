import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RoleGuard } from '../../auth/guards/role.guard';
import { Roles } from '../../auth/decorators/auth.decorator';
import { UserRole } from '../../auth/enum/user-role.enum';
import { TenantDecorator } from '../../common/decorators/tenant.decorator';
import { TenantSettingService } from '../services/tenant-settings.service';
import { TenantUserManagementService } from '../services/tenant-user-management.service';
import { UpdateSettingsDto } from '../dto/update-settings.dto';
import { InviteUserDto } from '../dto/invite-user.dto';
import { UpdateUserRoleDto } from '../dto/update-user-role.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, RoleGuard)
@Roles(UserRole.TENANT_ADMIN)
export class TenantAdminController {
  constructor(
    private readonly tenantSettingService: TenantSettingService,
    private readonly tenantUserManagementService: TenantUserManagementService,
  ) {}

  @Get('settings')
  async getSettings(@TenantDecorator('id') tenantId: string) {
    return this.tenantSettingService.getSettings(tenantId);
  }

  @Patch('settings')
  async updateSettings(
    @TenantDecorator('id') tenantId: string,
    @Body() updateSettingsDto: UpdateSettingsDto,
  ) {
    return this.tenantSettingService.updateSettings(
      tenantId,
      updateSettingsDto,
    );
  }

  @Post('users/invite')
  async inviteUser(
    @TenantDecorator('id') tenantId: string,
    @Body() inviteUserDto: InviteUserDto,
  ) {
    const user = await this.tenantUserManagementService.inviteUser(
      tenantId,
      inviteUserDto,
    );
    return {
      message: 'User invited successfully',
      userId: user.id,
    };
  }

  @Patch('users/:userId/role')
  async updateUserRole(
    @TenantDecorator('id') tenantId: string,
    @Param('userId') userId: string,
    @Body() updateUserRoleDto: UpdateUserRoleDto,
  ) {
    const user = await this.tenantUserManagementService.updateUserRole(
      tenantId,
      userId,
      updateUserRoleDto,
    );
    return {
      message: 'User role updated successfully',
      userId: user.id,
      role: user.role,
    };
  }
}
