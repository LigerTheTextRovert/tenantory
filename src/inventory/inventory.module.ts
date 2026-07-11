import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockLevel } from './entities/stock-level.entity';

@Module({
  imports: [TypeOrmModule.forFeature([StockLevel])],
  exports: [TypeOrmModule],
})
export class InventoryModule {}
