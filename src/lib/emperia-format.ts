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
