import { AsyncLocalStorage } from 'async_hooks';

export interface TenantContextData {
  tenantId: string;
}

export const tenantAsyncStorage = new AsyncLocalStorage<TenantContextData>();
