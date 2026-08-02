import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockLevel } from './entities/stock-level.entity';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { WarehouseModule } from '../warehouse/warehouse.module';
import { CatalogModule } from '../catalog/catalog.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([StockLevel]),
    WarehouseModule,
    CatalogModule,
  ],
  providers: [InventoryService],
  controllers: [InventoryController],
  exports: [InventoryService, TypeOrmModule],
})
export class InventoryModule {}
