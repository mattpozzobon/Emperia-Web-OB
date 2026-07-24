import type { EquipmentCatalogEntry, ObjectData } from './types';

/** Builds transient rows for the editor without creating a second source of truth. */
export function getEquipmentCatalogEntries(objectData: ObjectData | null): EquipmentCatalogEntry[] {
  if (!objectData) return [];
  return Array.from(objectData.equipmentAppearances.entries()).flatMap(([itemId, appearance]) => {
    const entries: EquipmentCatalogEntry[] = [];
    if (appearance.default != null) {
      entries.push({ name: `item ${itemId}`, id: itemId, sprite_id: appearance.default });
    }
    if (appearance.left != null) {
      entries.push({ name: `item ${itemId} left-hand`, id: itemId, sprite_id: appearance.left });
    }
    if (appearance.right != null) {
      entries.push({ name: `item ${itemId} right-hand`, id: itemId, sprite_id: appearance.right });
    }
    return entries;
  });
}
