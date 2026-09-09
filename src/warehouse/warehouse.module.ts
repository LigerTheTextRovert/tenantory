import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Warehouse } from './entities/warehouse.entity';
import { AuditModule } from '../audit/audit.module';
import { WarehouseService } from './warehouse.service';
import { WarehouseController } from './warehouse.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Warehouse]), AuditModule],
  providers: [WarehouseService],
  controllers: [WarehouseController],
  exports: [TypeOrmModule],
})
export class WarehouseModule {}
