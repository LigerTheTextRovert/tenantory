import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockLevel } from './entities/stock-level.entity';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';

@Module({
  imports: [TypeOrmModule.forFeature([StockLevel])],
  providers: [InventoryService],
  controllers: [InventoryController],
  exports: [TypeOrmModule],
})
export class InventoryModule {}
