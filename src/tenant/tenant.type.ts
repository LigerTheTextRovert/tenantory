import { Tenant } from './entities/tenant.entity';

export interface TenantRequest extends Request {
  tenant: Tenant;
  tenantId: string;
}
