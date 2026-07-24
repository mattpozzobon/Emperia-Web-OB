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
import type { ItemDefinition, ObjectData } from './types';

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
 *  1. Emit all definitions (by itemId) with name/properties.
 *  2. Fill bare entries for internal appearances not already covered.
 */
export function compileItemsXml(
  itemDefinitions: Map<number, ItemDefinition>,
  objectData: ObjectData,
): ArrayBuffer {
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="iso-8859-1"?>');
  lines.push('<items>');

  const coveredAppearanceIds = new Set<number>();
  const emittedItemIds = new Set<number>();

  // Phase 1: Emit all definitions sorted by public item ID.
  const sortedDefs = Array.from(itemDefinitions.values())
    .filter((d) => d.group !== 14)
    .sort((a, b) => a.itemId - b.itemId);

  for (const def of sortedDefs) {
    const props = def.properties;
    const name = props?.name ?? '';
    const article = props?.article;

    const attrs: { key: string; value: string }[] = [];
    if (props) {
      for (const key of XML_ATTRIBUTE_KEYS) {
        let val = props[key];
        if (val === undefined || val === null || val === '') continue;

        // RME needs the total container volume (base + exclusive slots).
        // The server stores containerSize as the base (regular-slot) count and
        // appends exclusive slots on top at runtime, so we sum them here.
        if (key === 'containerSize' && props.exclusiveSlots) {
          val = (Number(val) || 0) + props.exclusiveSlots.length;
        }

        attrs.push({ key, value: String(val) });
      }
    }

    let tag = `\t<item id="${def.itemId}"`;
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
    coveredAppearanceIds.add(def.appearanceId);
    emittedItemIds.add(def.itemId);
  }

  // Phase 2: Fill bare entries for internal appearances not already covered.
  const maxAppearanceId = 99 + objectData.itemCount;
  for (let appearanceId = 100; appearanceId <= maxAppearanceId; appearanceId++) {
    if (coveredAppearanceIds.has(appearanceId)) continue;
    if (emittedItemIds.has(appearanceId)) continue;
    lines.push(`\t<item id="${appearanceId}" />`);
  }

  lines.push('</items>');
  lines.push('');

  const xml = lines.join('\n');
  return new TextEncoder().encode(xml).buffer;
}
