import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
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

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @Inject(AUDIT_EVENT_EMITTER)
    private readonly eventEmitter: AuditEventEmitter,
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
}
