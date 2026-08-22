import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
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

@ApiTags('Tenant Admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard, RoleGuard)
@Roles(UserRole.TENANT_ADMIN)
export class TenantAdminController {
  constructor(
    private readonly tenantSettingService: TenantSettingService,
    private readonly tenantUserManagementService: TenantUserManagementService,
  ) {}

  @Get('settings')
  @ApiOperation({ summary: 'Get current tenant settings' })
  @ApiResponse({ status: 200, description: 'Return tenant settings' })
  @ApiResponse({ status: 404, description: 'Settings not found' })
  async getSettings(@TenantDecorator('id') tenantId: string) {
    return this.tenantSettingService.getSettings(tenantId);
  }

  @Patch('settings')
  @ApiOperation({ summary: 'Update tenant settings' })
  @ApiResponse({
    status: 200,
    description: 'Tenant settings updated successfully',
  })
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
  @ApiOperation({ summary: 'Invite a new user to the tenant' })
  @ApiResponse({ status: 201, description: 'User invited successfully' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 409, description: 'Conflict' })
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
  @ApiOperation({ summary: 'Update a user role' })
  @ApiResponse({ status: 200, description: 'User role updated successfully' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 404, description: 'User not found' })
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
