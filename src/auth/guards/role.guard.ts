import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/auth.decorator';
import { UserRole } from '../enum/user-role.enum';

export class RoleGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const requiredRole = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRole) {
      return true;
    }

    // TODO: we need to use a proper type for the request that contains user info, we need JwtGuard
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    if (user.role === UserRole.SUPER_ADMIN) {
      return true;
    }

    const hasRequiredRoles = requiredRole.some((role) => role === user.role);

    if (!hasRequiredRoles) {
      throw new ForbiddenException('Insufficient role permissions');
    }

    return true;
  }
}
