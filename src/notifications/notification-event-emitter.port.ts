import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotificationDispatchEvent } from './events/notification.event';

export const NOTIFICATION_EVENT_EMITTER = Symbol('NOTIFICATION_EVENT_EMITTER');

export interface NotificationEventEmitter {
  emit(event: string, payload: NotificationDispatchEvent): boolean;
}

@Injectable()
export class NotificationEventEmitterAdapter implements NotificationEventEmitter {
  constructor(
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- EventEmitter2's declaration chain fails to resolve under typescript-eslint's project service (tsc resolves it correctly); this adapter is the single boundary with the framework emitter.
    @Inject(EventEmitter2)
    private readonly emitter: NotificationEventEmitter,
  ) {}

  emit(event: string, payload: NotificationDispatchEvent): boolean {
    return this.emitter.emit(event, payload);
  }
}
