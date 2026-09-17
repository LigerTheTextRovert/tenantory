import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { StockMovementEvent } from './events/stock-movement.event';

export const INVENTORY_EVENT_EMITTER = Symbol('INVENTORY_EVENT_EMITTER');

export interface InventoryEventEmitter {
  emit(event: string, payload: StockMovementEvent): boolean;
}

@Injectable()
export class InventoryEventEmitterAdapter implements InventoryEventEmitter {
  constructor(
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- EventEmitter2's declaration chain fails to resolve under typescript-eslint's project service (tsc resolves it correctly); this adapter is the single boundary with the framework emitter.
    @Inject(EventEmitter2)
    private readonly emitter: InventoryEventEmitter,
  ) {}

  emit(event: string, payload: StockMovementEvent): boolean {
    return this.emitter.emit(event, payload);
  }
}
