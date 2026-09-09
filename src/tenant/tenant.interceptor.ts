import {
	type CallHandler,
	type ExecutionContext,
	Injectable,
	type NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import type { TenantRequest } from './tenant.type';
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
