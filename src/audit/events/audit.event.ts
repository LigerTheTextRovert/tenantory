import { AuditAction } from '../enums/audit-action.enum';
import { AuditedEntityType } from '../enums/audited-entity-type';

export const AUDIT_LOG_EVENT = 'audit.log';

export interface AuditMetadata {
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  reason?: string | null;
}

export interface AuditEventInput {
  action: AuditAction;
  entityType: AuditedEntityType;
  entityId: string;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  metadata?: AuditMetadata | null;
  /**
   * Explicit actor override for trusted system flows where no authenticated
   * request context exists yet (e.g. LOGIN). Never sourced from client input.
   */
  actorId?: string | null;
}

export interface AuditEvent extends AuditEventInput {
  tenantId: string;
  actorId: string | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  metadata: AuditMetadata | null;
}
