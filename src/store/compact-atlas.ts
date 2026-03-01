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

      // Step 2: Determine which IDs are "non-blank" — have real data or are referenced
      // A sprite is kept if: (a) it's referenced by a thing, OR (b) it has pixel data
      const keepIds = new Set<number>();
      for (let id = 1; id <= oldCount; id++) {
        if (referencedIds.has(id)) {
          keepIds.add(id);
          continue;
        }
        // Check if it has real data (address in original OR non-blank override)
        const hasAddr = spriteData.addresses.has(id);
        const override = spriteOverrides.get(id);
        if (override) {
          // Check if override is fully transparent (blank from deleteSprite)
          let hasPixel = false;
          for (let i = 3; i < override.data.length; i += 4) {
            if (override.data[i] > 0) { hasPixel = true; break; }
          }
          if (hasPixel) keepIds.add(id);
        } else if (hasAddr) {
          keepIds.add(id);
        }
      }

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

      console.log(`[OB] Compacted sprite atlas: ${oldCount} → ${newCount} (removed ${removed} blank/unreferenced sprites)`);
      return { removed, oldCount, newCount };
    },
  };
}
