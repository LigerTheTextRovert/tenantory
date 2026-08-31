import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { AuditListener } from './audit.listener';
import { AuditContextInterceptor } from './audit-context.interceptor';
import {
  AUDIT_EVENT_EMITTER,
  AuditEventEmitterAdapter,
} from './audit-event-emitter.port';
import { Audit } from './entities/audit.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Audit])],
  controllers: [AuditController],
  providers: [
    AuditListener,
    AuditContextInterceptor,
    AuditEventEmitterAdapter,
    { provide: AUDIT_EVENT_EMITTER, useExisting: AuditEventEmitterAdapter },
    AuditService,
  ],
  exports: [AuditService],
})
export class AuditModule {}
