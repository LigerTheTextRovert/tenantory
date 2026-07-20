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
import { ProductService } from './product.service';
import { TenantDecorator } from '../../common/decorators/tenant.decorator';
import { ProductQueryDto } from './dto/product-query.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { PaginatedResponse } from '../../common/interfaces/paginated-response.interface';
import { Product } from '../entities/product.entity';

@ApiTags('Products')
@Controller('products')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Get()
  @ApiOperation({ summary: 'List all products for the current tenant' })
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
    description: 'Search products by name',
  })
  @ApiQuery({
    name: 'categoryId',
    required: false,
    type: String,
    description: 'Filter by category UUID',
  })
  @ApiQuery({
    name: 'isActive',
    required: false,
    enum: ['true', 'false'],
    description: 'Filter by active status',
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    enum: ['name', 'created_at', 'updated_at'],
    description: 'Sort field',
  })
  @ApiQuery({
    name: 'sortOrder',
    required: false,
    enum: ['ASC', 'DESC'],
    description: 'Sort direction',
  })
  @ApiResponse({ status: 200, description: 'Paginated list of products' })
  async findAll(
    @TenantDecorator('id') tenantId: string,
    @Query() query: ProductQueryDto,
  ): Promise<PaginatedResponse<Product>> {
    return this.productService.findAll(tenantId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single product by ID' })
  @ApiParam({ name: 'id', type: String, description: 'Product UUID' })
  @ApiResponse({ status: 200, description: 'Product found' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async findOne(
    @TenantDecorator('id') tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Product> {
    return this.productService.findOne(tenantId, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new product' })
  @ApiResponse({ status: 201, description: 'Product created' })
  @ApiResponse({
    status: 409,
    description: 'SKU prefix already exists or category not found',
  })
  async create(
    @TenantDecorator('id') tenantId: string,
    @Body() dto: CreateProductDto,
  ): Promise<Product> {
    return this.productService.create(tenantId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Partially update a product' })
  @ApiParam({ name: 'id', type: String, description: 'Product UUID' })
  @ApiResponse({ status: 200, description: 'Product updated' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @ApiResponse({ status: 409, description: 'SKU prefix change not allowed' })
  async update(
    @TenantDecorator('id') tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<Product> {
    return this.productService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a product' })
  @ApiParam({ name: 'id', type: String, description: 'Product UUID' })
  @ApiResponse({ status: 204, description: 'Product deleted' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @ApiResponse({ status: 409, description: 'Product has active variants' })
  async delete(
    @TenantDecorator('id') tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.productService.remove(tenantId, id);
  }
}
