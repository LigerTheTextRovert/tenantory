import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Warehouse } from './entities/warehouse.entity';
import { WarehouseService } from './warehouse.service';

@Module({
  imports: [TypeOrmModule.forFeature([Warehouse])],
  providers: [WarehouseService],
  exports: [TypeOrmModule],
})
export class WarehouseModule {}
