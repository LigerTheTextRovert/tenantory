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
import { CategoryService } from './category.service';
import { TenantDecorator } from '../common/decorators/tenant.decorator';
import { CategoryQueryDto } from './dto/category-query.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@ApiTags('Categories')
@ApiSecurity('X-Tenant-Id')
@Controller('category')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Get()
  @ApiOperation({
    summary: 'List categories',
    description:
      'Returns a paginated list of categories for the current tenant.',
  })
  @ApiResponse({ status: 200, description: 'Paginated category list.' })
  @ApiResponse({ status: 400, description: 'Invalid query parameters.' })
  findAll(
    @TenantDecorator('id') tenantId: string,
    @Query() query: CategoryQueryDto,
  ) {
    return this.categoryService.findAll(tenantId, query);
  }

  @Get('tree')
  @ApiOperation({
    summary: 'Get category tree',
    description:
      'Returns the full category tree (hierarchical) for the current tenant.',
  })
  @ApiResponse({ status: 200, description: 'Nested category tree.' })
  findTree(@TenantDecorator('id') tenantId: string) {
    return this.categoryService.findTree(tenantId);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a category by ID',
    description: 'Returns a single category with its parent and children.',
  })
  @ApiParam({ name: 'id', description: 'Category UUID', type: String })
  @ApiResponse({ status: 200, description: 'Category found.' })
  @ApiResponse({ status: 404, description: 'Category not found.' })
  findOne(
    @TenantDecorator('id') tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.categoryService.findOne(tenantId, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a category',
    description:
      'Creates a new category. The slug is auto-generated from the name if not provided.',
  })
  @ApiResponse({ status: 201, description: 'Category created.' })
  @ApiResponse({
    status: 409,
    description: 'Slug already exists within this tenant.',
  })
  create(
    @TenantDecorator('id') tenantId: string,
    @Body() dto: CreateCategoryDto,
  ) {
    return this.categoryService.create(tenantId, dto);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update a category',
    description:
      'Partially updates a category. Only provided fields are changed.',
  })
  @ApiParam({ name: 'id', description: 'Category UUID', type: String })
  @ApiResponse({ status: 200, description: 'Category updated.' })
  @ApiResponse({ status: 404, description: 'Category not found.' })
  @ApiResponse({
    status: 409,
    description: 'Slug conflict or attempt to set category as its own parent.',
  })
  update(
    @TenantDecorator('id') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoryService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a category',
    description: 'Soft-deletes a category. Fails if the category has children.',
  })
  @ApiParam({ name: 'id', description: 'Category UUID', type: String })
  @ApiResponse({ status: 204, description: 'Category deleted.' })
  @ApiResponse({ status: 404, description: 'Category not found.' })
  @ApiResponse({
    status: 409,
    description: 'Cannot delete — category has children.',
  })
  remove(@TenantDecorator('id') tenantId: string, @Param('id') id: string) {
    return this.categoryService.remove(tenantId, id);
  }
}
