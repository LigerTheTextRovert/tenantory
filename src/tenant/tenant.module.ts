import {
	type MiddlewareConsumer,
	Module,
	type NestModule,
} from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from './entities/tenant.entity';
import { TenantController } from './tenant.controller';
import { TenantGuard } from './tenant.guard';
import { TenantInterceptor } from './tenant.interceptor';
import { TenantMiddleware } from './tenant.middleware';
import { TenantService } from './tenant.service';

@Module({
	imports: [TypeOrmModule.forFeature([Tenant])],
	controllers: [TenantController],
	providers: [TenantService, TenantGuard, TenantInterceptor, TenantMiddleware],
	exports: [TypeOrmModule, TenantService],
})
export class TenantModule implements NestModule {
	configure(consumer: MiddlewareConsumer) {
		consumer.apply(TenantMiddleware).forRoutes('*');
	}
}
