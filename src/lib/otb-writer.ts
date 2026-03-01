/**
 * Generates an items.otb binary file from the server's item definitions.
 *
 * The OTB format is a node-based binary tree used by the map editor (RME)
 * to map server IDs → client IDs with item group and flag metadata.
 *
 * Format overview:
 *   - 4-byte identifier (zeroes for "OTBI")
 *   - NODE_INIT (0xFE) — root node start
 *     - Root data: type(u8) + flags(u32) + ROOT_ATTR_VERSION header
 *     - Child nodes: one per item
 *       - group(u8) + flags(u32) + attributes (SERVERID, CLIENTID, etc.)
 *   - NODE_TERM (0xFF) — root node end
 *
 * Data bytes matching 0xFD/0xFE/0xFF are escaped with a 0xFD prefix.
 */
import type { ServerItemData } from './types';

// OTB node markers
const NODE_ESC  = 0xFD;
const NODE_INIT = 0xFE;
const NODE_TERM = 0xFF;

// OTB attribute types
const ITEM_ATTR_SERVERID = 0x10;
const ITEM_ATTR_CLIENTID = 0x11;

// OTB version header attribute
const ROOT_ATTR_VERSION = 0x01;

// OTB format version — we always write v3 (latest supported by RME)
const OTB_MAJOR_VERSION = 3;
const OTB_MINOR_VERSION = 57;  // client version identifier
const OTB_BUILD_NUMBER  = 62;

/**
 * Escape raw node data: any byte matching NODE_ESC/NODE_INIT/NODE_TERM
 * must be prefixed with NODE_ESC so the parser doesn't misinterpret it.
 */
function escapeBytes(raw: Uint8Array): Uint8Array {
  // Worst case: every byte needs escaping → 2× size
  const out = new Uint8Array(raw.length * 2);
  let j = 0;
  for (let i = 0; i < raw.length; i++) {
    const b = raw[i];
    if (b === NODE_ESC || b === NODE_INIT || b === NODE_TERM) {
      out[j++] = NODE_ESC;
    }
    out[j++] = b;
  }
  return out.slice(0, j);
}

/**
 * Build the raw (unescaped) data for a single item node.
 * Layout: group(u8) + flags(u32) + SERVERID attr + CLIENTID attr
 */
function buildItemNodeData(serverID: number, clientID: number, group: number, flags: number): Uint8Array {
  // 5 (header) + 5 (sid attr) + 5 (cid attr) = 15 bytes
  const buf = new Uint8Array(15);
  const view = new DataView(buf.buffer);

  // Group + flags
  buf[0] = group & 0xFF;
  view.setUint32(1, flags, true);

  // ITEM_ATTR_SERVERID: type(u8) + datalen(u16) + serverID(u16)
  buf[5] = ITEM_ATTR_SERVERID;
  view.setUint16(6, 2, true);
  view.setUint16(8, serverID, true);

  // ITEM_ATTR_CLIENTID: type(u8) + datalen(u16) + clientID(u16)
  buf[10] = ITEM_ATTR_CLIENTID;
  view.setUint16(11, 2, true);
  view.setUint16(13, clientID, true);

  return buf;
}

/**
 * Build the root node data (version header).
 * Layout: type(u8) + flags(u32) + ROOT_ATTR_VERSION attr
 */
function buildRootNodeData(): Uint8Array {
  // type(1) + flags(4) + attr_type(1) + attr_len(2) + major(4) + minor(4) + build(4) + csd(128) = 148
  const size = 1 + 4 + 1 + 2 + 4 + 4 + 4 + 128;
  const buf = new Uint8Array(size);
  const view = new DataView(buf.buffer);

  buf[0] = 0; // type info (0)
  view.setUint32(1, 0, true); // root flags (unused)

  buf[5] = ROOT_ATTR_VERSION;
  view.setUint16(6, 4 + 4 + 4 + 128, true); // datalen = 140

  view.setUint32(8, OTB_MAJOR_VERSION, true);
  view.setUint32(12, OTB_MINOR_VERSION, true);
  view.setUint32(16, OTB_BUILD_NUMBER, true);
  // CSD string: 128 bytes of zeroes (already zero-initialized)

  return buf;
}

/**
 * Generate a complete items.otb binary from the server's item definitions.
 *
 * @param itemDefinitions Map of server ID → ServerItemData
 * @returns ArrayBuffer containing the OTB file
 */
export function compileItemsOtb(itemDefinitions: Map<number, ServerItemData>): ArrayBuffer {
  const parts: Uint8Array[] = [];

  // File identifier: 4 zero bytes (parsed as "OTBI" by DiskNodeFileReadHandle)
  parts.push(new Uint8Array(4));

  // Root node start
  parts.push(new Uint8Array([NODE_INIT]));

  // Root node data (escaped)
  parts.push(escapeBytes(buildRootNodeData()));

  // Sort by server ID for deterministic output
  const sortedIds = Array.from(itemDefinitions.keys())
    .filter((sid) => sid >= 100)
    .sort((a, b) => a - b);

  // Child nodes — one per item
  for (const sid of sortedIds) {
    const def = itemDefinitions.get(sid)!;
    if (def.group === 14) continue; // skip deprecated

    const clientID = def.id ?? sid;
    const raw = buildItemNodeData(sid, clientID, def.group, def.flags);
    const escaped = escapeBytes(raw);

    parts.push(new Uint8Array([NODE_INIT]));
    parts.push(escaped);
    parts.push(new Uint8Array([NODE_TERM]));
  }

  // Root node end
  parts.push(new Uint8Array([NODE_TERM]));

  // Concatenate all parts
  const totalSize = parts.reduce((sum, p) => sum + p.length, 0);
  const result = new Uint8Array(totalSize);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }

  return result.buffer;
}
