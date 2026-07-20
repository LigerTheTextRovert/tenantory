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
import { ProductService } from './product.service';
import { TenantDecorator } from '../../common/decorators/tenant.decorator';
import { ProductQueryDto } from './dto/product-query.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { PaginatedResponse } from '../../common/interfaces/paginated-response.interface';
import { Product } from '../entities/product.entity';

@Controller('products')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Get()
  async findAll(
    @TenantDecorator('id') tenantId: string,
    @Query() query: ProductQueryDto,
  ): Promise<PaginatedResponse<Product>> {
    return this.productService.findAll(tenantId, query);
  }

  @Get(':id')
  async findOne(
    @TenantDecorator('id') tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Product> {
    return this.productService.findOne(tenantId, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @TenantDecorator('id') tenantId: string,
    @Body() dto: CreateProductDto,
  ): Promise<Product> {
    return this.productService.create(tenantId, dto);
  }

  @Patch(':id')
  async update(
    @TenantDecorator('id') tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<Product> {
    return this.productService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @TenantDecorator('id') tenantId: string,
    @Param('id') id: string,
  ): Promise<void> {
    return this.productService.remove(tenantId, id);
  }
}
