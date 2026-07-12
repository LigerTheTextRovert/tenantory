import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { TenantRequest } from '../../tenant/tenant.middleware';

export const TenantDecorator = createParamDecorator(
  (
    data: 'id' | 'object' | undefined,
    ctx: ExecutionContext,
  ): string | Tenant => {
    const req = ctx.switchToHttp().getRequest<TenantRequest>();

    if (data === 'id') {
      return req.tenantId;
    }

    if (data === 'object') {
      return req.tenant;
    }

    return req.tenantId;
  },
);
