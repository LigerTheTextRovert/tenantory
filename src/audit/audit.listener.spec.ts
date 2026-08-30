import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Logger } from '@nestjs/common';
import { AuditListener } from './audit.listener';
import { Audit } from './entities/audit.entity';
import { AuditAction } from './enums/audit-action.enum';
import { AuditedEntityType } from './enums/audited-entity-type';
import { AuditEvent } from './events/audit.event';

describe('AuditListener', () => {
  let listener: AuditListener;
  let repo: { create: jest.Mock; save: jest.Mock };

  const event: AuditEvent = {
    tenantId: '22222222-2222-2222-2222-222222222222',
    actorId: '33333333-3333-3333-3333-333333333333',
    action: AuditAction.UPDATE,
    entityType: AuditedEntityType.PRODUCT,
    entityId: '11111111-1111-1111-1111-111111111111',
    oldValues: { price: 10 },
    newValues: { price: 20 },
    metadata: { requestId: 'req-1' },
  };

  beforeEach(async () => {
    repo = {
      create: jest.fn((value: Audit) => value),
      save: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuditListener,
        { provide: getRepositoryToken(Audit), useValue: repo },
      ],
    }).compile();

    listener = moduleRef.get(AuditListener);
  });

  it('persists the audit event as an entity row', async () => {
    await listener.addAudit(event);

    expect(repo.create).toHaveBeenCalledWith({
      tenantId: event.tenantId,
      actorId: event.actorId,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId,
      oldValues: event.oldValues,
      newValues: event.newValues,
      metadata: event.metadata,
    });
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('swallows persistence failures so the business request is unaffected', async () => {
    repo.save.mockRejectedValueOnce(new Error('db down'));
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    await expect(listener.addAudit(event)).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledTimes(1);

    errorSpy.mockRestore();
  });
});
