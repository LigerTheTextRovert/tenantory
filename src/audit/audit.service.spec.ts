import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditService } from './audit.service';
import { AUDIT_EVENT_EMITTER } from './audit-event-emitter.port';
import { auditAsyncStorage } from './audit-context';
import { AUDIT_LOG_EVENT, AuditEventInput } from './events/audit.event';
import { AuditAction } from './enums/audit-action.enum';
import { AuditedEntityType } from './enums/audited-entity-type';
import { Audit } from './entities/audit.entity';

describe('AuditService', () => {
  let service: AuditService;
  let emit: jest.Mock;
  let auditRepo: Record<string, jest.Mock>;

  const TENANT_ID = '22222222-2222-2222-2222-222222222222';
  const ACTOR_ID = '33333333-3333-3333-3333-333333333333';

  const baseInput: AuditEventInput = {
    action: AuditAction.UPDATE,
    entityType: AuditedEntityType.PRODUCT,
    entityId: '11111111-1111-1111-1111-111111111111',
    oldValues: { price: 10 },
    newValues: { price: 20 },
  };

  beforeEach(async () => {
    emit = jest.fn();
    auditRepo = { createQueryBuilder: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: AUDIT_EVENT_EMITTER, useValue: { emit } },
        { provide: getRepositoryToken(Audit), useValue: auditRepo },
      ],
    }).compile();

    service = moduleRef.get(AuditService);
  });

  it('rejects the record and does not emit when tenant context is missing', () => {
    expect(() => service.record(baseInput)).toThrow(
      InternalServerErrorException,
    );
    expect(emit).not.toHaveBeenCalled();
  });

  it('emits a fully resolved event using the ambient audit context', () => {
    auditAsyncStorage.run(
      {
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        requestId: 'req-1',
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
      },
      () => service.record(baseInput),
    );

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(
      AUDIT_LOG_EVENT,
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        action: AuditAction.UPDATE,
        entityType: AuditedEntityType.PRODUCT,
        entityId: baseInput.entityId,
        oldValues: { price: 10 },
        newValues: { price: 20 },
        metadata: {
          ipAddress: '127.0.0.1',
          userAgent: 'jest',
          requestId: 'req-1',
          reason: null,
        },
      }),
    );
  });

  it('records with a null actor and null metadata when no user is authenticated', () => {
    auditAsyncStorage.run(
      {
        tenantId: TENANT_ID,
        actorId: null,
        requestId: null,
        ipAddress: null,
        userAgent: null,
      },
      () => service.record(baseInput),
    );

    expect(emit).toHaveBeenCalledWith(
      AUDIT_LOG_EVENT,
      expect.objectContaining({
        actorId: null,
        metadata: {
          ipAddress: null,
          userAgent: null,
          requestId: null,
          reason: null,
        },
      }),
    );
  });

  it('lets explicit metadata override the ambient request metadata', () => {
    auditAsyncStorage.run(
      {
        tenantId: TENANT_ID,
        actorId: null,
        requestId: 'req-1',
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
      },
      () =>
        service.record({
          ...baseInput,
          metadata: { reason: 'price correction', ipAddress: '10.0.0.1' },
        }),
    );

    expect(emit).toHaveBeenCalledWith(
      AUDIT_LOG_EVENT,
      expect.objectContaining({
        metadata: {
          ipAddress: '10.0.0.1',
          userAgent: 'jest',
          requestId: 'req-1',
          reason: 'price correction',
        },
      }),
    );
  });

  describe('findLogs', () => {
    const row = { id: 'log-1', tenantId: TENANT_ID } as Audit;
    let qb: Record<string, jest.Mock>;

    beforeEach(() => {
      qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[row], 1]),
      };
      auditRepo.createQueryBuilder.mockReturnValue(qb);
    });

    it('always scopes the query to the caller tenant (RLF)', async () => {
      await service.findLogs(TENANT_ID, {});

      expect(qb.where).toHaveBeenCalledWith('log.tenant_id = :tenantId', {
        tenantId: TENANT_ID,
      });
    });

    it('selects only the safe actor summary columns (never passwordHash)', async () => {
      await service.findLogs(TENANT_ID, {});

      expect(qb.addSelect).toHaveBeenCalledWith([
        'actor.id',
        'actor.email',
        'actor.firstName',
        'actor.lastName',
      ]);
    });

    it('applies the optional filters and paginates', async () => {
      await service.findLogs(TENANT_ID, {
        page: 2,
        limit: 10,
        actorId: ACTOR_ID,
        action: AuditAction.CREATE,
        entityType: AuditedEntityType.PRODUCT,
        startDate: '2026-08-01T00:00:00.000Z',
        endDate: '2026-08-31T23:59:59.999Z',
      });

      const filters = (qb.andWhere.mock.calls as unknown[][]).map(
        (call) => call[0],
      );
      expect(filters).toContain('log.actor_id = :actorId');
      expect(filters).toContain('log.action = :action');
      expect(filters).toContain('log.entity_type = :entityType');
      expect(filters).toContain('log.created_at >= :startDate');
      expect(filters).toContain('log.created_at <= :endDate');
      expect(qb.skip).toHaveBeenCalledWith(10);
      expect(qb.take).toHaveBeenCalledWith(10);
    });

    it('builds the paginated envelope', async () => {
      const response = await service.findLogs(TENANT_ID, {
        page: 1,
        limit: 20,
      });

      expect(response.data).toEqual([row]);
      expect(response.meta).toMatchObject({
        totalItems: 1,
        itemCount: 1,
        itemsPerPage: 20,
        totalPages: 1,
        currentPage: 1,
      });
      expect(response.links.first).toContain('/api/v1/audit/logs?page=1');
    });

    it('rejects an inverted date range', async () => {
      await expect(
        service.findLogs(TENANT_ID, {
          startDate: '2026-08-31T00:00:00.000Z',
          endDate: '2026-08-01T00:00:00.000Z',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('scopes entity logs to the tenant and the entity id', async () => {
      await service.findEntityLogs(TENANT_ID, baseInput.entityId, {});

      const filters = (qb.andWhere.mock.calls as unknown[][]).map(
        (call) => call[0],
      );
      expect(filters).toContain('log.entity_id = :entityId');
      expect(qb.where).toHaveBeenCalledWith('log.tenant_id = :tenantId', {
        tenantId: TENANT_ID,
      });
    });
  });
});
