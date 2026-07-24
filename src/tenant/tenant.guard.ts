import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenantStatus } from './entities/tenant.entity';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { TenantService } from './tenant.service';
import { TenantRequest } from './tenant.type';
import { isUUID } from 'class-validator';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenantService: TenantService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const req = context.switchToHttp().getRequest<TenantRequest>();
    const tenantId = req.headers['x-tenant-id'] as string | string[];

    if (!tenantId) {
      throw new BadRequestException('Missing X-Tenant-ID header');
    }

    if (Array.isArray(tenantId)) {
      throw new BadRequestException(
        'Only single value for X-Tenant-ID id allowed',
      );
    }

    const tenant = await this.tenantService.findByIdAndValidate(tenantId);

    if (!isUUID(tenantId)) {
      throw new BadRequestException('Invalid tenant ID format');
    }

    if (!tenant) {
      throw new NotFoundException('Tenant not found or is archived');
    }

    if (tenant.status !== TenantStatus.ACTIVE) {
      throw new ForbiddenException(
        `Tenant is currently ${tenant.status}. Access denied.`,
      );
    }

    return true;
  }
}
