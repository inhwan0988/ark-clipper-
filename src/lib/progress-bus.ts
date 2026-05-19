import { EventEmitter } from 'events';
import type { ProgressEvent } from '@/types';

const globalForBus = globalThis as unknown as { progressBus?: EventEmitter };
export const progressBus: EventEmitter = globalForBus.progressBus ?? new EventEmitter();
globalForBus.progressBus = progressBus;
progressBus.setMaxListeners(50);

export function emitProgress(data: ProgressEvent) {
  progressBus.emit('progress', data);
}
