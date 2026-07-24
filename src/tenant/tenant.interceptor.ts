import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { TenantRequest } from './tenant.type';
import { tenantAsyncStorage } from './tenant-context';

@Injectable()
export class TenantInterceptor implements NestInterceptor {
  intercept<T>(context: ExecutionContext, next: CallHandler<T>): Observable<T> {
    const req = context.switchToHttp().getRequest<TenantRequest>();
    const tenantId = req.tenantId;

    if (!tenantId) {
      return next.handle();
    }

    return tenantAsyncStorage.run({ tenantId }, () => next.handle());
  }
}
