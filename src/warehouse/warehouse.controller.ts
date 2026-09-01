import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiParam,
} from '@nestjs/swagger';
import { WarehouseService } from './warehouse.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { WarehouseQueryDto } from './dto/warehouse-query.dto';
import { TenantDecorator } from '../common/decorators/tenant.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RoleGuard } from '../auth/guards/role.guard';
import { Roles } from '../auth/decorators/auth.decorator';
import { UserRole } from '../auth/enum/user-role.enum';

@ApiTags('Warehouses')
@ApiSecurity('X-Tenant-Id')
@Controller('warehouse')
export class WarehouseController {
  constructor(private readonly warehouseService: WarehouseService) {}

  @Get()
  @ApiOperation({
    summary: 'List warehouses',
    description:
      'Returns a paginated list of warehouses for the current tenant.',
  })
  @ApiResponse({ status: 200, description: 'Paginated warehouse list.' })
  @ApiResponse({ status: 400, description: 'Invalid query parameters.' })
  @UseGuards(JwtAuthGuard, RoleGuard)
  @Roles(UserRole.TENANT_ADMIN, UserRole.WAREHOUSE_MANAGER)
  findAll(
    @TenantDecorator('id') tenantId: string,
    @Query() query: WarehouseQueryDto,
  ) {
    return this.warehouseService.findAll(tenantId, query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a warehouse by ID',
    description: 'Returns a single warehouse.',
  })
  @ApiParam({ name: 'id', description: 'Warehouse UUID', type: String })
  @ApiResponse({ status: 200, description: 'Warehouse found.' })
  @ApiResponse({ status: 404, description: 'Warehouse not found.' })
  @UseGuards(JwtAuthGuard, RoleGuard)
  @Roles(UserRole.TENANT_ADMIN, UserRole.WAREHOUSE_MANAGER)
  findOne(
    @TenantDecorator('id') tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.warehouseService.findOne(tenantId, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a warehouse',
    description: 'Creates a new warehouse for the current tenant.',
  })
  @ApiResponse({ status: 201, description: 'Warehouse created.' })
  @ApiResponse({
    status: 409,
    description: 'Warehouse name already exists within this tenant.',
  })
  @UseGuards(JwtAuthGuard, RoleGuard)
  @Roles(UserRole.TENANT_ADMIN, UserRole.WAREHOUSE_MANAGER)
  create(
    @TenantDecorator('id') tenantId: string,
    @Body() dto: CreateWarehouseDto,
  ) {
    return this.warehouseService.create(tenantId, dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a warehouse',
    description:
      'Partially updates a warehouse. Only provided fields are changed.',
  })
  @ApiParam({ name: 'id', description: 'Warehouse UUID', type: String })
  @ApiResponse({ status: 200, description: 'Warehouse updated.' })
  @ApiResponse({ status: 404, description: 'Warehouse not found.' })
  @ApiResponse({
    status: 409,
    description: 'Warehouse name conflict within this tenant.',
  })
  @UseGuards(JwtAuthGuard, RoleGuard)
  @Roles(UserRole.TENANT_ADMIN, UserRole.WAREHOUSE_MANAGER)
  update(
    @TenantDecorator('id') tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWarehouseDto,
  ) {
    return this.warehouseService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a warehouse',
    description: 'Soft-deletes a warehouse.',
  })
  @ApiParam({ name: 'id', description: 'Warehouse UUID', type: String })
  @ApiResponse({ status: 204, description: 'Warehouse deleted.' })
  @ApiResponse({ status: 404, description: 'Warehouse not found.' })
  @UseGuards(JwtAuthGuard, RoleGuard)
  @Roles(UserRole.TENANT_ADMIN, UserRole.WAREHOUSE_MANAGER)
  remove(
    @TenantDecorator('id') tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.warehouseService.remove(tenantId, id);
  }
}
