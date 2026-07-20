import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ProductService } from './product.service';
import { TenantDecorator } from '../../common/decorators/tenant.decorator';
import { ProductQueryDto } from './dto/product-query.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Controller('products')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Get()
  async findAll(
    @TenantDecorator('id') tenantId: string,
    @Query() query: ProductQueryDto,
  ) {
    await this.productService.findAll(tenantId, query);
  }

  @Get(':id')
  async findOne(
    @TenantDecorator('id') tenantId: string,
    @Param('id') id: string,
  ) {
    await this.productService.findOne(tenantId, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @TenantDecorator('id') tenantId: string,
    @Body() dto: CreateProductDto,
  ) {
    await this.productService.create(tenantId, dto);
  }

  @Patch(':id')
  async update(
    @TenantDecorator('id') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    await this.productService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @TenantDecorator('id') tenantId: string,
    @Param('id') id: string,
  ) {
    await this.productService.remove(tenantId, id);
  }
}
