export const STOCK_MOVEMENT_EVENT = 'inventory.stock.movement';

export interface StockMovementSnapshot {
  availableQuantity: number;
  reservedQuantity: number;
}

export interface StockMovementEvent {
  tenantId: string;
  stockLevelId: string;
  variantId: string;
  warehouseId: string;
  /** Present when the variant record was loaded by the emitting flow. */
  sku?: string;
  before: StockMovementSnapshot;
  after: StockMovementSnapshot;
  safetyThreshold: number;
}
