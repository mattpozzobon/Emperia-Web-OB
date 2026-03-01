/**
 * Equipment sprite mapping actions for the OB store.
 */
import type { ItemToSpriteEntry, ItemToSpriteFile } from '../lib/types';
import type { OBState } from './store-types';

type Set_ = (partial: Partial<OBState>) => void;
type Get_ = () => OBState;

export function createSpriteMapSlice(set: Set_, get: Get_) {
  return {
    loadSpriteMap: (json: ItemToSpriteFile) => {
      const entries = Array.isArray(json.items) ? json.items : [];
      set({ spriteMapEntries: entries, spriteMapLoaded: true });
      console.log(`[OB] Loaded sprite map: ${entries.length} entries`);
    },

    updateSpriteMapEntry: (index: number, entry: ItemToSpriteEntry) => {
      const entries = [...get().spriteMapEntries];
      entries[index] = entry;
      set({ spriteMapEntries: entries, dirty: true, editVersion: get().editVersion + 1 });
    },

    addSpriteMapEntry: (entry: ItemToSpriteEntry) => {
      const entries = [entry, ...get().spriteMapEntries];
      set({ spriteMapEntries: entries, dirty: true, editVersion: get().editVersion + 1 });
    },

    removeSpriteMapEntry: (index: number) => {
      const entries = get().spriteMapEntries.filter((_, i) => i !== index);
      set({ spriteMapEntries: entries, dirty: true, editVersion: get().editVersion + 1 });
    },

    exportSpriteMapJson: (): string => {
      return JSON.stringify({ items: get().spriteMapEntries }, null, 2);
    },
  };
}
