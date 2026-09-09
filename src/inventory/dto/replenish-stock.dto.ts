import { Type } from 'class-transformer';
import { IsInt, IsUUID, Min } from 'class-validator';

export class ReplenishStockDto {
  @IsUUID()
  warehouseId: string;

  @IsUUID()
  variantId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;
}
