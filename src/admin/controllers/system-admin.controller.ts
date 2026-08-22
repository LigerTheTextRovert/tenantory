import {
  Body,
  Controller,
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
import { TenantProvisioningService } from '../services/tenant-provisioning.service';
import { CreateTenantDto } from '../dto/create-tenant.dto';
import { UpdateTenantStatusDto } from '../dto/update-tenant-status.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RoleGuard } from '../../auth/guards/role.guard';
import { Roles } from '../../auth/decorators/auth.decorator';
import { UserRole } from '../../auth/enum/user-role.enum';

@ApiTags('System Admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard, RoleGuard)
@Roles(UserRole.SUPER_ADMIN)
export class SystemAdminController {
  constructor(
    private readonly tenantProvisioningService: TenantProvisioningService,
  ) {}

  @Post('tenants')
  @ApiOperation({ summary: 'Provision a new tenant' })
  @ApiResponse({ status: 201, description: 'Tenant provisioned successfully' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 409, description: 'Conflict' })
  async createTenant(@Body() createTenantDto: CreateTenantDto) {
    const tenant =
      await this.tenantProvisioningService.createTenant(createTenantDto);
    return {
      message: 'Tenant provisioned successfully',
      tenantId: tenant.id,
    };
  }

  @Patch('tenants/:id/status')
  @ApiOperation({ summary: 'Update tenant status' })
  @ApiResponse({
    status: 200,
    description: 'Tenant status updated successfully',
  })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  async updateTenantStatus(
    @Param('id') tenantId: string,
    @Body() updateDto: UpdateTenantStatusDto,
  ) {
    const tenant = await this.tenantProvisioningService.updateTenantStatus(
      tenantId,
      updateDto.status,
    );
    return {
      message: 'Tenant status updated successfully',
      status: tenant.status,
    };
  }
}
