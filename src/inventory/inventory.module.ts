import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockLevel } from './entities/stock-level.entity';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { WarehouseModule } from '../warehouse/warehouse.module';
import { CatalogModule } from '../catalog/catalog.module';
import { AuditModule } from '../audit/audit.module';
import { WarehouseService } from '../warehouse/warehouse.service';
import {
  INVENTORY_EVENT_EMITTER,
  InventoryEventEmitterAdapter,
} from './inventory-event-emitter.port';

@Module({
  imports: [
    TypeOrmModule.forFeature([StockLevel]),
    WarehouseModule,
    CatalogModule,
    AuditModule,
  ],
  providers: [
    InventoryService,
    WarehouseService,
    InventoryEventEmitterAdapter,
    {
      provide: INVENTORY_EVENT_EMITTER,
      useExisting: InventoryEventEmitterAdapter,
    },
  ],
  controllers: [InventoryController],
  exports: [InventoryService, TypeOrmModule],
})
export class InventoryModule {}
