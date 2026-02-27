/**
 * Export selected items' sprites as individual PNG images bundled in a ZIP.
 * Uses a minimal ZIP builder (no dependencies) for store-only (uncompressed) entries.
 */
import { decodeSprite } from './sprite-decoder';
import type { SpriteData, ObjectData, ThingType, ServerItemData } from './types';

// ── Minimal ZIP builder ────────────────────────────────────────────────────

function crc32(buf: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

interface ZipEntry { name: string; data: Uint8Array; }

function buildZip(entries: ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const centralHeaders: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    // Local file header (30 + name)
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034B50, true);   // signature
    lv.setUint16(4, 20, true);            // version needed
    lv.setUint16(6, 0, true);             // flags
    lv.setUint16(8, 0, true);             // compression: stored
    lv.setUint16(10, 0, true);            // mod time
    lv.setUint16(12, 0, true);            // mod date
    lv.setUint32(14, crc, true);          // crc32
    lv.setUint32(18, size, true);         // compressed size
    lv.setUint32(22, size, true);         // uncompressed size
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);            // extra length
    local.set(nameBytes, 30);

    parts.push(local);
    parts.push(entry.data);

    // Central directory header (46 + name)
    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014B50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0x20, true);         // external attrs
    cv.setUint32(42, offset, true);        // local header offset
    central.set(nameBytes, 46);
    centralHeaders.push(central);

    offset += local.length + entry.data.length;
  }

  const centralStart = offset;
  for (const ch of centralHeaders) { parts.push(ch); offset += ch.length; }
  const centralSize = offset - centralStart;

  // End of central directory (22 bytes)
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054B50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, centralStart, true);
  ev.setUint16(20, 0, true);
  parts.push(eocd);

  const total = parts.reduce((s, p) => s + p.length, 0);
  const result = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) { result.set(p, pos); pos += p.length; }
  return result;
}

// ── PNG export helpers ─────────────────────────────────────────────────────

const canvas = document.createElement('canvas');
canvas.width = 32;
canvas.height = 32;
const ctx = canvas.getContext('2d')!;

function imageDataToPng(imgData: ImageData): Promise<Uint8Array> {
  ctx.clearRect(0, 0, 32, 32);
  ctx.putImageData(imgData, 0, 0);
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      blob!.arrayBuffer().then((ab) => resolve(new Uint8Array(ab)));
    }, 'image/png');
  });
}

// ── Export function ────────────────────────────────────────────────────────

function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9_\-]/g, '_');
}

export interface ExportContext {
  objectData: ObjectData;
  spriteData: SpriteData;
  spriteOverrides: Map<number, ImageData>;
  itemDefinitions: Map<number, ServerItemData>;
  clientToServerIds: Map<number, number>;
}

/**
 * Export each selected thing's first-frame sprite as an individual PNG.
 * If multiple items, bundles into a ZIP. Single item downloads directly.
 */
export async function exportSelectedSprites(
  thingIds: number[],
  ctx: ExportContext,
): Promise<void> {
  if (thingIds.length === 0) return;

  const entries: ZipEntry[] = [];

  for (const id of thingIds) {
    const thing = ctx.objectData.things.get(id);
    if (!thing) continue;

    // Collect all sprite IDs from all frame groups
    const spriteIds: number[] = [];
    for (const fg of thing.frameGroups) {
      for (const sid of fg.sprites) {
        if (sid !== 0 && !spriteIds.includes(sid)) spriteIds.push(sid);
      }
    }
    if (spriteIds.length === 0) continue;

    // Build a name prefix from definitions
    const serverId = ctx.clientToServerIds.get(id);
    const def = serverId != null ? ctx.itemDefinitions.get(serverId) : undefined;
    const name = def?.properties?.name;
    const prefix = name ? `${id}_${sanitize(name)}` : `${id}`;

    for (const sid of spriteIds) {
      const override = ctx.spriteOverrides.get(sid);
      const imgData = override ?? decodeSprite(ctx.spriteData, sid);
      if (!imgData) continue;

      const png = await imageDataToPng(imgData);
      const filename = spriteIds.length === 1
        ? `${prefix}.png`
        : `${prefix}_spr${sid}.png`;
      entries.push({ name: filename, data: png });
    }
  }

  if (entries.length === 0) return;

  // Single file: direct download; multiple: ZIP
  if (entries.length === 1) {
    downloadBlob(entries[0].data, entries[0].name, 'image/png');
  } else {
    const zip = buildZip(entries);
    downloadBlob(zip, 'sprites_export.zip', 'application/zip');
  }
}

function downloadBlob(data: Uint8Array, filename: string, mime: string) {
  const blob = new Blob([data.buffer as ArrayBuffer], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
