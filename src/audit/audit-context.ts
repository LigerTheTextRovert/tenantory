import { AsyncLocalStorage } from 'async_hooks';

export interface AuditContextData {
  tenantId: string | null;
  actorId: string | null;
  requestId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
}

export const auditAsyncStorage = new AsyncLocalStorage<AuditContextData>();
