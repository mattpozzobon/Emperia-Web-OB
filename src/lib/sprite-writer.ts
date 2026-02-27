/**
 * Compiles SpriteData back to .espr binary format.
 * If sprites have been modified, rebuilds the entire file with new encoded data.
 * If no sprites are modified, returns the original buffer byte-for-byte.
 */
import PacketWriter from './packet-writer';
import { EMPERIA_MAGIC, EMPERIA_HEADER_SIZE, EmperiaFileType } from './emperia-format';
import { encodeSprite } from './sprite-encoder';
import type { SpriteData } from './types';

export function compileSpriteData(
  data: SpriteData,
  spriteOverrides?: Map<number, ImageData>,
): ArrayBuffer {
  // No modifications? Return original file byte-for-byte.
  if (!spriteOverrides || spriteOverrides.size === 0) {
    console.log('[OB] Sprite compile: no edits, returning original buffer');
    return data.originalBuffer.slice(0);
  }

  console.log(`[OB] Sprite compile: rebuilding with ${spriteOverrides.size} modified sprite(s)`);

  // Encode all modified sprites upfront
  const encodedOverrides = new Map<number, Uint8Array>();
  for (const [id, imgData] of spriteOverrides) {
    encodedOverrides.set(id, encodeSprite(imgData));
  }

  // Phase 1: Build all sprite data blobs and record their sizes
  // We need to know addresses before writing, so collect all sprite bytes first.
  const spriteBlobs = new Map<number, Uint8Array>();
  for (let i = 1; i <= data.spriteCount; i++) {
    const override = encodedOverrides.get(i);
    if (override) {
      spriteBlobs.set(i, override);
    } else {
      const addr = data.addresses.get(i);
      if (addr !== undefined) {
        // Extract original sprite bytes from payload
        const buf = data.buffer;
        const len = buf[addr + 3] + (buf[addr + 4] << 8);
        spriteBlobs.set(i, buf.slice(addr, addr + 5 + len));
      }
    }
  }

  // Phase 2: Calculate layout
  const headerSize = EMPERIA_HEADER_SIZE;
  const countSize = data.version > 760 ? 4 : 2;
  const addressTableSize = data.spriteCount * 4;
  const dataStart = headerSize + countSize + addressTableSize;

  // Calculate addresses for each sprite
  const addresses = new Map<number, number>();
  let currentOffset = dataStart;
  for (let i = 1; i <= data.spriteCount; i++) {
    const blob = spriteBlobs.get(i);
    if (blob) {
      addresses.set(i, currentOffset);
      currentOffset += blob.length;
    }
  }

  // Phase 3: Write the file
  const w = new PacketWriter(currentOffset + 1024);

  // Emperia header
  for (let i = 0; i < EMPERIA_MAGIC.length; i++) w.writeUInt8(EMPERIA_MAGIC[i]);
  w.writeUInt8(EmperiaFileType.SPRITE_DATA);
  w.writeUInt16(1);                    // formatVersion
  w.writeUInt32(data.version);         // contentVersion
  w.writeUInt8(0);                     // flags
  w.writeUInt32(0);                    // reserved

  // Sprite count
  if (data.version > 760) w.writeUInt32(data.spriteCount);
  else w.writeUInt16(data.spriteCount);

  // Address table
  for (let i = 1; i <= data.spriteCount; i++) {
    w.writeUInt32(addresses.get(i) ?? 0);
  }

  // Sprite data blobs
  for (let i = 1; i <= data.spriteCount; i++) {
    const blob = spriteBlobs.get(i);
    if (blob) w.writeBytes(blob);
  }

  return w.toArrayBuffer();
}
