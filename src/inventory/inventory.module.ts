import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { CatalogModule } from '../catalog/catalog.module';
import { WarehouseModule } from '../warehouse/warehouse.module';
import { WarehouseService } from '../warehouse/warehouse.service';
import { StockLevel } from './entities/stock-level.entity';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

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
