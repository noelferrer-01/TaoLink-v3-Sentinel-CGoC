import { publish, subscribe, _resetForTests } from './service';

export const events = { publish, subscribe };

export type { EventHandler } from './service';
export { _resetForTests as _resetEventsForTests };
