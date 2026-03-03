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

  return { version, spriteCount, addresses, buffer: payload, originalBuffer: buffer };
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

export function getSpriteDataUrl(
  spriteData: SpriteData,
  id: number,
  overrides?: Map<number, ImageData>,
): string | null {
  if (id === 0) return null;

  const cached = spriteCache.get(id);
  if (cached) return cached;

  const imgData = overrides?.get(id) ?? decodeSprite(spriteData, id);
  if (!imgData) return null;

  ctx.clearRect(0, 0, 32, 32);
  ctx.putImageData(imgData, 0, 0);

  const url = canvas.toDataURL();
  spriteCache.set(id, url);
  return url;
}

export function clearSpriteCache(): void {
  spriteCache.clear();
  compositeCache.clear();
}

/**
 * Composite all sprites of a Thing's first frame group into a single data URL.
 * Handles multi-tile items (e.g. 2×2 = 64px) by stitching 32×32 tiles together.
 *
 * Tibia sprite ordering: for width W, height H the flat sprite array stores
 * tiles right-to-left, then bottom-to-top:
 *   index = x + y * W   where x=0 is rightmost col, y=0 is bottom row
 * So on canvas:  canvasX = (W - 1 - x) * 32,  canvasY = (H - 1 - y) * 32
 */
const compositeCache = new Map<string, string | null>();

export function compositeThingDataUrl(
  spriteData: SpriteData,
  thingId: number,
  width: number,
  height: number,
  sprites: number[],
  overrides?: Map<number, ImageData>,
): string | null {
  const key = `${thingId}:${sprites.slice(0, width * height).join(',')}`;
  const cached = compositeCache.get(key);
  if (cached !== undefined) return cached;

  const pw = width * 32;
  const ph = height * 32;
  const c = document.createElement('canvas');
  c.width = pw;
  c.height = ph;
  const cx = c.getContext('2d')!;

  let hasAny = false;
  const tileCount = width * height;
  for (let i = 0; i < tileCount; i++) {
    const sid = sprites[i];
    if (!sid || sid <= 0) continue;
    const imgData = overrides?.get(sid) ?? decodeSprite(spriteData, sid);
    if (!imgData) continue;
    hasAny = true;
    const x = i % width;
    const y = Math.floor(i / width);
    const canvasX = (width - 1 - x) * 32;
    const canvasY = (height - 1 - y) * 32;
    cx.putImageData(imgData, canvasX, canvasY);
  }

  const url = hasAny ? c.toDataURL() : null;
  compositeCache.set(key, url);
  return url;
}

export function clearSpriteCacheId(id: number): void {
  spriteCache.delete(id);
}
