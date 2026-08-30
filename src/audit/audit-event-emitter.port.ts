import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditEvent } from './events/audit.event';

export const AUDIT_EVENT_EMITTER = Symbol('AUDIT_EVENT_EMITTER');

export interface AuditEventEmitter {
  emit(event: string, payload: AuditEvent): boolean;
}

@Injectable()
export class AuditEventEmitterAdapter implements AuditEventEmitter {
  constructor(
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- EventEmitter2's declaration chain fails to resolve under typescript-eslint's project service (tsc resolves it correctly); this adapter is the single boundary with the framework emitter.
    @Inject(EventEmitter2)
    private readonly emitter: AuditEventEmitter,
  ) {}

  emit(event: string, payload: AuditEvent): boolean {
    return this.emitter.emit(event, payload);
  }
}
