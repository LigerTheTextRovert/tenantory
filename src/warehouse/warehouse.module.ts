import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { Warehouse } from './entities/warehouse.entity';
import { WarehouseController } from './warehouse.controller';
import { WarehouseService } from './warehouse.service';

@Module({
	imports: [TypeOrmModule.forFeature([Warehouse]), AuditModule],
	providers: [WarehouseService],
	controllers: [WarehouseController],
	exports: [TypeOrmModule],
})
export class WarehouseModule {}
