import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { StockLevel } from './entities/stock-level.entity';
import { Repository } from 'typeorm';

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(StockLevel)
    private readonly inventoryRepo: Repository<StockLevel>,
  ) {}
}
