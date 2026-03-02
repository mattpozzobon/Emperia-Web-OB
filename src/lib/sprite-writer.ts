/**
 * Compiles SpriteData back to .espr binary format.
 * If sprites have been modified, rebuilds the entire file with new encoded data.
 * If no sprites are modified, returns the original buffer byte-for-byte.
 */
import PacketWriter from './packet-writer';
import { EMPERIA_MAGIC, EMPERIA_HEADER_SIZE, EmperiaFileType, isEmperiaFormat } from './emperia-format';
import { encodeSprite } from './sprite-encoder';
import type { SpriteData } from './types';

/** Derive the correct Emperia feature-flags byte from a content version. */
function deriveFlags(version: number): number {
  let flags = 0;
  if (version >= 960)  flags |= 0x01; // extended
  if (version >= 960)  flags |= 0x02; // transparency
  if (version >= 1050) flags |= 0x04; // frameGroups
  if (version >= 1050) flags |= 0x08; // frameDurations
  return flags;
}

/** Ensure the flags byte at offset 0x0F is correct in an Emperia buffer. */
function patchHeaderFlags(buf: ArrayBuffer, version: number): ArrayBuffer {
  const bytes = new Uint8Array(buf);
  if (bytes.length >= EMPERIA_HEADER_SIZE && isEmperiaFormat(bytes)) {
    const expected = deriveFlags(version);
    if (bytes[0x0F] !== expected) {
      const patched = buf.slice(0);
      new Uint8Array(patched)[0x0F] = expected;
      return patched;
    }
  }
  return buf.slice(0);
}

export function compileSpriteData(
  data: SpriteData,
  spriteOverrides?: Map<number, ImageData>,
): ArrayBuffer {
  // Check if the atlas was resized (e.g. after compact) by comparing current
  // spriteCount against the count stored in the original buffer.
  let originalCount = 0;
  {
    const ob = data.originalBuffer;
    const hdr = isEmperiaFormat(new Uint8Array(ob));
    const off = hdr ? EMPERIA_HEADER_SIZE : 4; // skip header/signature
    const dv = new DataView(ob, off);
    originalCount = data.version > 760 ? dv.getUint32(0, true) : dv.getUint16(0, true);
  }
  const atlasResized = data.spriteCount !== originalCount;

  // No modifications and atlas wasn't resized? Return original file as-is.
  if ((!spriteOverrides || spriteOverrides.size === 0) && !atlasResized) {
    return patchHeaderFlags(data.originalBuffer, data.version);
  }

  // Encode all modified sprites upfront
  const encodedOverrides = new Map<number, Uint8Array>();
  for (const [id, imgData] of spriteOverrides ?? []) {
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
  const flags = deriveFlags(data.version);
  for (let i = 0; i < EMPERIA_MAGIC.length; i++) w.writeUInt8(EMPERIA_MAGIC[i]);
  w.writeUInt8(EmperiaFileType.SPRITE_DATA);
  w.writeUInt16(1);                    // formatVersion
  w.writeUInt32(data.version);         // contentVersion
  w.writeUInt8(flags);                 // flags
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
