import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import {
  NOTIFICATION_EVENT_EMITTER,
  NotificationEventEmitter,
} from './notification-event-emitter.port';
import {
  NOTIFICATION_DISPATCH_EVENT,
  NotificationDispatchEvent,
  NotificationDispatchInput,
} from './events/notification.event';
import { Notification } from './entities/notification.entity';
import { NotificationQueryDto } from './dto/notification-query.dto';
import {
  PaginatedResponse,
  PaginationLinks,
  PaginationMeta,
} from '../common/interfaces/paginated-response.interface';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @Inject(NOTIFICATION_EVENT_EMITTER)
    private readonly eventEmitter: NotificationEventEmitter,
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
  ) {}

  dispatch(input: NotificationDispatchInput): void {
    if (!input.tenantId) {
      this.logger.error(
        `Notification dispatch rejected: missing tenant context (type=${input.type})`,
      );
      throw new InternalServerErrorException(
        'Tenant context is required to dispatch notifications',
      );
    }

    if (
      (input.recipientIds?.length ?? 0) === 0 &&
      (input.recipientRoles?.length ?? 0) === 0
    ) {
      this.logger.warn(
        `Notification dispatch skipped: no recipients (tenant=${input.tenantId}, type=${input.type})`,
      );
      return;
    }

    const event: NotificationDispatchEvent = {
      tenantId: input.tenantId,
      recipientIds: input.recipientIds ?? [],
      recipientRoles: input.recipientRoles ?? [],
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      data: input.data ?? null,
      dedupKey: input.dedupKey ?? null,
    };

    this.eventEmitter.emit(NOTIFICATION_DISPATCH_EVENT, event);
  }

  async findFeed(
    tenantId: string,
    recipientId: string,
    query: NotificationQueryDto,
  ): Promise<PaginatedResponse<Notification>> {
    this.assertDateRange(query);

    const [data, totalItems] = await this.buildFeedQuery(
      tenantId,
      recipientId,
      query,
    )
      .skip(((query.page ?? 1) - 1) * (query.limit ?? 20))
      .take(query.limit ?? 20)
      .getManyAndCount();

    return this.buildPaginatedResponse(data, totalItems, query);
  }

  async getUnreadCount(tenantId: string, recipientId: string): Promise<number> {
    return this.buildFeedQuery(tenantId, recipientId)
      .andWhere('notification.read_at IS NULL')
      .getCount();
  }

  async markRead(
    tenantId: string,
    recipientId: string,
    id: string,
  ): Promise<void> {
    const result = await this.notificationRepo
      .createQueryBuilder('notification')
      .update(Notification)
      .set({ readAt: new Date() })
      .where(
        'notification.id = :id AND notification.tenant_id = :tenantId AND notification.recipient_id = :recipientId',
        { id, tenantId, recipientId },
      )
      .andWhere('notification.read_at IS NULL')
      .andWhere('notification.deleted_at IS NULL')
      .execute();

    if ((result.affected ?? 0) > 0) {
      return;
    }

    // Zero affected rows: either already read (idempotent success) or not
    // found / not owned by this recipient (must not leak existence).
    const existing = await this.notificationRepo.findOne({
      where: { id, tenantId, recipientId },
    });

    if (!existing) {
      throw new NotFoundException(`Notification with ID ${id} not found`);
    }
  }

  async markAllRead(tenantId: string, recipientId: string): Promise<number> {
    const result = await this.notificationRepo
      .createQueryBuilder('notification')
      .update(Notification)
      .set({ readAt: () => 'CURRENT_TIMESTAMP' })
      .where(
        'notification.tenant_id = :tenantId AND notification.recipient_id = :recipientId',
        { tenantId, recipientId },
      )
      .andWhere('notification.read_at IS NULL')
      .andWhere('notification.deleted_at IS NULL')
      .execute();

    return result.affected ?? 0;
  }

  async remove(
    tenantId: string,
    recipientId: string,
    id: string,
  ): Promise<void> {
    const result = await this.notificationRepo.softDelete({
      id,
      tenantId,
      recipientId,
    });

    if ((result.affected ?? 0) === 0) {
      throw new NotFoundException(`Notification with ID ${id} not found`);
    }
  }

  private buildFeedQuery(
    tenantId: string,
    recipientId: string,
    query?: NotificationQueryDto,
  ): SelectQueryBuilder<Notification> {
    const qb = this.notificationRepo
      .createQueryBuilder('notification')
      .where('notification.tenant_id = :tenantId', { tenantId })
      .andWhere('notification.recipient_id = :recipientId', { recipientId })
      .andWhere('notification.deleted_at IS NULL');

    if (query?.unreadOnly) {
      qb.andWhere('notification.read_at IS NULL');
    }

    if (query?.type) {
      qb.andWhere('notification.type = :type', { type: query.type });
    }

    if (query?.startDate) {
      qb.andWhere('notification.created_at >= :startDate', {
        startDate: query.startDate,
      });
    }

    if (query?.endDate) {
      qb.andWhere('notification.created_at <= :endDate', {
        endDate: query.endDate,
      });
    }

    qb.orderBy('notification.created_at', 'DESC').addOrderBy(
      'notification.id',
      'DESC',
    );

    return qb;
  }

  private assertDateRange(query: NotificationQueryDto): void {
    if (!query.startDate || !query.endDate) {
      return;
    }

    const start = new Date(query.startDate);
    const end = new Date(query.endDate);

    if (start.getTime() > end.getTime()) {
      throw new BadRequestException('startDate must not be after endDate');
    }
  }

  private buildPaginatedResponse(
    data: Notification[],
    totalItems: number,
    query: NotificationQueryDto,
  ): PaginatedResponse<Notification> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const totalPages = Math.ceil(totalItems / limit) || 1;

    const buildLink = (targetPage: number): string =>
      `/api/v1/notifications?page=${targetPage}&limit=${limit}`;

    const meta: PaginationMeta = {
      totalItems,
      itemCount: data.length,
      itemsPerPage: limit,
      totalPages,
      currentPage: page,
    };

    const links: PaginationLinks = {
      first: buildLink(1),
      previous: page > 1 ? buildLink(page - 1) : null,
      next: page < totalPages ? buildLink(page + 1) : null,
      last: buildLink(totalPages),
    };

    return { data: data, meta, links };
  }
}
