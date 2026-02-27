/**
 * Encodes RGBA ImageData back to the Tibia/Emperia RLE sprite format.
 * Inverse of the decoder in sprite-decoder.ts.
 *
 * Format per sprite:
 *   3 bytes: RGB transparency key (0xFF 0x00 0xFF = magenta)
 *   2 bytes: compressed data size (LE)
 *   N bytes: RLE-compressed pixel data
 *     - repeat: UInt16 skip (transparent pixels), UInt16 run (opaque pixels)
 *     - for each opaque pixel: R, G, B, A bytes
 *     - until all 32*32 = 1024 pixels accounted for
 */

const SPRITE_SIZE = 32;
const TOTAL_PIXELS = SPRITE_SIZE * SPRITE_SIZE;

export function encodeSprite(imageData: ImageData): Uint8Array {
  const data = new Uint32Array(imageData.data.buffer);

  // Build RLE runs
  const rleChunks: Uint8Array[] = [];
  let ptr = 0;

  while (ptr < TOTAL_PIXELS) {
    // Count transparent pixels (alpha = 0)
    let skip = 0;
    while (ptr + skip < TOTAL_PIXELS) {
      const pixel = data[ptr + skip];
      const a = (pixel >> 24) & 0xFF;
      if (a > 0) break;
      skip++;
    }

    // Count opaque pixels
    let runStart = ptr + skip;
    let run = 0;
    while (runStart + run < TOTAL_PIXELS) {
      const pixel = data[runStart + run];
      const a = (pixel >> 24) & 0xFF;
      if (a === 0) break;
      run++;
    }

    // If we're at the end with only transparent pixels, we're done
    if (skip > 0 && run === 0 && ptr + skip >= TOTAL_PIXELS) break;

    // Write this chunk: skip(2) + run(2) + run*4 bytes of RGBA
    const chunk = new Uint8Array(4 + run * 4);
    const dv = new DataView(chunk.buffer);
    dv.setUint16(0, skip, true);
    dv.setUint16(2, run, true);

    for (let i = 0; i < run; i++) {
      const pixel = data[runStart + i];
      chunk[4 + i * 4 + 0] = pixel & 0xFF;         // R
      chunk[4 + i * 4 + 1] = (pixel >> 8) & 0xFF;  // G
      chunk[4 + i * 4 + 2] = (pixel >> 16) & 0xFF;  // B
      chunk[4 + i * 4 + 3] = (pixel >> 24) & 0xFF;  // A
    }

    rleChunks.push(chunk);
    ptr = runStart + run;
  }

  // Calculate total RLE size
  const rleSize = rleChunks.reduce((sum, c) => sum + c.length, 0);

  // Build final sprite: 3 (transparency key) + 2 (size) + rleSize
  const result = new Uint8Array(5 + rleSize);
  // Transparency key: magenta (0xFF, 0x00, 0xFF)
  result[0] = 0xFF;
  result[1] = 0x00;
  result[2] = 0xFF;
  // Compressed data size
  result[3] = rleSize & 0xFF;
  result[4] = (rleSize >> 8) & 0xFF;

  // Copy RLE data
  let offset = 5;
  for (const chunk of rleChunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}
