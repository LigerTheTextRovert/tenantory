import {
	type CanActivate,
	type ExecutionContext,
	ForbiddenException,
	Injectable,
	UnauthorizedException,
} from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, type Repository } from 'typeorm';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { Tenant } from './entities/tenant.entity';
import { tenantAsyncStorage } from './tenant-context';

@Injectable()
export class TenantGuard implements CanActivate {
	constructor(
		private readonly reflector: Reflector,
		@InjectRepository(Tenant)
		private readonly tenantRepo: Repository<Tenant>,
	) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
			context.getHandler(),
			context.getClass(),
		]);

		if (isPublic) {
			return true;
		}

		const tenantContext = tenantAsyncStorage.getStore();
		if (!tenantContext?.tenantId) {
			throw new UnauthorizedException('Missing or invalid tenant context');
		}

		const tenant = await this.tenantRepo.findOne({
			where: {
				id: tenantContext.tenantId,
				deletedAt: IsNull(),
			},
		});

		if (!tenant) {
			throw new ForbiddenException('Tenant not found or has been removed');
		}

		return true;
	}
}
