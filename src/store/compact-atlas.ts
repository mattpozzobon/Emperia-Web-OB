/**
 * Sprite atlas compaction logic for the OB store.
 *
 * Two-phase compaction:
 *   Phase A — Deduplication: hash the raw bytes of every referenced sprite,
 *             merge duplicates so all things point at a single canonical ID.
 *   Phase B — Garbage collection: remove unreferenced sprite IDs and renumber
 *             the remaining ones sequentially (1-based).
 */
import { clearSpriteCache } from '../lib/sprite-decoder';
import { encodeSprite } from '../lib/sprite-encoder';
import type { SpriteData } from '../lib/types';
import type { OBState } from './store-types';

type Set_ = (partial: Partial<OBState>) => void;
type Get_ = () => OBState;

// ── helpers ──────────────────────────────────────────────────────────────────

/** Extract the raw encoded bytes for a single sprite (override → encode, else original buffer). */
function getRawSpriteBytes(
  id: number,
  spriteData: SpriteData,
  spriteOverrides: Map<number, ImageData>,
): Uint8Array | null {
  const override = spriteOverrides.get(id);
  if (override) return encodeSprite(override);

  const addr = spriteData.addresses.get(id);
  if (addr === undefined) return null;

  const buf = spriteData.buffer;
  const len = buf[addr + 3] + (buf[addr + 4] << 8);
  return buf.slice(addr, addr + 5 + len);
}

/**
 * Check if a sprite's raw encoded bytes represent a fully transparent (blank) image.
 * A blank sprite has compressed-data size = 0, meaning bytes 3-4 are both 0x00.
 * The total raw length is exactly 5 (3-byte transparency key + 2-byte size of 0).
 */
function isSpriteBlank(
  id: number,
  spriteData: SpriteData,
  spriteOverrides: Map<number, ImageData>,
): boolean {
  const override = spriteOverrides.get(id);
  if (override) {
    // Check if every pixel has alpha = 0
    const data = new Uint32Array(override.data.buffer);
    for (let i = 0; i < data.length; i++) {
      if ((data[i] >> 24) & 0xFF) return false; // any non-zero alpha → not blank
    }
    return true;
  }
  const addr = spriteData.addresses.get(id);
  if (addr === undefined) return true; // no address = effectively blank
  // Compressed data size at offset 3-4 (LE). If 0 → no opaque pixels.
  const len = spriteData.buffer[addr + 3] + (spriteData.buffer[addr + 4] << 8);
  return len === 0;
}

/** Byte-level equality check for two Uint8Arrays. */
function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** Fast non-crypto hash (FNV-1a 32-bit) of a byte array → hex string. */
function hashBytes(bytes: Uint8Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

// ── action ───────────────────────────────────────────────────────────────────

export function createCompactAtlasAction(set: Set_, get: Get_) {
  return {
    compactSpriteAtlas: (): { removed: number; deduplicated: number; blanked: number; oldCount: number; newCount: number } | null => {
      const { objectData, spriteData, spriteOverrides, dirtySpriteIds, editVersion } = get();
      if (!objectData || !spriteData) return null;

      const oldCount = spriteData.spriteCount;

      // ── Phase 0: Blank sprite coalescing ────────────────────────────
      // Detect fully-transparent sprites referenced by things and remap
      // them to sprite ID 0 (null sprite). This frees up atlas slots.
      let blanked = 0;
      for (const thing of objectData.things.values()) {
        let changed = false;
        for (const fg of thing.frameGroups) {
          for (let i = 0; i < fg.sprites.length; i++) {
            const sid = fg.sprites[i];
            if (sid > 0 && isSpriteBlank(sid, spriteData, spriteOverrides)) {
              fg.sprites[i] = 0;
              changed = true;
              blanked++;
            }
          }
        }
        if (changed) thing.rawBytes = undefined;
      }

      // ── Phase 0b: Cleared-thing stripping ───────────────────────────
      // Things whose sprites are ALL 0 (cleared/blank placeholders) —
      // ensure rawBytes is cleared so the .eobj writer re-serializes
      // from minimal parsed data instead of the old (larger) cached bytes.
      for (const thing of objectData.things.values()) {
        if (!thing.rawBytes) continue;
        const allZero = thing.frameGroups.every(fg => fg.sprites.every(s => s === 0));
        if (allZero) thing.rawBytes = undefined;
      }

      // ── Phase A: Deduplicate identical sprites ────────────────────────

      // Collect all sprite IDs referenced by any thing
      const referencedIds = new Set<number>();
      for (const thing of objectData.things.values()) {
        for (const fg of thing.frameGroups) {
          for (const sid of fg.sprites) {
            if (sid > 0) referencedIds.add(sid);
          }
        }
      }

      // Hash every referenced sprite and build canonical mapping.
      // For each group of sprites with identical bytes, the lowest ID wins.
      // We store canonical bytes alongside the ID to verify hash matches
      // (FNV-1a 32-bit can collide).
      const hashToCanonical = new Map<string, { id: number; bytes: Uint8Array }>();
      const dedupRemap = new Map<number, number>();       // duplicate ID → canonical ID
      let deduplicated = 0;

      for (const id of referencedIds) {
        const bytes = getRawSpriteBytes(id, spriteData, spriteOverrides);
        if (!bytes) continue;

        const h = hashBytes(bytes);
        const existing = hashToCanonical.get(h);

        if (existing == null) {
          hashToCanonical.set(h, { id, bytes });
        } else if (existing.id !== id && bytesEqual(bytes, existing.bytes)) {
          // Verified duplicate — point this ID to the canonical one
          dedupRemap.set(id, existing.id);
          deduplicated++;
        }
      }

      // Apply dedup remap to all thing references (before GC pass)
      if (dedupRemap.size > 0) {
        for (const thing of objectData.things.values()) {
          let changed = false;
          for (const fg of thing.frameGroups) {
            for (let i = 0; i < fg.sprites.length; i++) {
              const canonical = dedupRemap.get(fg.sprites[i]);
              if (canonical != null) {
                fg.sprites[i] = canonical;
                changed = true;
              }
            }
          }
          if (changed) thing.rawBytes = undefined;
        }
      }

      // ── Phase B: Garbage-collect unreferenced sprites ─────────────────

      // Re-collect references (some IDs are now orphaned after dedup + blank coalescing)
      const keepIds = new Set<number>();
      for (const thing of objectData.things.values()) {
        for (const fg of thing.frameGroups) {
          for (const sid of fg.sprites) {
            if (sid > 0) keepIds.add(sid);
          }
        }
      }

      const removed = oldCount - keepIds.size;
      if (removed === 0 && deduplicated === 0 && blanked === 0) {
        return { removed: 0, deduplicated: 0, blanked: 0, oldCount, newCount: oldCount };
      }

      // Build old → new ID remap (sequential, 1-based)
      const remap = new Map<number, number>();
      let nextId = 1;
      for (let id = 1; id <= oldCount; id++) {
        if (keepIds.has(id)) {
          remap.set(id, nextId);
          nextId++;
        }
      }
      const newCount = nextId - 1;

      // Remap all thing frameGroup sprite references
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

      // Remap spriteOverrides keys
      const newOverrides = new Map<number, ImageData>();
      for (const [oldId, imgData] of spriteOverrides) {
        const newId = remap.get(oldId);
        if (newId != null) newOverrides.set(newId, imgData);
      }

      // Remap dirtySpriteIds and mark all kept sprites dirty for re-encode
      const newDirtySpriteIds = new Set<number>();
      for (const oldId of dirtySpriteIds) {
        const newId = remap.get(oldId);
        if (newId != null) newDirtySpriteIds.add(newId);
      }
      for (let id = 1; id <= newCount; id++) newDirtySpriteIds.add(id);

      // Rebuild spriteData.addresses
      const newAddresses = new Map<number, number>();
      for (const [oldId, addr] of spriteData.addresses) {
        const newId = remap.get(oldId);
        if (newId != null) newAddresses.set(newId, addr);
      }
      spriteData.addresses = newAddresses;
      spriteData.spriteCount = newCount;

      // Mark all things dirty
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

      return { removed, deduplicated, blanked, oldCount, newCount };
    },
  };
}
