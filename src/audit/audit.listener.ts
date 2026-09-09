import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import { Audit } from './entities/audit.entity';
import { AUDIT_LOG_EVENT, AuditEvent } from './events/audit.event';

@Injectable()
export class AuditListener {
  private readonly logger = new Logger(AuditListener.name);

  constructor(
    @InjectRepository(Audit)
    private readonly auditRepo: Repository<Audit>,
  ) {}

  @OnEvent(AUDIT_LOG_EVENT)
  async addAudit(payload: AuditEvent): Promise<void> {
    try {
      const auditLog = this.auditRepo.create({
        tenantId: payload.tenantId,
        actorId: payload.actorId,
        action: payload.action,
        entityType: payload.entityType,
        entityId: payload.entityId,
        oldValues: payload.oldValues,
        newValues: payload.newValues,
        metadata: payload.metadata,
      });

      await this.auditRepo.save(auditLog);
    } catch (error: unknown) {
      this.logger.error(
        `Failed to persist audit log (tenant=${payload.tenantId}, action=${payload.action}, entity=${payload.entityType}/${payload.entityId})`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
