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
import { CategoryService } from './category.service';
import { TenantDecorator } from '../common/decorators/tenant.decorator';
import { CategoryQueryDto } from './dto/category-query.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Controller('category')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Get()
  findAll(
    @TenantDecorator('id') tenantId: string,
    @Query() query: CategoryQueryDto,
  ) {
    return this.categoryService.findAll(tenantId, query);
  }

  @Get('tree')
  findTree(@TenantDecorator('id') tenantId: string) {
    return this.categoryService.findTree(tenantId);
  }

  @Get(':id')
  findOne(
    @TenantDecorator('id') tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.categoryService.findOne(tenantId, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @TenantDecorator('id') tenantId: string,
    @Body() dto: CreateCategoryDto,
  ) {
    return this.categoryService.create(tenantId, dto);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  update(
    @TenantDecorator('id') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoryService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@TenantDecorator('id') tenantId: string, @Param('id') id: string) {
    return this.categoryService.remove(tenantId, id);
  }
}
