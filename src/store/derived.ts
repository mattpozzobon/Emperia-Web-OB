/**
 * Derived helper functions that live outside the store (safe for useMemo).
 */
import type { ObjectData, ThingType, ThingCategory, ItemDefinition } from '../lib/types';

/** Convert internal map ID to display ID (1-based for outfits/effects/distances). */
export function getDisplayId(objectData: ObjectData, internalId: number): number {
  if (internalId <= objectData.itemCount) return internalId; // items stay as-is (100+)
  if (internalId <= objectData.itemCount + objectData.outfitCount) return internalId - objectData.itemCount;
  if (internalId <= objectData.itemCount + objectData.outfitCount + objectData.effectCount) return internalId - objectData.itemCount - objectData.outfitCount;
  return internalId - objectData.itemCount - objectData.outfitCount - objectData.effectCount;
}

/** Derive filtered things list outside the store (safe for useMemo). */
export function getThingsForCategory(
  objectData: ObjectData | null,
  activeCategory: ThingCategory,
  searchQuery: string,
  filterGroup: number,
  getCategoryRange: (cat: ThingCategory) => { start: number; end: number } | null,
  itemDefinitions?: Map<number, ItemDefinition>,
  appearanceToItemIds?: Map<number, number>,
): ThingType[] {
  if (!objectData) return [];
  const range = getCategoryRange(activeCategory);
  if (!range) return [];

  const q = searchQuery.trim().toLowerCase();
  const things: ThingType[] = [];
  for (let id = range.start; id <= range.end; id++) {
    const thing = objectData.things.get(id);
    if (!thing) continue;

    // Group filter (only for items with definitions loaded)
    if (filterGroup >= 0 && appearanceToItemIds && itemDefinitions) {
      const itemId = appearanceToItemIds.get(id);
      const def = itemId != null ? itemDefinitions.get(itemId) : undefined;
      if (!def || def.group !== filterGroup) continue;
    }

    // Search filter: match by appearance ID, public item ID, or name.
    if (q) {
      const displayId = getDisplayId(objectData, id);
      const idStr = displayId.toString();
      let match = idStr.includes(q);
      if (!match && appearanceToItemIds && itemDefinitions) {
        const itemId = appearanceToItemIds.get(id);
        if (itemId != null) {
          if (itemId.toString().includes(q)) match = true;
          const def = itemDefinitions.get(itemId);
          if (!match && def?.properties?.name) {
            match = def.properties.name.toLowerCase().includes(q);
          }
        }
      }
      if (!match) continue;
    }

    things.push(thing);
  }
  return things;
}
