import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import { User } from '../auth/entities/user.entity';
import { Notification } from './entities/notification.entity';
import {
  NOTIFICATION_DISPATCH_EVENT,
  NotificationDispatchEvent,
} from './events/notification.event';

@Injectable()
export class NotificationListener {
  private readonly logger = new Logger(NotificationListener.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  @OnEvent(NOTIFICATION_DISPATCH_EVENT)
  async handleDispatch(payload: NotificationDispatchEvent): Promise<void> {
    try {
      const recipientIds = await this.resolveRecipients(payload);

      if (recipientIds.length === 0) {
        return;
      }

      const targets = payload.dedupKey
        ? await this.filterDeduplicated(payload, recipientIds)
        : recipientIds;

      if (targets.length === 0) {
        return;
      }

      const rows = targets.map((recipientId) =>
        this.notificationRepo.create({
          tenantId: payload.tenantId,
          recipientId,
          type: payload.type,
          title: payload.title,
          body: payload.body,
          data: payload.data,
          dedupKey: payload.dedupKey,
        }),
      );

      await this.notificationRepo.save(rows);
    } catch (error: unknown) {
      this.logger.error(
        `Failed to persist notifications (tenant=${payload.tenantId}, type=${payload.type}, dedupKey=${payload.dedupKey ?? 'n/a'})`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async resolveRecipients(
    payload: NotificationDispatchEvent,
  ): Promise<string[]> {
    const recipients = new Set(payload.recipientIds);

    if (payload.recipientRoles.length > 0) {
      const users = await this.userRepo.find({
        where: {
          tenantId: payload.tenantId,
          role: In(payload.recipientRoles),
          isActive: true,
        },
        select: { id: true },
      });

      for (const user of users) {
        recipients.add(user.id);
      }
    }

    return [...recipients];
  }

  private async filterDeduplicated(
    payload: NotificationDispatchEvent,
    recipientIds: string[],
  ): Promise<string[]> {
    const alreadyNotified = await this.notificationRepo
      .createQueryBuilder('notification')
      .select('notification.recipientId', 'recipientId')
      .where('notification.tenant_id = :tenantId', {
        tenantId: payload.tenantId,
      })
      .andWhere('notification.type = :type', { type: payload.type })
      .andWhere('notification.dedup_key = :dedupKey', {
        dedupKey: payload.dedupKey,
      })
      .andWhere('notification.read_at IS NULL')
      .andWhere('notification.deleted_at IS NULL')
      .andWhere('notification.recipient_id IN (:...recipientIds)', {
        recipientIds,
      })
      .getRawMany<{ recipientId: string }>();

    const skip = new Set(alreadyNotified.map((row) => row.recipientId));

    return recipientIds.filter((id) => !skip.has(id));
  }
}
