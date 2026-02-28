/**
 * OBD (Object Builder Data) encoder / decoder.
 *
 * Fully compatible with the original AIR Object Builder's .obd format.
 * Uses LZMA compression (same as Flash's ByteArray.compress(CompressionAlgorithm.LZMA)).
 *
 * Binary layout (after LZMA decompression):
 *   UInt16  obdVersion     (300)
 *   UInt16  clientVersion  (e.g. 1098)
 *   UInt8   category       (1=item, 2=outfit, 3=effect, 4=distance)
 *   UInt32  spritesOffset  (byte offset to sprite data section)
 *   --- flags section (same as original OB) ---
 *   UInt8[] flags          (terminated by 0xFF)
 *   --- frame groups section ---
 *   [if outfit] UInt8 groupCount
 *   per group:
 *     [if outfit] UInt8 groupType
 *     UInt8 width, height
 *     [if w>1||h>1] UInt8 exactSize
 *     UInt8 layers, patternX, patternY, patternZ, frames
 *     [if frames>1] UInt8 animMode, Int32 loopCount, UInt8 startFrame
 *                    per frame: UInt32 minDuration, UInt32 maxDuration
 *     per sprite:
 *       UInt32 spriteId
 *       UInt32 dataSize
 *       UInt8[dataSize] pixels (RGBA 32×32 = 4096 bytes)
 *
 * The entire buffer is LZMA-compressed.
 */

import { compress as lzmaCompress, decompress as lzmaDecompress } from 'lzma1';
import type { ThingType, ThingFlags, FrameGroup, ThingCategory } from './types';
import { decodeSprite } from './sprite-decoder';
import type { SpriteData } from './types';

// ── Constants ────────────────────────────────────────────────────────────
const OBD_VERSION = 300;
const LAST_FLAG = 0xFF;
const SPRITE_PIXEL_SIZE = 4096; // 32 * 32 * 4

const CATEGORY_MAP: Record<ThingCategory, number> = { item: 1, outfit: 2, effect: 3, distance: 4 };
const CATEGORY_REVERSE: Record<number, ThingCategory> = { 1: 'item', 2: 'outfit', 3: 'effect', 4: 'distance' };

// ── Flag constants (matching original OB OBDEncoder) ─────────────────────
const FLAG = {
  GROUND: 0x00, GROUND_BORDER: 0x01, ON_BOTTOM: 0x02, ON_TOP: 0x03,
  CONTAINER: 0x04, STACKABLE: 0x05, FORCE_USE: 0x06, MULTI_USE: 0x07,
  WRITABLE: 0x08, WRITABLE_ONCE: 0x09, FLUID_CONTAINER: 0x0A, FLUID: 0x0B,
  UNPASSABLE: 0x0C, UNMOVEABLE: 0x0D, BLOCK_MISSILE: 0x0E, BLOCK_PATHFIND: 0x0F,
  NO_MOVE_ANIMATION: 0x10, PICKUPABLE: 0x11, HANGABLE: 0x12,
  HOOK_SOUTH: 0x13, HOOK_EAST: 0x14, ROTATABLE: 0x15,
  HAS_LIGHT: 0x16, DONT_HIDE: 0x17, TRANSLUCENT: 0x18,
  HAS_OFFSET: 0x19, HAS_ELEVATION: 0x1A, LYING_OBJECT: 0x1B,
  ANIMATE_ALWAYS: 0x1C, MINI_MAP: 0x1D, LENS_HELP: 0x1E,
  FULL_GROUND: 0x1F, IGNORE_LOOK: 0x20, CLOTH: 0x21,
  MARKET_ITEM: 0x22, DEFAULT_ACTION: 0x23,
  WRAPPABLE: 0x24, UNWRAPPABLE: 0x25, TOP_EFFECT: 0x26,
  HAS_CHARGES: 0xFC, FLOOR_CHANGE: 0xFD, USABLE: 0xFE,
} as const;

// ── Pixel format conversion ──────────────────────────────────────────────
// Flash BitmapData stores pixels as ARGB (big-endian), canvas ImageData is RGBA.
/** Convert RGBA pixel buffer to ARGB (big-endian) for OBD export. */
function rgbaToArgb(rgba: Uint8Array): Uint8Array {
  const argb = new Uint8Array(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    argb[i]     = rgba[i + 3]; // A
    argb[i + 1] = rgba[i];     // R
    argb[i + 2] = rgba[i + 1]; // G
    argb[i + 3] = rgba[i + 2]; // B
  }
  return argb;
}

/** Convert ARGB (big-endian) pixel buffer to RGBA for canvas ImageData. */
function argbToRgba(argb: Uint8Array): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(argb.length);
  for (let i = 0; i < argb.length; i += 4) {
    rgba[i]     = argb[i + 1]; // R
    rgba[i + 1] = argb[i + 2]; // G
    rgba[i + 2] = argb[i + 3]; // B
    rgba[i + 3] = argb[i];     // A
  }
  return rgba;
}

// ── Tiny binary writer ───────────────────────────────────────────────────
class BWriter {
  private buf: Uint8Array;
  private view: DataView;
  pos = 0;

  constructor(size = 65536) {
    this.buf = new Uint8Array(size);
    this.view = new DataView(this.buf.buffer);
  }

  private grow(need: number) {
    while (this.pos + need > this.buf.length) {
      const next = new Uint8Array(this.buf.length * 2);
      next.set(this.buf);
      this.buf = next;
      this.view = new DataView(this.buf.buffer);
    }
  }

  u8(v: number) { this.grow(1); this.view.setUint8(this.pos, v); this.pos += 1; }
  u16(v: number) { this.grow(2); this.view.setUint16(this.pos, v, true); this.pos += 2; }
  i16(v: number) { this.grow(2); this.view.setInt16(this.pos, v, true); this.pos += 2; }
  u32(v: number) { this.grow(4); this.view.setUint32(this.pos, v, true); this.pos += 4; }
  i32(v: number) { this.grow(4); this.view.setInt32(this.pos, v, true); this.pos += 4; }
  bytes(data: Uint8Array) { this.grow(data.length); this.buf.set(data, this.pos); this.pos += data.length; }

  result(): Uint8Array { return this.buf.slice(0, this.pos); }

  /** Write a UInt32 at a specific position without advancing pos */
  patchU32(offset: number, v: number) { this.view.setUint32(offset, v, true); }
}

// ── Tiny binary reader ───────────────────────────────────────────────────
class BReader {
  private view: DataView;
  pos = 0;

  constructor(private data: Uint8Array) {
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  }

  u8() { const v = this.view.getUint8(this.pos); this.pos += 1; return v; }
  u16() { const v = this.view.getUint16(this.pos, true); this.pos += 2; return v; }
  i16() { const v = this.view.getInt16(this.pos, true); this.pos += 2; return v; }
  u32() { const v = this.view.getUint32(this.pos, true); this.pos += 4; return v; }
  i32() { const v = this.view.getInt32(this.pos, true); this.pos += 4; return v; }
  bytes(n: number) { const s = this.data.slice(this.pos, this.pos + n); this.pos += n; return s; }
  str(n: number) { return new TextDecoder('latin1').decode(this.bytes(n)); }
}

// ── Flag serialization ───────────────────────────────────────────────────
function writeFlags(w: BWriter, f: ThingFlags) {
  if (f.ground) { w.u8(FLAG.GROUND); w.u16(f.groundSpeed ?? 0); }
  else if (f.groundBorder) w.u8(FLAG.GROUND_BORDER);
  else if (f.onBottom) w.u8(FLAG.ON_BOTTOM);
  else if (f.onTop) w.u8(FLAG.ON_TOP);

  if (f.container) w.u8(FLAG.CONTAINER);
  if (f.stackable) w.u8(FLAG.STACKABLE);
  if (f.forceUse) w.u8(FLAG.FORCE_USE);
  if (f.multiUse) w.u8(FLAG.MULTI_USE);
  if (f.writable) { w.u8(FLAG.WRITABLE); w.u16(f.writableMaxLen ?? 0); }
  if (f.writableOnce) { w.u8(FLAG.WRITABLE_ONCE); w.u16(f.writableOnceMaxLen ?? 0); }
  if (f.fluidContainer) w.u8(FLAG.FLUID_CONTAINER);
  if (f.splash) w.u8(FLAG.FLUID);
  if (f.notWalkable) w.u8(FLAG.UNPASSABLE);
  if (f.notMoveable) w.u8(FLAG.UNMOVEABLE);
  if (f.blockProjectile) w.u8(FLAG.BLOCK_MISSILE);
  if (f.notPathable) w.u8(FLAG.BLOCK_PATHFIND);
  if (f.noMoveAnimation) w.u8(FLAG.NO_MOVE_ANIMATION);
  if (f.pickupable) w.u8(FLAG.PICKUPABLE);
  if (f.hangable) w.u8(FLAG.HANGABLE);
  if (f.hookSouth) w.u8(FLAG.HOOK_SOUTH);
  if (f.hookEast) w.u8(FLAG.HOOK_EAST);
  if (f.rotateable) w.u8(FLAG.ROTATABLE);
  if (f.hasLight) { w.u8(FLAG.HAS_LIGHT); w.u16(f.lightLevel ?? 0); w.u16(f.lightColor ?? 0); }
  if (f.dontHide) w.u8(FLAG.DONT_HIDE);
  if (f.translucent) w.u8(FLAG.TRANSLUCENT);
  if (f.hasDisplacement) { w.u8(FLAG.HAS_OFFSET); w.i16(f.displacementX ?? 0); w.i16(f.displacementY ?? 0); }
  if (f.hasElevation) { w.u8(FLAG.HAS_ELEVATION); w.u16(f.elevation ?? 0); }
  if (f.lyingCorpse) w.u8(FLAG.LYING_OBJECT);
  if (f.animateAlways) w.u8(FLAG.ANIMATE_ALWAYS);
  if (f.hasMinimapColor) { w.u8(FLAG.MINI_MAP); w.u16(f.minimapColor ?? 0); }
  if (f.lensHelp != null) { w.u8(FLAG.LENS_HELP); w.u16(f.lensHelp); }
  if (f.fullGround) w.u8(FLAG.FULL_GROUND);
  if (f.look) w.u8(FLAG.IGNORE_LOOK);
  if (f.cloth) { w.u8(FLAG.CLOTH); w.u16(f.clothSlot ?? 0); }
  if (f.hasMarket) {
    w.u8(FLAG.MARKET_ITEM);
    w.u16(f.marketCategory ?? 0);
    w.u16(f.marketTradeAs ?? 0);
    w.u16(f.marketShowAs ?? 0);
    const name = f.marketName ?? '';
    w.u16(name.length);
    for (let i = 0; i < name.length; i++) w.u8(name.charCodeAt(i) & 0xFF);
    w.u16(f.marketRestrictVocation ?? 0);
    w.u16(f.marketRequiredLevel ?? 0);
  }
  if (f.usable) { w.u8(FLAG.DEFAULT_ACTION); w.u16(f.usableActionId ?? 0); }
  if (f.wrapable) w.u8(FLAG.WRAPPABLE);
  if (f.unwrapable) w.u8(FLAG.UNWRAPPABLE);
  if (f.topEffect) w.u8(FLAG.TOP_EFFECT);
  if (f.chargeable) w.u8(FLAG.HAS_CHARGES);
  w.u8(LAST_FLAG);
}

function readFlags(r: BReader): ThingFlags {
  const f: ThingFlags = {
    ground: false, groundBorder: false, onBottom: false, onTop: false,
    container: false, stackable: false, forceUse: false, multiUse: false,
    writable: false, writableOnce: false, fluidContainer: false, splash: false,
    notWalkable: false, notMoveable: false, blockProjectile: false, notPathable: false,
    pickupable: false, hangable: false, hookSouth: false, hookEast: false,
    rotateable: false, hasLight: false, dontHide: false, translucent: false,
    hasDisplacement: false, hasElevation: false, lyingCorpse: false,
    animateAlways: false, hasMinimapColor: false, fullGround: false, look: false,
    cloth: false, hasMarket: false, usable: false, wrapable: false,
    unwrapable: false, topEffect: false, noMoveAnimation: false, chargeable: false,
  };

  while (true) {
    const flag = r.u8();
    if (flag === LAST_FLAG) break;
    switch (flag) {
      case FLAG.GROUND: f.ground = true; f.groundSpeed = r.u16(); break;
      case FLAG.GROUND_BORDER: f.groundBorder = true; break;
      case FLAG.ON_BOTTOM: f.onBottom = true; break;
      case FLAG.ON_TOP: f.onTop = true; break;
      case FLAG.CONTAINER: f.container = true; break;
      case FLAG.STACKABLE: f.stackable = true; break;
      case FLAG.FORCE_USE: f.forceUse = true; break;
      case FLAG.MULTI_USE: f.multiUse = true; break;
      case FLAG.WRITABLE: f.writable = true; f.writableMaxLen = r.u16(); break;
      case FLAG.WRITABLE_ONCE: f.writableOnce = true; f.writableOnceMaxLen = r.u16(); break;
      case FLAG.FLUID_CONTAINER: f.fluidContainer = true; break;
      case FLAG.FLUID: f.splash = true; break;
      case FLAG.UNPASSABLE: f.notWalkable = true; break;
      case FLAG.UNMOVEABLE: f.notMoveable = true; break;
      case FLAG.BLOCK_MISSILE: f.blockProjectile = true; break;
      case FLAG.BLOCK_PATHFIND: f.notPathable = true; break;
      case FLAG.NO_MOVE_ANIMATION: f.noMoveAnimation = true; break;
      case FLAG.PICKUPABLE: f.pickupable = true; break;
      case FLAG.HANGABLE: f.hangable = true; break;
      case FLAG.HOOK_SOUTH: f.hookSouth = true; break;
      case FLAG.HOOK_EAST: f.hookEast = true; break;
      case FLAG.ROTATABLE: f.rotateable = true; break;
      case FLAG.HAS_LIGHT: f.hasLight = true; f.lightLevel = r.u16(); f.lightColor = r.u16(); break;
      case FLAG.DONT_HIDE: f.dontHide = true; break;
      case FLAG.TRANSLUCENT: f.translucent = true; break;
      case FLAG.HAS_OFFSET: f.hasDisplacement = true; f.displacementX = Math.max(0, r.i16()); f.displacementY = Math.max(0, r.i16()); break;
      case FLAG.HAS_ELEVATION: f.hasElevation = true; f.elevation = r.u16(); break;
      case FLAG.LYING_OBJECT: f.lyingCorpse = true; break;
      case FLAG.ANIMATE_ALWAYS: f.animateAlways = true; break;
      case FLAG.MINI_MAP: f.hasMinimapColor = true; f.minimapColor = r.u16(); break;
      case FLAG.LENS_HELP: f.lensHelp = r.u16(); break;
      case FLAG.FULL_GROUND: f.fullGround = true; break;
      case FLAG.IGNORE_LOOK: f.look = true; break;
      case FLAG.CLOTH: f.cloth = true; f.clothSlot = r.u16(); break;
      case FLAG.MARKET_ITEM: {
        f.hasMarket = true;
        f.marketCategory = r.u16();
        f.marketTradeAs = r.u16();
        f.marketShowAs = r.u16();
        const len = r.u16();
        f.marketName = r.str(len);
        f.marketRestrictVocation = r.u16();
        f.marketRequiredLevel = r.u16();
        break;
      }
      case FLAG.DEFAULT_ACTION: f.usable = true; f.usableActionId = r.u16(); break;
      case FLAG.HAS_CHARGES: f.chargeable = true; break;
      case FLAG.FLOOR_CHANGE: break; // floorChange not in our ThingFlags, skip
      case FLAG.WRAPPABLE: f.wrapable = true; break;
      case FLAG.UNWRAPPABLE: f.unwrapable = true; break;
      case FLAG.TOP_EFFECT: f.topEffect = true; break;
      case FLAG.USABLE: f.usable = true; break;
      default: throw new Error(`Unknown OBD flag 0x${flag.toString(16)}`);
    }
  }
  return f;
}

// ── Export ────────────────────────────────────────────────────────────────

export interface OBDExportOptions {
  thing: ThingType;
  clientVersion: number;
  spriteData: SpriteData;
  spriteOverrides: Map<number, ImageData>;
}

/**
 * Encode a ThingType + its sprite pixel data into an OBD V3 buffer.
 * Returns an LZMA-compressed Uint8Array ready to save as .obd file.
 */
export function encodeOBD(opts: OBDExportOptions): Uint8Array {
  const { thing, clientVersion, spriteData, spriteOverrides } = opts;
  const w = new BWriter();

  // Header
  w.u16(OBD_VERSION);
  w.u16(clientVersion);
  w.u8(CATEGORY_MAP[thing.category] ?? 1);

  // Reserve space for sprites offset
  const spritesOffsetPos = w.pos;
  w.u32(0); // placeholder

  // Flags
  writeFlags(w, thing.flags);

  // Patch sprites offset
  w.patchU32(spritesOffsetPos, w.pos);

  // Frame groups
  const isOutfit = thing.category === 'outfit';
  const groupCount = thing.frameGroups.length;

  if (isOutfit) {
    w.u8(groupCount);
  }

  for (let g = 0; g < groupCount; g++) {
    if (isOutfit) {
      w.u8(groupCount < 2 ? 1 : g);
    }

    const fg = thing.frameGroups[g];
    w.u8(fg.width);
    w.u8(fg.height);
    if (fg.width > 1 || fg.height > 1) w.u8(32); // exactSize

    w.u8(fg.layers);
    w.u8(fg.patternX);
    w.u8(fg.patternY);
    w.u8(fg.patternZ || 1);
    w.u8(fg.animationLength);

    if (fg.animationLength > 1) {
      w.u8(fg.asynchronous);
      w.i32(fg.nLoop);
      w.u8(fg.start);
      for (let f = 0; f < fg.animationLength; f++) {
        const dur = fg.animationLengths[f] ?? { min: 100, max: 100 };
        w.u32(dur.min);
        w.u32(dur.max);
      }
    }

    // Sprites: write pixel data for each sprite
    for (let i = 0; i < fg.sprites.length; i++) {
      const spriteId = fg.sprites[i];
      w.u32(spriteId);

      let pixels: Uint8Array;
      if (spriteId === 0) {
        pixels = new Uint8Array(SPRITE_PIXEL_SIZE);
      } else {
        const override = spriteOverrides.get(spriteId);
        const decoded = override ?? decodeSprite(spriteData, spriteId);
        if (decoded) {
          // Convert RGBA (canvas) → ARGB (Flash BitmapData) for OBD compatibility
          pixels = rgbaToArgb(new Uint8Array(decoded.data.buffer, decoded.data.byteOffset, decoded.data.byteLength));
        } else {
          pixels = new Uint8Array(SPRITE_PIXEL_SIZE);
        }
      }

      w.u32(pixels.length);
      w.bytes(pixels);
    }
  }

  // Compress with LZMA (compatible with original AIR Object Builder)
  return lzmaCompress(w.result(), 5);
}

// ── Import ───────────────────────────────────────────────────────────────

export interface OBDImportResult {
  category: ThingCategory;
  clientVersion: number;
  flags: ThingFlags;
  frameGroups: FrameGroup[];
  /** Map of spriteId → RGBA pixel data (ImageData-compatible) */
  spritePixels: Map<number, ImageData>;
}

/**
 * Decode an OBD file buffer into thing data + sprite pixels.
 * Supports OBD V2 and V3 with LZMA compression (original AIR Object Builder format).
 * V1 is detected and rejected with a clear message.
 */
export function decodeOBD(compressed: Uint8Array): OBDImportResult {
  let raw: Uint8Array;
  try {
    raw = lzmaDecompress(compressed);
  } catch (e) {
    throw new Error(`Failed to decompress OBD file. Ensure this is a valid .obd file.\n${e instanceof Error ? e.message : e}`);
  }

  if (raw.length < 9) throw new Error('OBD file too small.');

  const r = new BReader(raw);
  const firstU16 = r.u16();

  // Detect OBD version
  // V3 = 300, V2 = 200, V1 = client version (>= 710)
  let obdVersion: number;
  let clientVersion: number;

  if (firstU16 === 300) {
    obdVersion = 3;
    clientVersion = r.u16();
  } else if (firstU16 === 200) {
    obdVersion = 2;
    clientVersion = r.u16();
  } else if (firstU16 >= 710) {
    // V1: first two bytes are the client version itself
    throw new Error(
      `This is an OBD Version 1 file (client ${firstU16}). ` +
      'V1 is not supported — please re-export from the Object Builder as V2 or V3.'
    );
  } else {
    throw new Error(`Unrecognised OBD header: 0x${firstU16.toString(16)} (${firstU16}). Not a valid .obd file.`);
  }

  const categoryByte = r.u8();
  const category = CATEGORY_REVERSE[categoryByte];
  if (!category) throw new Error(`Invalid category byte: ${categoryByte}`);

  r.u32(); // skip sprites offset (used by OB to jump ahead, we just read sequentially)

  // Read flags
  const flags = readFlags(r);

  // Read frame groups
  const isOutfit = category === 'outfit';
  let groupCount = 1;
  if (isOutfit && obdVersion === 3) {
    groupCount = r.u8();
  }

  const frameGroups: FrameGroup[] = [];
  const spritePixels = new Map<number, ImageData>();

  for (let g = 0; g < groupCount; g++) {
    if (isOutfit && obdVersion === 3) {
      r.u8(); // group type byte
    }

    const width = r.u8();
    const height = r.u8();
    if (width > 1 || height > 1) r.u8(); // exactSize

    const layers = r.u8();
    const patternX = r.u8();
    const patternY = r.u8();
    const patternZ = r.u8() || 1;
    const frames = r.u8();

    let asynchronous = 0;
    let nLoop = 0;
    let start = 0;
    const animationLengths: { min: number; max: number }[] = [];

    if (frames > 1) {
      // V2 and V3 both have animation metadata when frames > 1
      asynchronous = r.u8();
      nLoop = r.i32();
      start = r.u8();
      for (let f = 0; f < frames; f++) {
        animationLengths.push({ min: r.u32(), max: r.u32() });
      }
    } else {
      animationLengths.push({ min: 0, max: 0 });
    }

    const totalSprites = width * height * layers * patternX * patternY * patternZ * frames;
    const sprites: number[] = [];

    for (let i = 0; i < totalSprites; i++) {
      const spriteId = r.u32();
      sprites.push(spriteId);

      let pixelData: Uint8Array;
      if (obdVersion === 3) {
        // V3: variable-size sprite data with length prefix
        const dataSize = r.u32();
        pixelData = r.bytes(dataSize);
      } else {
        // V2: fixed-size sprite data (always 4096 bytes)
        pixelData = r.bytes(SPRITE_PIXEL_SIZE);
      }

      if (spriteId > 0 && pixelData.length === SPRITE_PIXEL_SIZE && !spritePixels.has(spriteId)) {
        // Convert ARGB (Flash BitmapData) → RGBA (canvas ImageData)
        const rgbaPixels = argbToRgba(pixelData);
        const imgData = new ImageData(rgbaPixels as never, 32, 32);
        spritePixels.set(spriteId, imgData);
      }
    }

    frameGroups.push({
      type: g,
      width,
      height,
      layers,
      patternX,
      patternY,
      patternZ,
      animationLength: frames,
      asynchronous,
      nLoop,
      start,
      animationLengths,
      sprites,
    });
  }

  return { category, clientVersion, flags, frameGroups, spritePixels };
}
