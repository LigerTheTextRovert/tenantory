import { Test } from '@nestjs/testing';
import { InternalServerErrorException } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AUDIT_EVENT_EMITTER } from './audit-event-emitter.port';
import { auditAsyncStorage } from './audit-context';
import { AUDIT_LOG_EVENT, AuditEventInput } from './events/audit.event';
import { AuditAction } from './enums/audit-action.enum';
import { AuditedEntityType } from './enums/audited-entity-type';

describe('AuditService', () => {
  let service: AuditService;
  let emit: jest.Mock;

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

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: AUDIT_EVENT_EMITTER, useValue: { emit } },
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
});
