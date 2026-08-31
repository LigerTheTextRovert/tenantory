import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockLevel } from './entities/stock-level.entity';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { WarehouseModule } from '../warehouse/warehouse.module';
import { CatalogModule } from '../catalog/catalog.module';
import { AuditModule } from '../audit/audit.module';
import { WarehouseService } from '../warehouse/warehouse.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([StockLevel]),
    WarehouseModule,
    CatalogModule,
    AuditModule,
  ],
  providers: [InventoryService, WarehouseService],
  controllers: [InventoryController],
  exports: [InventoryService, TypeOrmModule],
})
export class InventoryModule {}
