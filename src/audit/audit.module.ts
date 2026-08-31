import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Audit } from './entities/audit.entity';
import { AuditService } from './audit.service';
import { AuditListener } from './audit.listener';
import { AuditController } from './audit.controller';
import {
  AuditEventEmitterAdapter,
  AUDIT_EVENT_EMITTER,
} from './audit-event-emitter.port';

@Module({
  imports: [TypeOrmModule.forFeature([Audit])],
  controllers: [AuditController],
  providers: [
    AuditService,
    AuditListener,
    { provide: AUDIT_EVENT_EMITTER, useClass: AuditEventEmitterAdapter },
  ],
  exports: [AuditService],
})
export class AuditModule {}
