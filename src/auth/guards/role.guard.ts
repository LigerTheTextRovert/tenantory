import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/auth.decorator';
import { UserRole } from '../enum/user-role.enum';
import { Request } from 'express';
import { User } from '../entities/user.entity';

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

    if (user.role === UserRole.SUPER_ADMIN) {
      return true;
    }

    const hasRequiredRoles = requiredRoles.some((role) => role === user.role);

    if (!hasRequiredRoles) {
      throw new ForbiddenException('Insufficient role permissions');
    }

    return true;
  }
}
