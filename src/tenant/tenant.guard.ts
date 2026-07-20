import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenantRequest } from './tenant.middleware';
import { TenantStatus } from './entities/tenant.entity';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const req = context.switchToHttp().getRequest<TenantRequest>();
    const tenant = req['tenant'];

    if (!tenant) {
      throw new ForbiddenException('No tenant context established');
    }

    if (tenant.status !== TenantStatus.ACTIVE) {
      throw new ForbiddenException(
        `Tenant is currently ${tenant.status}. Access denied.`,
      );
    }

    return true;
  }
}
