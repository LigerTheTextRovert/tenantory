import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { Notification } from './entities/notification.entity';
import {
  NOTIFICATION_DISPATCH_EVENT,
  NotificationDispatchEvent,
} from './events/notification.event';
import { NOTIFICATION_EVENT_EMITTER } from './notification-event-emitter.port';
import { NotificationType } from './enums/notification-type';

describe('NotificationService', () => {
  let service: NotificationService;
  let emitter: { emit: jest.Mock };
  let notificationRepo: {
    findOne: jest.Mock;
    softDelete: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let qb: Record<string, jest.Mock>;

  const TENANT_ID = '22222222-2222-2222-2222-222222222222';
  const RECIPIENT_ID = '33333333-3333-3333-3333-333333333333';
  const NOTIFICATION_ID = '11111111-1111-1111-1111-111111111111';

  const validDispatch = {
    tenantId: TENANT_ID,
    recipientIds: [RECIPIENT_ID],
    type: NotificationType.LOW_STOCK,
    title: 'Low stock alert',
  };

  beforeEach(async () => {
    emitter = { emit: jest.fn().mockReturnValue(true) };

    qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      getCount: jest.fn().mockResolvedValue(0),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    notificationRepo = {
      findOne: jest.fn(),
      softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: NOTIFICATION_EVENT_EMITTER, useValue: emitter },
        {
          provide: getRepositoryToken(Notification),
          useValue: notificationRepo,
        },
      ],
    }).compile();

    service = moduleRef.get(NotificationService);
  });

  describe('dispatch', () => {
    it('emits a normalized event with defaults applied', () => {
      service.dispatch(validDispatch);

      expect(emitter.emit).toHaveBeenCalledTimes(1);
      const [eventName, event] = emitter.emit.mock.calls[0] as [
        string,
        NotificationDispatchEvent,
      ];
      expect(eventName).toBe(NOTIFICATION_DISPATCH_EVENT);
      expect(event).toEqual({
        tenantId: TENANT_ID,
        recipientIds: [RECIPIENT_ID],
        recipientRoles: [],
        type: NotificationType.LOW_STOCK,
        title: 'Low stock alert',
        body: null,
        data: null,
        dedupKey: null,
      });
    });

    it('rejects dispatches without tenant context', () => {
      expect(() =>
        service.dispatch({ ...validDispatch, tenantId: '' }),
      ).toThrow();
      expect(emitter.emit).not.toHaveBeenCalled();
    });

    it('skips the emit when no recipients or roles are provided', () => {
      service.dispatch({ ...validDispatch, recipientIds: [] });

      expect(emitter.emit).not.toHaveBeenCalled();
    });
  });

  describe('findFeed', () => {
    it('returns a paginated response for the recipient', async () => {
      const data = [{ id: NOTIFICATION_ID }] as Notification[];
      qb.getManyAndCount.mockResolvedValue([data, 1]);

      const result = await service.findFeed(TENANT_ID, RECIPIENT_ID, {});

      expect(result.data).toEqual(data);
      expect(result.meta).toMatchObject({
        totalItems: 1,
        itemCount: 1,
        currentPage: 1,
        totalPages: 1,
      });
      expect(qb.where).toHaveBeenCalledWith(
        'notification.tenant_id = :tenantId',
        { tenantId: TENANT_ID },
      );
      expect(qb.andWhere).toHaveBeenCalledWith(
        'notification.recipient_id = :recipientId',
        { recipientId: RECIPIENT_ID },
      );
    });

    it('applies the unread-only filter when requested', async () => {
      await service.findFeed(TENANT_ID, RECIPIENT_ID, { unreadOnly: true });

      expect(qb.andWhere).toHaveBeenCalledWith('notification.read_at IS NULL');
    });

    it('rejects an inverted date range', async () => {
      await expect(
        service.findFeed(TENANT_ID, RECIPIENT_ID, {
          startDate: '2026-09-17T00:00:00.000Z',
          endDate: '2026-09-01T00:00:00.000Z',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getUnreadCount', () => {
    it('returns the count for the recipient', async () => {
      qb.getCount.mockResolvedValue(7);

      const count = await service.getUnreadCount(TENANT_ID, RECIPIENT_ID);

      expect(count).toBe(7);
      expect(qb.andWhere).toHaveBeenCalledWith('notification.read_at IS NULL');
    });
  });

  describe('markRead', () => {
    it('marks the notification read when the update affects a row', async () => {
      qb.execute.mockResolvedValue({ affected: 1 });

      await expect(
        service.markRead(TENANT_ID, RECIPIENT_ID, NOTIFICATION_ID),
      ).resolves.toBeUndefined();

      expect(notificationRepo.findOne).not.toHaveBeenCalled();
    });

    it('succeeds idempotently when the notification is already read', async () => {
      qb.execute.mockResolvedValue({ affected: 0 });
      notificationRepo.findOne.mockResolvedValue({ id: NOTIFICATION_ID });

      await expect(
        service.markRead(TENANT_ID, RECIPIENT_ID, NOTIFICATION_ID),
      ).resolves.toBeUndefined();
    });

    it('throws NotFoundException when the notification does not belong to the recipient', async () => {
      qb.execute.mockResolvedValue({ affected: 0 });
      notificationRepo.findOne.mockResolvedValue(null);

      await expect(
        service.markRead(TENANT_ID, RECIPIENT_ID, NOTIFICATION_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('markAllRead', () => {
    it('returns the number of updated rows', async () => {
      qb.execute.mockResolvedValue({ affected: 4 });

      const updated = await service.markAllRead(TENANT_ID, RECIPIENT_ID);

      expect(updated).toBe(4);
      expect(qb.andWhere).toHaveBeenCalledWith('notification.read_at IS NULL');
    });
  });

  describe('remove', () => {
    it('soft-deletes the notification', async () => {
      await expect(
        service.remove(TENANT_ID, RECIPIENT_ID, NOTIFICATION_ID),
      ).resolves.toBeUndefined();

      expect(notificationRepo.softDelete).toHaveBeenCalledWith({
        id: NOTIFICATION_ID,
        tenantId: TENANT_ID,
        recipientId: RECIPIENT_ID,
      });
    });

    it('throws NotFoundException when nothing was deleted', async () => {
      notificationRepo.softDelete.mockResolvedValue({ affected: 0 });

      await expect(
        service.remove(TENANT_ID, RECIPIENT_ID, NOTIFICATION_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
