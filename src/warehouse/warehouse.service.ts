import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Warehouse } from './entities/warehouse.entity';
import { IsNull, Repository } from 'typeorm';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { isUniqueViolation } from '../common/utils/assert-unique.util';

@Injectable()
export class WarehouseService {
  constructor(
    @InjectRepository(Warehouse)
    private readonly warehouseRepo: Repository<Warehouse>,
  ) {}

  async findOne(tenantId: string, id: string): Promise<Warehouse> {
    const warehouse = await this.warehouseRepo.findOne({
      where: {
        tenantId,
        id,
        deletedAt: IsNull(),
      },
    });

    if (!warehouse) {
      throw new NotFoundException(`There is no warehouse by this ID:${id}`);
    }

    return warehouse;
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateWarehouseDto,
  ): Promise<Warehouse> {
    const warehouse = await this.findOne(tenantId, id);

    if (dto.name) {
      await this.assertNameUniqueness(dto.name, tenantId, id);
      warehouse.name = dto.name;
    }

    if (dto.location) {
      warehouse.location = dto.location;
    }

    try {
      await this.warehouseRepo.save(warehouse);
      return warehouse;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('There is a warehouse with this info');
      }
      throw error;
    }
  }

  private async assertNameUniqueness(
    name: string,
    tenantId: string,
    id: string,
  ): Promise<boolean> {
    const warehouse = await this.warehouseRepo.findOne({
      where: {
        id,
        tenantId,
        name,
        deletedAt: IsNull(),
      },
    });

    if (!warehouse) {
      throw new ConflictException('There is already a warehouse by this name');
    }

    return true;
  }
}
