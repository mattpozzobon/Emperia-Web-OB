/**
 * Emperia binary format header detection and parsing.
 * Ported from Emperia-Client/client/src/utils/emperia-format.ts
 */

export const EMPERIA_MAGIC = [0x45, 0x4D, 0x50, 0x52]; // "EMPR"
export const EMPERIA_HEADER_SIZE = 16;

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

export function isEmperiaFormat(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < EMPERIA_HEADER_SIZE) return false;
  const view = new Uint8Array(buffer, 0, 4);
  return (
    view[0] === EMPERIA_MAGIC[0] &&
    view[1] === EMPERIA_MAGIC[1] &&
    view[2] === EMPERIA_MAGIC[2] &&
    view[3] === EMPERIA_MAGIC[3]
  );
}

export function parseEmperiaHeader(buffer: ArrayBuffer): EmperiaHeader | null {
  if (!isEmperiaFormat(buffer)) return null;
  const dv = new DataView(buffer);
  return {
    fileType: dv.getUint8(4),
    formatVersion: dv.getUint16(5, true),
    contentVersion: dv.getUint16(7, true),
    flags: dv.getUint32(12, true),
  };
}
