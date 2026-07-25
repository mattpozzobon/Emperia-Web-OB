import type { EquipmentCatalogEntry, ObjectData } from './types';

/** Builds transient rows for the editor without creating a second source of truth. */
export function getEquipmentCatalogEntries(objectData: ObjectData | null): EquipmentCatalogEntry[] {
  if (!objectData) return [];
  return Array.from(objectData.equipmentAppearances.entries()).flatMap(([itemId, appearance]) => {
    const entries: EquipmentCatalogEntry[] = [];
    if (appearance.default != null) {
      entries.push({ name: `item ${itemId}`, itemId, equipmentId: appearance.default });
    }
    if (appearance.left != null) {
      entries.push({ name: `item ${itemId} left-hand`, itemId, equipmentId: appearance.left });
    }
    if (appearance.right != null) {
      entries.push({ name: `item ${itemId} right-hand`, itemId, equipmentId: appearance.right });
    }
    return entries;
  });
}
