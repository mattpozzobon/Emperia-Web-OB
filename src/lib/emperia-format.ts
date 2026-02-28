/**
 * Emperia binary format header detection and parsing.
 * Ported from Emperia-Client/client/src/utils/emperia-format.ts
 *
 * Header (20 bytes):
 *   0x00  8B  Magic: "EMPERIA\0"
 *   0x08  1B  FileType: 0x01=sprite, 0x02=objects
 *   0x09  2B  FormatVersion (UInt16 LE)
 *   0x0B  4B  ContentVersion (UInt32 LE, e.g. 1098)
 *   0x0F  1B  Flags
 *   0x10  4B  Reserved
 *   0x14  --  Payload
 */

export const EMPERIA_MAGIC = new Uint8Array([0x45, 0x4D, 0x50, 0x45, 0x52, 0x49, 0x41, 0x00]); // "EMPERIA\0"
export const EMPERIA_HEADER_SIZE = 20;

export const enum EmperiaFileType {
  SPRITE_DATA  = 0x01,
  OBJECT_DEFS  = 0x02,
}

export interface EmperiaHeader {
  fileType: number;
  formatVersion: number;
  contentVersion: number;
  flags: number;
}

export function isEmperiaFormat(data: ArrayBuffer | Uint8Array): boolean {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.length < EMPERIA_HEADER_SIZE) return false;
  for (let i = 0; i < EMPERIA_MAGIC.length; i++) {
    if (bytes[i] !== EMPERIA_MAGIC[i]) return false;
  }
  return true;
}

export function parseEmperiaHeader(data: ArrayBuffer | Uint8Array): EmperiaHeader | null {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (!isEmperiaFormat(bytes)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    fileType: view.getUint8(0x08),
    formatVersion: view.getUint16(0x09, true),
    contentVersion: view.getUint32(0x0B, true),
    flags: view.getUint8(0x0F),
  };
}

/**
 * Checks if a buffer is gzip-compressed (magic bytes 0x1f 0x8b).
 */
export function isGzipCompressed(data: ArrayBuffer | Uint8Array): boolean {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

/**
 * Decompresses a gzip-compressed ArrayBuffer using the browser's DecompressionStream API.
 * If the data is not gzip-compressed, returns it as-is.
 */
/**
 * Gzip-compresses an ArrayBuffer using the browser's CompressionStream API.
 */
export async function gzipCompress(data: ArrayBuffer): Promise<ArrayBuffer> {
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  writer.write(new Uint8Array(data));
  writer.close();

  const reader = cs.readable.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  let totalLen = 0;
  for (const c of chunks) totalLen += c.byteLength;
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.byteLength;
  }
  return result.buffer;
}

export async function maybeDecompress(data: ArrayBuffer): Promise<ArrayBuffer> {
  if (!isGzipCompressed(data)) return data;

  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  writer.write(new Uint8Array(data));
  writer.close();

  const reader = ds.readable.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  let totalLen = 0;
  for (const c of chunks) totalLen += c.byteLength;
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.byteLength;
  }
  return result.buffer;
}
