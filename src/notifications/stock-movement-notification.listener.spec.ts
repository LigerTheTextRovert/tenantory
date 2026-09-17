import { Test } from '@nestjs/testing';
import { StockMovementNotificationListener } from './stock-movement-notification.listener';
import { NotificationService } from './notification.service';
import { NotificationType } from './enums/notification-type';
import { UserRole } from '../auth/enum/user-role.enum';
import { StockMovementEvent } from '../inventory/events/stock-movement.event';
import { NotificationDispatchInput } from './events/notification.event';

describe('StockMovementNotificationListener', () => {
  let listener: StockMovementNotificationListener;
  let notifications: { dispatch: jest.Mock<void, [NotificationDispatchInput]> };

  const TENANT_ID = '22222222-2222-2222-2222-222222222222';
  const VARIANT_ID = 'v1234567-e5f6-7890-abcd-ef1234567890';
  const WAREHOUSE_ID = 'w1234567-e5f6-7890-abcd-ef1234567890';

  const movement = (
    overrides: Partial<StockMovementEvent>,
  ): StockMovementEvent => ({
    tenantId: TENANT_ID,
    stockLevelId: 'sl-1',
    variantId: VARIANT_ID,
    warehouseId: WAREHOUSE_ID,
    sku: 'SKU-1',
    before: { availableQuantity: 25, reservedQuantity: 0 },
    after: { availableQuantity: 15, reservedQuantity: 0 },
    safetyThreshold: 20,
    ...overrides,
  });

  beforeEach(async () => {
    notifications = { dispatch: jest.fn<void, [NotificationDispatchInput]>() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        StockMovementNotificationListener,
        { provide: NotificationService, useValue: notifications },
      ],
    }).compile();

    listener = moduleRef.get(StockMovementNotificationListener);
  });

  it('dispatches a low-stock notification when the threshold is crossed', () => {
    listener.handleStockMovement(
      movement({
        before: { availableQuantity: 21, reservedQuantity: 0 },
        after: { availableQuantity: 20, reservedQuantity: 0 },
      }),
    );

    expect(notifications.dispatch).toHaveBeenCalledTimes(1);

    const dispatched = notifications.dispatch.mock.calls[0][0];

    expect(dispatched.tenantId).toBe(TENANT_ID);
    expect(dispatched.recipientRoles).toEqual([
      UserRole.WAREHOUSE_MANAGER,
      UserRole.TENANT_ADMIN,
    ]);
    expect(dispatched.type).toBe(NotificationType.LOW_STOCK);
    expect(dispatched.title).toBe('Low stock alert');
    expect(dispatched.body).toContain('SKU-1');
    expect(dispatched.body).toContain('20');
    expect(dispatched.data).toMatchObject({
      variantId: VARIANT_ID,
      warehouseId: WAREHOUSE_ID,
      stockLevelId: 'sl-1',
      availableQuantity: 20,
      safetyThreshold: 20,
    });
    expect(dispatched.dedupKey).toBe(`${VARIANT_ID}:${WAREHOUSE_ID}`);
  });

  it('does not dispatch when stock was already below the threshold', () => {
    listener.handleStockMovement(
      movement({
        before: { availableQuantity: 10, reservedQuantity: 0 },
        after: { availableQuantity: 5, reservedQuantity: 0 },
      }),
    );

    expect(notifications.dispatch).not.toHaveBeenCalled();
  });

  it('does not dispatch when stock stays above the threshold', () => {
    listener.handleStockMovement(
      movement({
        before: { availableQuantity: 30, reservedQuantity: 0 },
        after: { availableQuantity: 25, reservedQuantity: 0 },
      }),
    );

    expect(notifications.dispatch).not.toHaveBeenCalled();
  });

  it('does not dispatch when stock is replenished back above the threshold', () => {
    listener.handleStockMovement(
      movement({
        before: { availableQuantity: 15, reservedQuantity: 0 },
        after: { availableQuantity: 40, reservedQuantity: 0 },
      }),
    );

    expect(notifications.dispatch).not.toHaveBeenCalled();
  });
});
