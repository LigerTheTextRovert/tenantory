import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantContextData {
	tenantId: string;
}

export const tenantAsyncStorage = new AsyncLocalStorage<TenantContextData>();
