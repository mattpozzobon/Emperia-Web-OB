/**
 * Outfit color palette and mask application logic.
 * Ported from the Emperia client's Outfit class and SpriteBuffer.applyOutfitMask().
 *
 * Mask channel convention (ABGR as Uint32):
 *   0xFF00FFFF = Yellow channel (Head)
 *   0xFF0000FF = Red channel   (Body)
 *   0xFF00FF00 = Green channel (Legs)
 *   0xFFFF0000 = Blue channel  (Feet)
 */

/** 133-entry Tibia outfit color palette (RGB, no alpha). */
export const OUTFIT_PALETTE: number[] = [
  0xFFFFFF, 0xBFD4FF, 0xBFE9FF, 0xBFFFFF, 0xBFFFE9, 0xBFFFD4, 0xBFFFBF,
  0xD4FFBF, 0xE9FFBF, 0xFFFFBF, 0xFFE9BF, 0xFFD4BF, 0xFFBFBF, 0xFFBFD4,
  0xFFBFE9, 0xFFBFFF, 0xE9BFFF, 0xD4BFFF, 0xBFBFFF, 0xDADADA, 0x8F9FBF,
  0x8FAFBF, 0x8FBFBF, 0x8FBFAF, 0x8FBF9F, 0x8FBF8F, 0x9FBF8F, 0xAFBF8F,
  0xBFBF8F, 0xBFAF8F, 0xBF9F8F, 0xBF8F8F, 0xBF8F9F, 0xBF8FAF, 0xBF8FBF,
  0xAF8FBF, 0x9F8FBF, 0x8F8FBF, 0xB6B6B6, 0x5F7FBF, 0x8FAFBF, 0x5FBFBF,
  0x5FBF9F, 0x5FBF7F, 0x5FBF5F, 0x7FBF5F, 0x9FBF5F, 0xBFBF5F, 0xBF9F5F,
  0xBF7F5F, 0xBF5F5F, 0xBF5F7F, 0xBF5F9F, 0xBF5FBF, 0x9F5FBF, 0x7F5FBF,
  0x5F5FBF, 0x919191, 0x3F6ABF, 0x3F94BF, 0x3FBFBF, 0x3FBF94, 0x3FBF6A,
  0x3FBF3F, 0x6ABF3F, 0x94BF3F, 0xBFBF3F, 0xBF943F, 0xBF6A3F, 0xBF3F3F,
  0xBF3F6A, 0xBF3F94, 0xBF3FBF, 0x943FBF, 0x6A3FBF, 0x3F3FBF, 0x6D6D6D,
  0x0055FF, 0x00AAFF, 0x00FFFF, 0x00FFAA, 0x00FF54, 0x00FF00, 0x54FF00,
  0xAAFF00, 0xFFFF00, 0xFFA900, 0xFF5500, 0xFF0000, 0xFF0055, 0xFF00A9,
  0xFF00FE, 0xAA00FF, 0x5500FF, 0x0000FF, 0x484848, 0x003FBF, 0x007FBF,
  0x00BFBF, 0x00BF7F, 0x00BF3F, 0x00BF00, 0x3FBF00, 0x7FBF00, 0xBFBF00,
  0xBF7F00, 0xBF3F00, 0xBF0000, 0xBF003F, 0xBF007F, 0xBF00BF, 0x7F00BF,
  0x3F00BF, 0x0000BF, 0x242424, 0x002A7F, 0x00557F, 0x007F7F, 0x007F55,
  0x007F2A, 0x007F00, 0x2A7F00, 0x557F00, 0x7F7F00, 0x7F5400, 0x7F2A00,
  0x7F0000, 0x7F002A, 0x7F0054, 0x7F007F, 0x55007F, 0x2A007F, 0x00007F,
];

export const PALETTE_SIZE = OUTFIT_PALETTE.length;

/** Mask pixel values (ABGR Uint32 on little-endian). */
const MASK_YELLOW = 0xFF00FFFF; // Head
const MASK_RED    = 0xFF0000FF; // Body
const MASK_GREEN  = 0xFF00FF00; // Legs
const MASK_BLUE   = 0xFFFF0000; // Feet

export interface OutfitColorIndices {
  head: number;   // yellow channel index (0-132)
  body: number;   // red channel index
  legs: number;   // green channel index
  feet: number;   // blue channel index
}

export const DEFAULT_OUTFIT_COLORS: OutfitColorIndices = { head: 0, body: 0, legs: 0, feet: 0 };

/** Get the RGB triplet from a palette index. */
export function paletteRGB(index: number): [number, number, number] {
  const rgb = OUTFIT_PALETTE[Math.max(0, Math.min(PALETTE_SIZE - 1, index))];
  return [(rgb >> 0) & 0xFF, (rgb >> 8) & 0xFF, (rgb >> 16) & 0xFF];
}

/**
 * Apply outfit color mask to base sprite ImageData (mutates in place).
 * `base` is the layer-0 sprite, `mask` is the layer-1 sprite.
 */
export function applyOutfitMask(
  base: ImageData,
  mask: ImageData,
  colors: OutfitColorIndices,
): void {
  const HEAD = OUTFIT_PALETTE[Math.max(0, Math.min(PALETTE_SIZE - 1, colors.head))];
  const BODY = OUTFIT_PALETTE[Math.max(0, Math.min(PALETTE_SIZE - 1, colors.body))];
  const LEGS = OUTFIT_PALETTE[Math.max(0, Math.min(PALETTE_SIZE - 1, colors.legs))];
  const FEET = OUTFIT_PALETTE[Math.max(0, Math.min(PALETTE_SIZE - 1, colors.feet))];

  const maskU32 = new Uint32Array(mask.data.buffer);
  const bd = base.data;

  for (let i = 0; i < maskU32.length; i++) {
    const off = 4 * i;
    let color: number;
    switch (maskU32[i]) {
      case MASK_YELLOW: color = HEAD; break;
      case MASK_RED:    color = BODY; break;
      case MASK_GREEN:  color = LEGS; break;
      case MASK_BLUE:   color = FEET; break;
      default: continue;
    }
    bd[off + 0] = (bd[off + 0] * ((color >> 0) & 0xFF)) / 0xFF;
    bd[off + 1] = (bd[off + 1] * ((color >> 8) & 0xFF)) / 0xFF;
    bd[off + 2] = (bd[off + 2] * ((color >> 16) & 0xFF)) / 0xFF;
  }
}

/** Convert a palette index to a CSS hex color string. */
export function paletteToCSS(index: number): string {
  const rgb = OUTFIT_PALETTE[Math.max(0, Math.min(PALETTE_SIZE - 1, index))];
  const r = (rgb >> 0) & 0xFF;
  const g = (rgb >> 8) & 0xFF;
  const b = (rgb >> 16) & 0xFF;
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
