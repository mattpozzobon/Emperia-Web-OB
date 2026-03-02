/**
 * Sprite atlas compaction logic for the OB store.
 */
import { clearSpriteCache } from '../lib/sprite-decoder';
import type { OBState } from './store-types';

type Set_ = (partial: Partial<OBState>) => void;
type Get_ = () => OBState;

export function createCompactAtlasAction(set: Set_, get: Get_) {
  return {
    compactSpriteAtlas: (): { removed: number; oldCount: number; newCount: number } | null => {
      const { objectData, spriteData, spriteOverrides, dirtySpriteIds, editVersion } = get();
      if (!objectData || !spriteData) return null;

      const oldCount = spriteData.spriteCount;

      // Step 1: Collect all sprite IDs referenced by any thing
      const referencedIds = new Set<number>();
      for (const thing of objectData.things.values()) {
        for (const fg of thing.frameGroups) {
          for (const sid of fg.sprites) {
            if (sid > 0) referencedIds.add(sid);
          }
        }
      }

      // Step 2: Keep only sprites that are actually referenced by a thing.
      // Unreferenced sprites are dead weight regardless of pixel content.
      const keepIds = referencedIds;

      const removed = oldCount - keepIds.size;
      if (removed === 0) return { removed: 0, oldCount, newCount: oldCount };

      // Step 3: Build old → new ID remap (sequential, 1-based)
      const remap = new Map<number, number>();
      let nextId = 1;
      for (let id = 1; id <= oldCount; id++) {
        if (keepIds.has(id)) {
          remap.set(id, nextId);
          nextId++;
        }
      }
      const newCount = nextId - 1;

      // Step 4: Remap all thing frameGroup sprite references
      const allDirtyIds = new Set<number>();
      for (const thing of objectData.things.values()) {
        let changed = false;
        for (const fg of thing.frameGroups) {
          for (let i = 0; i < fg.sprites.length; i++) {
            const old = fg.sprites[i];
            if (old === 0) continue;
            const mapped = remap.get(old);
            if (mapped != null && mapped !== old) {
              fg.sprites[i] = mapped;
              changed = true;
            } else if (mapped == null) {
              // Sprite was removed — set to 0
              fg.sprites[i] = 0;
              changed = true;
            }
          }
        }
        if (changed) {
          thing.rawBytes = undefined;
          allDirtyIds.add(thing.id);
        }
      }

      // Step 5: Remap spriteOverrides keys
      const newOverrides = new Map<number, ImageData>();
      for (const [oldId, imgData] of spriteOverrides) {
        const newId = remap.get(oldId);
        if (newId != null) newOverrides.set(newId, imgData);
      }

      // Step 6: Remap dirtySpriteIds
      const newDirtySpriteIds = new Set<number>();
      for (const oldId of dirtySpriteIds) {
        const newId = remap.get(oldId);
        if (newId != null) newDirtySpriteIds.add(newId);
      }
      // Also mark all kept sprites as dirty so they get re-encoded
      for (let id = 1; id <= newCount; id++) newDirtySpriteIds.add(id);

      // Step 7: Rebuild spriteData.addresses
      const newAddresses = new Map<number, number>();
      for (const [oldId, addr] of spriteData.addresses) {
        const newId = remap.get(oldId);
        if (newId != null) newAddresses.set(newId, addr);
      }
      spriteData.addresses = newAddresses;
      spriteData.spriteCount = newCount;

      // Step 8: Mark all things dirty (IDs may not change but sprite refs did)
      const mergedDirtyIds = new Set(get().dirtyIds);
      for (const id of allDirtyIds) mergedDirtyIds.add(id);

      clearSpriteCache();

      set({
        dirty: true,
        dirtyIds: mergedDirtyIds,
        spriteOverrides: newOverrides,
        dirtySpriteIds: newDirtySpriteIds,
        editVersion: editVersion + 1,
      });

      return { removed, oldCount, newCount };
    },
  };
}
