/**
 * Re-export shim — the store has been split into src/store/*.
 * All existing imports from '../store' or './store' continue to work.
 */
export { useOBStore } from './store/store';
export type { OBState } from './store/store-types';
export { getDisplayId, getThingsForCategory } from './store/derived';
