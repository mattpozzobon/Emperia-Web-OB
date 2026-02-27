/**
 * Parses .espr / .spr files and decodes individual sprites to ImageData.
 * Ported from Emperia-Client sprite-buffer.ts — standalone, no PixiJS deps.
 */
import PacketReader from './packet-reader';
import { parseEmperiaHeader, EMPERIA_HEADER_SIZE, EmperiaFileType } from './emperia-format';
import type { SpriteData } from './types';

const LEGACY_SIGNATURES: Record<string, number> = {
  "57BBD603": 1098,
};

export function parseSpriteData(buffer: ArrayBuffer): SpriteData {
  const header = parseEmperiaHeader(buffer);
  let version: number;
  let payloadOffset: number;

  if (header) {
    if (header.fileType !== EmperiaFileType.SPRITE_DATA) {
      throw new Error(`Expected sprite data (0x01), got 0x${header.fileType.toString(16)}`);
    }
    version = header.contentVersion;
    payloadOffset = EMPERIA_HEADER_SIZE;
  } else {
    const dv = new DataView(buffer);
    const sig = dv.getUint32(0, true).toString(16).toUpperCase();
    if (!(sig in LEGACY_SIGNATURES)) {
      throw new Error("Unknown sprite file format.");
    }
    version = LEGACY_SIGNATURES[sig];
    payloadOffset = 4;
  }

  const payload = new Uint8Array(buffer.slice(payloadOffset));
  const packet = new PacketReader(payload);

  const spriteCount = version > 760 ? packet.readUInt32() : packet.readUInt16();

  const addresses = new Map<number, number>();
  for (let i = 1; i <= spriteCount; i++) {
    const addr = packet.readUInt32();
    if (addr !== 0) {
      addresses.set(i, addr - payloadOffset);
    }
  }

  console.log(`[OB] Parsed sprite index: ${spriteCount} sprites, ${addresses.size} non-empty`);

  return { version, spriteCount, addresses, buffer: payload };
}

/**
 * Decode a single 32×32 sprite from the sprite data into RGBA pixel data.
 */
export function decodeSprite(spriteData: SpriteData, id: number): ImageData | null {
  const addr = spriteData.addresses.get(id);
  if (addr === undefined) return null;

  const buf = spriteData.buffer;
  const len = buf[addr + 3] + (buf[addr + 4] << 8);
  const pkt = new PacketReader(buf.slice(addr, addr + 5 + len));

  // Skip RGB transparency key + 2-byte compressed size
  pkt.readRGB();
  pkt.skip(2);

  const pixels = new Uint32Array(32 * 32);
  let ptr = 0;

  while (pkt.readable()) {
    const skip = pkt.readUInt16();
    const run = pkt.readUInt16();
    ptr += skip;
    for (let i = ptr; i < ptr + run; i++) {
      const r = pkt.readUInt8();
      const g = pkt.readUInt8();
      const b = pkt.readUInt8();
      const a = pkt.readUInt8();
      pixels[i] = (a << 24) | (b << 16) | (g << 8) | r;
    }
    ptr += run;
  }

  const imgData = new ImageData(32, 32);
  new Uint32Array(imgData.data.buffer).set(pixels);
  return imgData;
}

/**
 * Decode a sprite and return it as a data URL for use in <img> tags.
 */
const spriteCache = new Map<number, string>();
const canvas = document.createElement('canvas');
canvas.width = 32;
canvas.height = 32;
const ctx = canvas.getContext('2d')!;

export function getSpriteDataUrl(spriteData: SpriteData, id: number): string | null {
  if (id === 0) return null;

  const cached = spriteCache.get(id);
  if (cached) return cached;

  const imgData = decodeSprite(spriteData, id);
  if (!imgData) return null;

  ctx.clearRect(0, 0, 32, 32);
  ctx.putImageData(imgData, 0, 0);

  const url = canvas.toDataURL();
  spriteCache.set(id, url);
  return url;
}

export function clearSpriteCache(): void {
  spriteCache.clear();
}
