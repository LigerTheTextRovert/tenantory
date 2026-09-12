import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SearchService } from './search.service';
import { SearchQueryDto } from './dto/search-query.dto';
import { SearchResultDto } from './dto/search-result.dto';
import { TenantDecorator } from '../common/decorators/tenant.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RoleGuard } from '../auth/guards/role.guard';
import { Roles } from '../auth/decorators/auth.decorator';
import { UserRole } from '../auth/enum/user-role.enum';

@ApiTags('Search')
@ApiBearerAuth()
@Controller('search')
@UseGuards(JwtAuthGuard, RoleGuard)
@Roles(
  UserRole.TENANT_ADMIN,
  UserRole.CATALOG_MANAGER,
  UserRole.WAREHOUSE_MANAGER,
)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @ApiOperation({
    summary: 'Fuzzy search products and variants for the current tenant',
  })
  @ApiOkResponse({ type: SearchResultDto })
  async search(
    @TenantDecorator('id') tenantId: string,
    @Query() query: SearchQueryDto,
  ): Promise<SearchResultDto> {
    return this.searchService.search(tenantId, query);
  }
}
