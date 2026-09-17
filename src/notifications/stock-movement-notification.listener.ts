import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { UserRole } from '../auth/enum/user-role.enum';
import { NotificationService } from './notification.service';
import { NotificationType } from './enums/notification-type';
import {
  STOCK_MOVEMENT_EVENT,
  StockMovementEvent,
} from '../inventory/events/stock-movement.event';

@Injectable()
export class StockMovementNotificationListener {
  private readonly logger = new Logger(StockMovementNotificationListener.name);

  constructor(private readonly notifications: NotificationService) {}

  @OnEvent(STOCK_MOVEMENT_EVENT)
  handleStockMovement(movement: StockMovementEvent): void {
    const crossedThreshold =
      movement.before.availableQuantity > movement.safetyThreshold &&
      movement.after.availableQuantity <= movement.safetyThreshold;

    if (!crossedThreshold) {
      return;
    }

    const variantLabel = movement.sku ?? movement.variantId;

    this.notifications.dispatch({
      tenantId: movement.tenantId,
      recipientRoles: [UserRole.WAREHOUSE_MANAGER, UserRole.TENANT_ADMIN],
      type: NotificationType.LOW_STOCK,
      title: 'Low stock alert',
      body: `Available stock for ${variantLabel} dropped to ${movement.after.availableQuantity} (threshold: ${movement.safetyThreshold}).`,
      data: {
        variantId: movement.variantId,
        warehouseId: movement.warehouseId,
        stockLevelId: movement.stockLevelId,
        sku: movement.sku ?? null,
        availableQuantity: movement.after.availableQuantity,
        safetyThreshold: movement.safetyThreshold,
      },
      dedupKey: `${movement.variantId}:${movement.warehouseId}`,
    });
  }
}
