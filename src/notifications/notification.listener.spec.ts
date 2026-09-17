import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { In } from 'typeorm';
import { Logger } from '@nestjs/common';
import { NotificationListener } from './notification.listener';
import { Notification } from './entities/notification.entity';
import { User } from '../auth/entities/user.entity';
import { UserRole } from '../auth/enum/user-role.enum';
import { NotificationDispatchEvent } from './events/notification.event';
import { NotificationType } from './enums/notification-type';

describe('NotificationListener', () => {
  let listener: NotificationListener;
  let notificationRepo: {
    create: jest.Mock;
    save: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let userRepo: { find: jest.Mock };

  const TENANT_ID = '22222222-2222-2222-2222-222222222222';
  const USER_A = '33333333-3333-3333-3333-333333333333';
  const USER_B = '44444444-4444-4444-4444-444444444444';
  const USER_C = '55555555-5555-5555-5555-555555555555';

  const baseEvent: NotificationDispatchEvent = {
    tenantId: TENANT_ID,
    recipientIds: [],
    recipientRoles: [],
    type: NotificationType.LOW_STOCK,
    title: 'Low stock alert',
    body: 'Stock is low',
    data: { variantId: 'v1' },
    dedupKey: null,
  };

  const mockDedupQuery = (rows: { recipientId: string }[]) => {
    const qb = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue(rows),
    };
    notificationRepo.createQueryBuilder.mockReturnValue(qb);
    return qb;
  };

  beforeEach(async () => {
    notificationRepo = {
      create: jest.fn((value: Partial<Notification>) => value),
      save: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn(),
    };
    userRepo = { find: jest.fn().mockResolvedValue([]) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationListener,
        {
          provide: getRepositoryToken(Notification),
          useValue: notificationRepo,
        },
        { provide: getRepositoryToken(User), useValue: userRepo },
      ],
    }).compile();

    listener = moduleRef.get(NotificationListener);
  });

  it('persists one row per explicit recipient', async () => {
    await listener.handleDispatch({
      ...baseEvent,
      recipientIds: [USER_A, USER_B],
    });

    expect(notificationRepo.save).toHaveBeenCalledTimes(1);
    expect(notificationRepo.save).toHaveBeenCalledWith([
      expect.objectContaining({ recipientId: USER_A }),
      expect.objectContaining({ recipientId: USER_B }),
    ]);
    expect(userRepo.find).not.toHaveBeenCalled();
  });

  it('resolves role fan-out and deduplicates merged recipients', async () => {
    userRepo.find.mockResolvedValue([{ id: USER_B }, { id: USER_C }]);

    await listener.handleDispatch({
      ...baseEvent,
      recipientIds: [USER_A],
      recipientRoles: [UserRole.TENANT_ADMIN],
    });

    expect(userRepo.find).toHaveBeenCalledWith({
      where: {
        tenantId: TENANT_ID,
        role: In([UserRole.TENANT_ADMIN]),
        isActive: true,
      },
      select: { id: true },
    });
    expect(notificationRepo.save).toHaveBeenCalledWith([
      expect.objectContaining({ recipientId: USER_A }),
      expect.objectContaining({ recipientId: USER_B }),
      expect.objectContaining({ recipientId: USER_C }),
    ]);
  });

  it('skips recipients that already have an unread deduplicated notification', async () => {
    mockDedupQuery([{ recipientId: USER_A }]);

    await listener.handleDispatch({
      ...baseEvent,
      recipientIds: [USER_A, USER_B],
      dedupKey: 'variant-1:warehouse-1',
    });

    expect(notificationRepo.save).toHaveBeenCalledWith([
      expect.objectContaining({ recipientId: USER_B }),
    ]);
  });

  it('persists all recipients when the dedup query finds no duplicates', async () => {
    mockDedupQuery([]);

    await listener.handleDispatch({
      ...baseEvent,
      recipientIds: [USER_A, USER_B],
      dedupKey: 'variant-1:warehouse-1',
    });

    expect(notificationRepo.save).toHaveBeenCalledWith([
      expect.objectContaining({ recipientId: USER_A }),
      expect.objectContaining({ recipientId: USER_B }),
    ]);
  });

  it('persists nothing when there are no recipients', async () => {
    await listener.handleDispatch(baseEvent);

    expect(notificationRepo.save).not.toHaveBeenCalled();
  });

  it('swallows persistence failures so the emitting flow is unaffected', async () => {
    notificationRepo.save.mockRejectedValueOnce(new Error('db down'));
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    await expect(
      listener.handleDispatch({ ...baseEvent, recipientIds: [USER_A] }),
    ).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledTimes(1);

    errorSpy.mockRestore();
  });
});
