/**
 * Sprite group actions for the OB store.
 * Groups are collections of imported sprites that form logical multi-tile units.
 */
import type { OBState } from './store-types';

type Set_ = (partial: Partial<OBState> | ((s: OBState) => Partial<OBState>)) => void;
type Get_ = () => OBState;

export function createSpriteGroupSlice(set: Set_, get: Get_) {
  return {
    addSpriteGroup: (label: string, cols: number, rows: number, spriteIds: number[]): number => {
      const id = get().nextSpriteGroupId;
      set((s) => ({
        spriteGroups: [...s.spriteGroups, { id, label, cols, rows, spriteIds }],
        nextSpriteGroupId: id + 1,
      }));
      return id;
    },

    removeSpriteGroup: (id: number): void => {
      set((s) => ({
        spriteGroups: s.spriteGroups.filter((g) => g.id !== id),
      }));
    },

    clearSpriteGroups: (): void => {
      set({ spriteGroups: [] });
    },
  };
}
