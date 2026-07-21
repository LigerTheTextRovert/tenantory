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
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { VariantService } from './variant.service';
import { TenantDecorator } from '../../common/decorators/tenant.decorator';
import { CreateVariantDto } from './dto/create-variant.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { VariantQueryDto } from './dto/variant-query.dto';
import { PaginatedResponse } from '../../common/interfaces/paginated-response.interface';
import { ProductVariant } from '../entities/product-variant.entity';

@ApiTags('Product Variants')
@Controller('products/:productId/variants')
export class VariantController {
  constructor(private readonly variantService: VariantService) {}

  @Get()
  @ApiOperation({ summary: 'List all variants for a product' })
  @ApiParam({ name: 'productId', type: String, description: 'Product UUID' })
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
    name: 'search',
    required: false,
    type: String,
    description: 'Search variants by SKU',
  })
  @ApiQuery({
    name: 'minPrice',
    required: false,
    type: Number,
    description: 'Minimum price filter (inclusive)',
  })
  @ApiQuery({
    name: 'maxPrice',
    required: false,
    type: Number,
    description: 'Maximum price filter (inclusive)',
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    enum: ['sku', 'price', 'created_at', 'updated_at'],
    description: 'Sort field',
  })
  @ApiQuery({
    name: 'sortOrder',
    required: false,
    enum: ['ASC', 'DESC'],
    description: 'Sort direction',
  })
  @ApiResponse({ status: 200, description: 'Paginated list of variants' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async findAll(
    @TenantDecorator('id') tenantId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Query() query: VariantQueryDto,
  ): Promise<PaginatedResponse<ProductVariant>> {
    return this.variantService.findAll(tenantId, productId, query);
  }

  @Get(':variantId')
  @ApiOperation({ summary: 'Get a single variant by ID' })
  @ApiParam({ name: 'productId', type: String, description: 'Product UUID' })
  @ApiParam({ name: 'variantId', type: String, description: 'Variant UUID' })
  @ApiResponse({ status: 200, description: 'Variant found' })
  @ApiResponse({ status: 404, description: 'Variant not found' })
  async findOne(
    @TenantDecorator('id') tenantId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
  ): Promise<ProductVariant> {
    return this.variantService.findOne(tenantId, productId, variantId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new variant for a product' })
  @ApiParam({ name: 'productId', type: String, description: 'Product UUID' })
  @ApiResponse({ status: 201, description: 'Variant created' })
  @ApiResponse({
    status: 404,
    description: 'Product not found',
  })
  @ApiResponse({
    status: 409,
    description: 'SKU already exists within tenant',
  })
  async create(
    @TenantDecorator('id') tenantId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: CreateVariantDto,
  ): Promise<ProductVariant> {
    return this.variantService.create(tenantId, productId, dto);
  }

  @Patch(':variantId')
  @ApiOperation({ summary: 'Partially update a variant' })
  @ApiParam({ name: 'productId', type: String, description: 'Product UUID' })
  @ApiParam({ name: 'variantId', type: String, description: 'Variant UUID' })
  @ApiResponse({ status: 200, description: 'Variant updated' })
  @ApiResponse({ status: 404, description: 'Variant not found' })
  @ApiResponse({ status: 409, description: 'SKU already exists within tenant' })
  async update(
    @TenantDecorator('id') tenantId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body() dto: UpdateVariantDto,
  ): Promise<ProductVariant> {
    return this.variantService.update(tenantId, productId, variantId, dto);
  }

  @Delete(':variantId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a variant' })
  @ApiParam({ name: 'productId', type: String, description: 'Product UUID' })
  @ApiParam({ name: 'variantId', type: String, description: 'Variant UUID' })
  @ApiResponse({ status: 204, description: 'Variant deleted' })
  @ApiResponse({ status: 404, description: 'Variant not found' })
  async remove(
    @TenantDecorator('id') tenantId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
  ): Promise<void> {
    return this.variantService.remove(tenantId, productId, variantId);
  }
}
