import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RoleGuard } from '../auth/guards/role.guard';
import { Roles } from '../auth/decorators/auth.decorator';
import { UserRole } from '../auth/enum/user-role.enum';
import { TenantDecorator } from '../common/decorators/tenant.decorator';
import { AuditService } from './audit.service';
import { AuditQueryDto } from './dto/audit-query.dto';
import { PaginatedResponse } from '../common/interfaces/paginated-response.interface';
import { AuditLogReadModel } from './audit.service';

@ApiTags('Audit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RoleGuard)
@Roles(UserRole.TENANT_ADMIN, UserRole.AUDITOR)
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get('logs')
  @ApiOperation({
    summary: 'Retrieve paginated audit logs for the current tenant',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (1-indexed)',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (max 100)',
    example: 20,
  })
  @ApiQuery({
    name: 'actorId',
    required: false,
    type: String,
    description: 'Filter by user UUID',
  })
  @ApiQuery({
    name: 'action',
    required: false,
    enum: [
      'CREATE',
      'UPDATE',
      'DELETE',
      'LOGIN',
      'LOGOUT',
      'UPDATE_INVENTORY',
      'DELETE_PRODUCT',
      'UPDATE_ORDER',
      'VIEW_REPORT',
    ],
    description: 'Filter by action',
  })
  @ApiQuery({
    name: 'entityType',
    required: false,
    type: String,
    description: 'Filter by entity type',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    type: String,
    description: 'ISO-8601 start date filter (inclusive)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    type: String,
    description: 'ISO-8601 end date filter (inclusive)',
  })
  @ApiResponse({ status: 200, description: 'Paginated list of audit logs' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires Tenant Admin or Auditor role',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid query parameters (e.g. startDate after endDate)',
  })
  async findLogs(
    @TenantDecorator('id') tenantId: string,
    @Query() query: AuditQueryDto,
  ): Promise<PaginatedResponse<AuditLogReadModel>> {
    return this.auditService.findLogs(tenantId, query);
  }

  @Get('logs/:entityId')
  @ApiOperation({
    summary: 'Retrieve audit logs for a specific entity within the tenant',
  })
  @ApiParam({ name: 'entityId', type: String, description: 'Entity UUID' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'actorId', required: false, type: String })
  @ApiQuery({ name: 'action', required: false, type: String })
  @ApiQuery({ name: 'entityType', required: false, type: String })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiResponse({
    status: 200,
    description: 'Paginated audit logs for the entity',
  })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async findEntityLogs(
    @TenantDecorator('id') tenantId: string,
    @Param('entityId', ParseUUIDPipe) entityId: string,
    @Query() query: AuditQueryDto,
  ): Promise<PaginatedResponse<AuditLogReadModel>> {
    return this.auditService.findEntityLogs(tenantId, entityId, query);
  }
}
