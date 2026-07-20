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
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { TenantService } from './tenant.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { Tenant } from './entities/tenant.entity';

@ApiTags('Tenants')
@Public()
@Controller('tenants')
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Get()
  @ApiOperation({ summary: 'List all tenants' })
  @ApiResponse({ status: 200, description: 'List of all tenants' })
  async findAll(): Promise<Tenant[]> {
    return this.tenantService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a tenant by ID' })
  @ApiParam({ name: 'id', type: String, description: 'Tenant UUID' })
  @ApiResponse({ status: 200, description: 'Tenant found' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Tenant> {
    return this.tenantService.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new tenant' })
  @ApiResponse({ status: 201, description: 'Tenant created' })
  @ApiResponse({ status: 409, description: 'Domain name already exists' })
  async create(@Body() dto: CreateTenantDto): Promise<Tenant> {
    return this.tenantService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Partially update a tenant' })
  @ApiParam({ name: 'id', type: String, description: 'Tenant UUID' })
  @ApiResponse({ status: 200, description: 'Tenant updated' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  @ApiResponse({ status: 409, description: 'Domain name already exists' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTenantDto,
  ): Promise<Tenant> {
    return this.tenantService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a tenant' })
  @ApiParam({ name: 'id', type: String, description: 'Tenant UUID' })
  @ApiResponse({ status: 204, description: 'Tenant deleted' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.tenantService.remove(id);
  }
}
