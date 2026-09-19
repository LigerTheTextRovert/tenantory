import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from './entities/tenant.entity';
import { TenantService } from './tenant.service';
import { TenantController } from './tenant.controller';
import { TenantGuard } from './tenant.guard';
import { TenantInterceptor } from './tenant.interceptor';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant])],
  controllers: [TenantController],
  providers: [TenantService, TenantGuard, TenantInterceptor],
  exports: [TypeOrmModule, TenantService],
})
// TenantMiddleware is registered once, app-wide, in AppModule.configure().
// A second registration here would execute it twice per matched request
// (double DB tenant validation) and bypass the AppModule exclusions.
export class TenantModule {}
