import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { auditAsyncStorage } from './audit-context';
import {
  AUDIT_EVENT_EMITTER,
  AuditEventEmitter,
} from './audit-event-emitter.port';
import {
  AUDIT_LOG_EVENT,
  AuditEvent,
  AuditEventInput,
} from './events/audit.event';
import { Audit } from './entities/audit.entity';
import { AuditQueryDto } from './dto/audit-query.dto';
import {
  PaginatedResponse,
  PaginationLinks,
  PaginationMeta,
} from '../common/interfaces/paginated-response.interface';

export interface AuditActorSummary {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export type AuditLogReadModel = Audit & { actor: AuditActorSummary | null };

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @Inject(AUDIT_EVENT_EMITTER)
    private readonly eventEmitter: AuditEventEmitter,
    @InjectRepository(Audit)
    private readonly auditRepo: Repository<Audit>,
  ) {}

  record(input: AuditEventInput): void {
    const context = auditAsyncStorage.getStore();

    if (!context?.tenantId) {
      this.logger.error(
        `Audit record rejected: missing tenant context (action=${input.action}, entity=${input.entityType}/${input.entityId})`,
      );
      throw new InternalServerErrorException(
        'Tenant context is required for audit logging',
      );
    }

    const event: AuditEvent = {
      tenantId: context.tenantId,
      actorId: input.actorId ?? context.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      oldValues: input.oldValues ?? null,
      newValues: input.newValues ?? null,
      metadata: {
        ipAddress: input.metadata?.ipAddress ?? context.ipAddress,
        userAgent: input.metadata?.userAgent ?? context.userAgent,
        requestId: input.metadata?.requestId ?? context.requestId,
        reason: input.metadata?.reason ?? null,
      },
    };

    this.eventEmitter.emit(AUDIT_LOG_EVENT, event);
  }

  async findLogs(
    tenantId: string,
    query: AuditQueryDto,
  ): Promise<PaginatedResponse<AuditLogReadModel>> {
    this.assertDateRange(query);

    const [data, totalItems] = await this.buildLogQuery(tenantId, query)
      .skip(((query.page ?? 1) - 1) * (query.limit ?? 20))
      .take(query.limit ?? 20)
      .getManyAndCount();

    return this.buildPaginatedResponse(
      data,
      totalItems,
      query,
      '/api/v1/audit/logs',
    );
  }

  async findEntityLogs(
    tenantId: string,
    entityId: string,
    query: AuditQueryDto,
  ): Promise<PaginatedResponse<AuditLogReadModel>> {
    this.assertDateRange(query);

    const [data, totalItems] = await this.buildLogQuery(tenantId, query)
      .andWhere('log.entity_id = :entityId', { entityId })
      .skip(((query.page ?? 1) - 1) * (query.limit ?? 20))
      .take(query.limit ?? 20)
      .getManyAndCount();

    return this.buildPaginatedResponse(
      data,
      totalItems,
      query,
      `/api/v1/audit/logs/${entityId}`,
    );
  }

  private buildLogQuery(
    tenantId: string,
    query: AuditQueryDto,
  ): SelectQueryBuilder<Audit> {
    const qb = this.auditRepo
      .createQueryBuilder('log')
      .where('log.tenant_id = :tenantId', { tenantId })
      .leftJoin('log.actor', 'actor')
      .addSelect([
        'actor.id',
        'actor.email',
        'actor.firstName',
        'actor.lastName',
      ]);

    if (query.actorId) {
      qb.andWhere('log.actor_id = :actorId', { actorId: query.actorId });
    }

    if (query.action) {
      qb.andWhere('log.action = :action', { action: query.action });
    }

    if (query.entityType) {
      qb.andWhere('log.entity_type = :entityType', {
        entityType: query.entityType,
      });
    }

    if (query.startDate) {
      qb.andWhere('log.created_at >= :startDate', {
        startDate: query.startDate,
      });
    }

    if (query.endDate) {
      qb.andWhere('log.created_at <= :endDate', { endDate: query.endDate });
    }

    qb.orderBy('log.created_at', 'DESC').addOrderBy('log.id', 'DESC');

    return qb;
  }

  private assertDateRange(query: AuditQueryDto): void {
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
    data: Audit[],
    totalItems: number,
    query: AuditQueryDto,
    basePath: string,
  ): PaginatedResponse<AuditLogReadModel> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const totalPages = Math.ceil(totalItems / limit) || 1;

    const buildLink = (targetPage: number): string =>
      `${basePath}?page=${targetPage}&limit=${limit}`;

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
