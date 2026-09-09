import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { Request } from 'express';
import { AuditContextData, auditAsyncStorage } from './audit-context';

type AuditableRequest = Request & {
  tenantId?: string;
  requestId?: string;
  user?: { id?: string };
};

@Injectable()
export class AuditContextInterceptor implements NestInterceptor {
  intercept<T>(context: ExecutionContext, next: CallHandler<T>): Observable<T> {
    const req = context.switchToHttp().getRequest<AuditableRequest>();

    const auditContext: AuditContextData = {
      tenantId: req.tenantId ?? null,
      actorId: req.user?.id ?? null,
      requestId: req.requestId ?? null,
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    };

    return auditAsyncStorage.run(auditContext, () => next.handle());
  }
}
