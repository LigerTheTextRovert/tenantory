import {
	type CanActivate,
	type ExecutionContext,
	ForbiddenException,
	Injectable,
	UnauthorizedException,
} from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ROLES_KEY } from '../decorators/auth.decorator';
import type { User } from '../entities/user.entity';
import type { UserRole } from '../enum/user-role.enum';

export interface RequestWithUser extends Request {
	user: User;
}

@Injectable()
export class RoleGuard implements CanActivate {
	constructor(private reflector: Reflector) {}
	canActivate(context: ExecutionContext): boolean {
		const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
			ROLES_KEY,
			[context.getHandler(), context.getClass()],
		);

		if (!requiredRoles) {
			return true;
		}

		const request = context.switchToHttp().getRequest<RequestWithUser>();
		const user = request.user;

		if (!user) {
			throw new UnauthorizedException('User not authenticated');
		}

		const hasRequiredRoles = requiredRoles.some((role) => role === user.role);

		if (!hasRequiredRoles) {
			throw new ForbiddenException('Insufficient role permissions');
		}

		return true;
	}
}
