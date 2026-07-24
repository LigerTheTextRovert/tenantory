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
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiParam,
} from '@nestjs/swagger';
import { SupplierService } from './supplier.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { SupplierQueryDto } from './dto/supplier-query.dto';
import { TenantDecorator } from '../common/decorators/tenant.decorator';

@ApiTags('Suppliers')
@ApiSecurity('X-Tenant-Id')
@Controller('suppliers')
export class SupplierController {
  constructor(private readonly supplierService: SupplierService) {}

  @Get()
  @ApiOperation({
    summary: 'List suppliers',
    description:
      'Returns a paginated list of suppliers for the current tenant.',
  })
  @ApiResponse({ status: 200, description: 'Paginated supplier list.' })
  @ApiResponse({ status: 400, description: 'Invalid query parameters.' })
  findAll(
    @TenantDecorator('id') tenantId: string,
    @Query() query: SupplierQueryDto,
  ) {
    return this.supplierService.findAll(tenantId, query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a supplier by ID',
    description: 'Returns a single supplier.',
  })
  @ApiParam({ name: 'id', description: 'Supplier UUID', type: String })
  @ApiResponse({ status: 200, description: 'Supplier found.' })
  @ApiResponse({ status: 404, description: 'Supplier not found.' })
  findOne(
    @TenantDecorator('id') tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.supplierService.findOne(tenantId, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a supplier',
    description: 'Creates a new supplier for the current tenant.',
  })
  @ApiResponse({ status: 201, description: 'Supplier created.' })
  @ApiResponse({
    status: 409,
    description: 'Company name already exists within this tenant.',
  })
  create(
    @TenantDecorator('id') tenantId: string,
    @Body() dto: CreateSupplierDto,
  ) {
    return this.supplierService.create(tenantId, dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a supplier',
    description:
      'Partially updates a supplier. Only provided fields are changed.',
  })
  @ApiParam({ name: 'id', description: 'Supplier UUID', type: String })
  @ApiResponse({ status: 200, description: 'Supplier updated.' })
  @ApiResponse({ status: 404, description: 'Supplier not found.' })
  @ApiResponse({
    status: 409,
    description: 'Company name conflict within this tenant.',
  })
  update(
    @TenantDecorator('id') tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupplierDto,
  ) {
    return this.supplierService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a supplier',
    description: 'Soft-deletes a supplier.',
  })
  @ApiParam({ name: 'id', description: 'Supplier UUID', type: String })
  @ApiResponse({ status: 204, description: 'Supplier deleted.' })
  @ApiResponse({ status: 404, description: 'Supplier not found.' })
  remove(
    @TenantDecorator('id') tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.supplierService.remove(tenantId, id);
  }
}
