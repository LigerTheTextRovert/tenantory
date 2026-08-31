import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
import { AuditAction } from './enums/audit-action.enum';
import { AuditedEntityType } from './enums/audited-entity-type';
import {
  PaginatedResponse,
  PaginationMeta,
  PaginationLinks,
} from '../common/interfaces/paginated-response.interface';

export interface AuditLogReadModel {
  id: string;
  tenantId: string;
  actorId: string | null;
  action: AuditAction;
  entityType: AuditedEntityType;
  entityId: string;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  metadata: {
    ipAddress?: string | null;
    userAgent?: string | null;
    requestId?: string | null;
    reason?: string | null;
  } | null;
  createdAt: Date;
  actor: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
  } | null;
}

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
      actorId: context.actorId,
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
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.auditRepo
      .createQueryBuilder('audit')
      .leftJoin('audit.actor', 'actor')
      .select([
        'audit.id',
        'audit.tenantId',
        'audit.actorId',
        'audit.action',
        'audit.entityType',
        'audit.entityId',
        'audit.oldValues',
        'audit.newValues',
        'audit.metadata',
        'audit.createdAt',
        'actor.id',
        'actor.email',
        'actor.firstName',
        'actor.lastName',
        'actor.role',
      ])
      .where('audit.tenantId = :tenantId', { tenantId });

    this.applyFilters(qb, query);

    qb.orderBy('audit.createdAt', 'DESC');

    const [data, totalItems] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return this.buildPaginatedResponse(
      data as AuditLogReadModel[],
      totalItems,
      page,
      limit,
      '/api/v1/audit/logs',
    );
  }

  async findEntityLogs(
    tenantId: string,
    entityId: string,
    query: AuditQueryDto,
  ): Promise<PaginatedResponse<AuditLogReadModel>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.auditRepo
      .createQueryBuilder('audit')
      .leftJoin('audit.actor', 'actor')
      .select([
        'audit.id',
        'audit.tenantId',
        'audit.actorId',
        'audit.action',
        'audit.entityType',
        'audit.entityId',
        'audit.oldValues',
        'audit.newValues',
        'audit.metadata',
        'audit.createdAt',
        'actor.id',
        'actor.email',
        'actor.firstName',
        'actor.lastName',
        'actor.role',
      ])
      .where('audit.tenantId = :tenantId', { tenantId })
      .andWhere('audit.entityId = :entityId', { entityId });

    this.applyFilters(qb, query);

    qb.orderBy('audit.createdAt', 'DESC');

    const [data, totalItems] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return this.buildPaginatedResponse(
      data as AuditLogReadModel[],
      totalItems,
      page,
      limit,
      `/api/v1/audit/logs/${entityId}`,
    );
  }

  private applyFilters(
    qb: ReturnType<typeof this.auditRepo.createQueryBuilder>,
    query: AuditQueryDto,
  ): void {
    if (query.actorId) {
      qb.andWhere('audit.actorId = :actorId', { actorId: query.actorId });
    }

    if (query.action) {
      qb.andWhere('audit.action = :action', { action: query.action });
    }

    if (query.entityType) {
      qb.andWhere('audit.entityType = :entityType', {
        entityType: query.entityType,
      });
    }

    if (query.startDate) {
      qb.andWhere('audit.createdAt >= :startDate', {
        startDate: query.startDate,
      });
    }

    if (query.endDate) {
      qb.andWhere('audit.createdAt <= :endDate', { endDate: query.endDate });
    }
  }

  private buildPaginatedResponse(
    data: AuditLogReadModel[],
    totalItems: number,
    page: number,
    limit: number,
    basePath: string,
  ): PaginatedResponse<AuditLogReadModel> {
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

    return { data, meta, links };
  }
}
