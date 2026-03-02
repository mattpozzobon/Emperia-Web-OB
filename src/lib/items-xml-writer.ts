/**
 * Generates an items.xml file from the server's item definitions.
 *
 * The items.xml is used by the map editor (RME) to display item names in the
 * palette and provide metadata like floorchange, decayTo, weight, type, etc.
 *
 * Format: Simple XML with <items> root containing <item> elements.
 * Each item has id, article (optional), name attributes, and child
 * <attribute> elements for properties the map editor understands.
 */
import type { ServerItemData, ObjectData } from './types';

/** XML-escape special characters in attribute values. */
function escXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Properties the map editor (RME) understands as <attribute key="..." value="..." />.
 * We only emit these — everything else is server-only.
 */
const XML_ATTRIBUTE_KEYS = [
  'type',
  'description',
  'floorchange',
  'decayTo',
  'duration',
  'weight',
  'containerSize',
  'rotateTo',
  'readable',
  'writeable',
  'maxTextLen',
  'fluidSource',
  'charges',
  'showcharges',
  'showduration',
  'weaponType',
  'slotType',
  'ammoType',
  'shootType',
  'armor',
] as const;

/**
 * Generate a complete items.xml covering all items in objectData.
 *
 * Strategy mirrors the OTB writer:
 *  1. Emit all definitions (by serverId) with name/properties.
 *  2. Fill bare entries for client IDs not already covered.
 */
export function compileItemsXml(
  itemDefinitions: Map<number, ServerItemData>,
  objectData: ObjectData,
): ArrayBuffer {
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="iso-8859-1"?>');
  lines.push('<items>');

  const coveredClientIds = new Set<number>();
  const emittedServerIds = new Set<number>();

  // Phase 1: Emit all definitions sorted by server ID
  const sortedDefs = Array.from(itemDefinitions.values())
    .filter((d) => d.group !== 14)
    .sort((a, b) => a.serverId - b.serverId);

  for (const def of sortedDefs) {
    const props = def.properties;
    const name = props?.name ?? '';
    const article = props?.article;

    const attrs: { key: string; value: string }[] = [];
    if (props) {
      for (const key of XML_ATTRIBUTE_KEYS) {
        const val = props[key];
        if (val === undefined || val === null || val === '') continue;
        attrs.push({ key, value: String(val) });
      }
    }

    let tag = `\t<item id="${def.serverId}"`;
    if (article) tag += ` article="${escXml(article)}"`;
    if (name) tag += ` name="${escXml(name)}"`;

    if (attrs.length === 0) {
      tag += ' />';
      lines.push(tag);
    } else {
      tag += '>';
      lines.push(tag);
      for (const attr of attrs) {
        lines.push(`\t\t<attribute key="${escXml(attr.key)}" value="${escXml(attr.value)}" />`);
      }
      lines.push('\t</item>');
    }
    const clientID = def.id ?? def.serverId;
    coveredClientIds.add(clientID);
    emittedServerIds.add(def.serverId);
  }

  // Phase 2: Fill bare entries for client IDs not already covered
  const maxClientId = 99 + objectData.itemCount;
  for (let cid = 100; cid <= maxClientId; cid++) {
    if (coveredClientIds.has(cid)) continue;
    if (emittedServerIds.has(cid)) continue;
    lines.push(`\t<item id="${cid}" />`);
  }

  lines.push('</items>');
  lines.push('');

  const xml = lines.join('\n');
  return new TextEncoder().encode(xml).buffer;
}
