import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { InjectRepository } from '@nestjs/typeorm';
import { Tenant } from './entities/tenant.entity';
import { IsNull, Repository } from 'typeorm';
import { tenantAsyncStorage } from './tenant-context';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const tenantContext = tenantAsyncStorage.getStore();
    if (!tenantContext) {
      return false;
    }
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const tenant = await this.tenantRepo.findOne({
      where: {
        id: tenantContext.tenantId,
        deletedAt: IsNull(),
      },
    });

    if (tenant) {
      return true;
    }

    return false;
  }
}
