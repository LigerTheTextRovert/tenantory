import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { TenantDecorator } from '../common/decorators/tenant.decorator';
import { ReleaseStockDto } from './dto/release-stock.dto';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ReserveStockDto } from './dto/reserve-stock.dto';
import { DeductStockDto } from './dto/deduct-stock.dto';
import { ReplenishStockDto } from './dto/replenish-stock.dto';
import { StockQueryDto } from './dto/stock-query.dto';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @ApiOperation({
    summary: 'List stock levels',
    description:
      'Returns a paginated list of stock levels for the current tenant.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated inventory levels returned.',
  })
  findAll(
    @TenantDecorator('id') tenantId: string,
    @Query() query: StockQueryDto,
  ) {
    return this.inventoryService.findAll(tenantId, query);
  }

  @Post('replenish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Replenish stock',
    description:
      'Increases available stock for a product variant in a warehouse.',
  })
  @ApiResponse({ status: 200, description: 'Stock levels updated.' })
  replenish(
    @TenantDecorator('id') tenantId: string,
    @Body() dto: ReplenishStockDto,
  ) {
    return this.inventoryService.replenish(tenantId, dto);
  }

  @Post('deduct')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Deduct stock',
    description:
      'Deducts available stock physically (e.g. direct sale or checkout completion).',
  })
  @ApiResponse({ status: 200, description: 'Stock successfully deducted.' })
  @ApiResponse({
    status: 400,
    description: 'Insufficient stock or invalid input.',
  })
  deduct(@TenantDecorator('id') tenantId: string, @Body() dto: DeductStockDto) {
    return this.inventoryService.deductStock(tenantId, dto);
  }

  @Post('reserve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reserve stock',
    description:
      'Moves stock from available to reserved to lock it during a cart checkout.',
  })
  @ApiResponse({ status: 200, description: 'Stock successfully reserved.' })
  @ApiResponse({ status: 400, description: 'Insufficient stock available.' })
  reserve(
    @TenantDecorator('id') tenantId: string,
    @Body() dto: ReserveStockDto,
  ) {
    return this.inventoryService.reserveStock(tenantId, dto);
  }

  @Post('release')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Release stock reservation',
    description:
      'Moves stock from reserved back to available (e.g., cart expired or canceled).',
  })
  @ApiResponse({
    status: 200,
    description: 'Reserved stock successfully released.',
  })
  release(
    @TenantDecorator('id') tenantId: string,
    @Body() dto: ReleaseStockDto,
  ) {
    return this.inventoryService.releaseStock(tenantId, dto);
  }
}
