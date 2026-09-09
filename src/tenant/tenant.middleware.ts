import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NestMiddleware,
  NotFoundException,
} from '@nestjs/common';
import { NextFunction, Response } from 'express';
import { TenantRequest } from './tenant.type';
import { TenantService } from './tenant.service';
import { isUUID } from 'class-validator';
import { TenantStatus } from './entities/tenant.entity';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly tenantService: TenantService) {}
  async use(req: TenantRequest, res: Response, next: NextFunction) {
    const tenantId = req.headers['x-tenant-id'] as string | string[];

    if (!tenantId) {
      throw new BadRequestException('Missing X-Tenant-ID header');
    }

    if (Array.isArray(tenantId)) {
      throw new BadRequestException(
        'Only single value for X-Tenant-ID id allowed',
      );
    }

    if (!isUUID(tenantId)) {
      throw new BadRequestException('Invalid tenant ID format');
    }

    const tenant = await this.tenantService.findByIdAndValidate(tenantId);

    if (!tenant) {
      throw new NotFoundException('Tenant not found or is archived');
    }

    if (tenant.status !== TenantStatus.ACTIVE) {
      throw new ForbiddenException(
        `Tenant is currently ${tenant.status}. Access denied.`,
      );
    }

    req.tenantId = tenantId;
    req.tenant = tenant;

    next();
  }
}
