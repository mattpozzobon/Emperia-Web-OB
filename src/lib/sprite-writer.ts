/**
 * Compiles SpriteData back to .espr binary format.
 * For now, returns the original buffer since we're not editing sprites yet.
 * Sprite editing (Phase 3) will modify the payload before writing.
 */
import type { SpriteData } from './types';

export function compileSpriteData(data: SpriteData): ArrayBuffer {
  // No sprite editing yet — return original file byte-for-byte
  return data.originalBuffer.slice(0);
}
