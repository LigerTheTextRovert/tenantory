import {
  BadRequestException,
  Injectable,
  NestMiddleware,
  NotFoundException,
} from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { TenantService } from './tenant.service';
import { Tenant } from './entities/tenant.entity';

export interface TenantRequest extends Request {
  tenant: Tenant;
  tenantId: string;
}

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly tenantService: TenantService) {}
  async use(req: TenantRequest, _res: Response, next: NextFunction) {
    const tenantId = req.headers['X-Tenant-Id'];

    if (!tenantId) {
      throw new BadRequestException('Missing X-Tenant-ID header');
    }

    if (Array.isArray(tenantId)) {
      throw new BadRequestException(
        'Only single value for X-Tenant-ID id allowed',
      );
    }

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(tenantId)) {
      throw new BadRequestException('Invalid tenant ID format');
    }

    const tenant = await this.tenantService.findByIdAndValidate(tenantId);

    if (!tenant) {
      throw new NotFoundException('Tenant not found or is archived');
    }

    req['tenant'] = tenant;
    req['tenantId'] = tenant.id;

    next();
  }
}
