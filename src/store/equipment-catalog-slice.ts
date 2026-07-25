/**
 * Equipment catalog actions. The EOBJ map is the only source of truth.
 */
import type { EquipmentAppearance, EquipmentCatalogEntry } from '../lib/types';
import type { OBState } from './store-types';

type Set_ = (partial: Partial<OBState>) => void;
type Get_ = () => OBState;
type Variant = keyof EquipmentAppearance;

function variantOf(entry: EquipmentCatalogEntry): Variant {
  const name = entry.name.toLowerCase();
  if (name.includes('left-hand') || name.includes('left hand') || name.includes('lefthand')) return 'left';
  if (name.includes('right-hand') || name.includes('right hand') || name.includes('righthand')) return 'right';
  return 'default';
}

function mutateCatalog(
  set: Set_,
  get: Get_,
  mutate: (catalog: Map<number, EquipmentAppearance>) => void,
) {
  const state = get();
  if (!state.objectData) return;
  const equipmentAppearances = new Map(state.objectData.equipmentAppearances);
  mutate(equipmentAppearances);
  set({
    objectData: { ...state.objectData, equipmentAppearances },
    dirty: true,
    editVersion: state.editVersion + 1,
  });
}

function removeVariant(catalog: Map<number, EquipmentAppearance>, entry: EquipmentCatalogEntry) {
  const current = catalog.get(entry.itemId);
  if (!current) return;
  const next = { ...current };
  delete next[variantOf(entry)];
  if (next.default == null && next.left == null && next.right == null) catalog.delete(entry.itemId);
  else catalog.set(entry.itemId, next);
}

function addVariant(catalog: Map<number, EquipmentAppearance>, entry: EquipmentCatalogEntry) {
  catalog.set(entry.itemId, {
    ...(catalog.get(entry.itemId) ?? {}),
    [variantOf(entry)]: entry.equipmentAppearanceId,
  });
}

export function createEquipmentCatalogSlice(set: Set_, get: Get_) {
  return {
    updateEquipmentCatalogEntry: (previous: EquipmentCatalogEntry, entry: EquipmentCatalogEntry) => {
      mutateCatalog(set, get, (catalog) => {
        removeVariant(catalog, previous);
        addVariant(catalog, entry);
      });
    },
    addEquipmentCatalogEntry: (entry: EquipmentCatalogEntry) => {
      mutateCatalog(set, get, (catalog) => addVariant(catalog, entry));
    },
    removeEquipmentCatalogEntry: (entry: EquipmentCatalogEntry) => {
      mutateCatalog(set, get, (catalog) => removeVariant(catalog, entry));
    },
    assignVisualEquipmentToItem: (
      visualEquipmentId: number,
      itemId: number,
      variant: Variant,
    ) => {
      const state = get();
      if (!state.objectData) return;
      const visual = state.objectData.visualEquipmentAppearances.get(visualEquipmentId);
      if (!visual) return;

      const equipmentAppearances = new Map(state.objectData.equipmentAppearances);
      equipmentAppearances.set(itemId, {
        ...(equipmentAppearances.get(itemId) ?? {}),
        [variant]: visual.equipmentAppearanceId,
      });

      const visualEquipmentAppearances = new Map(state.objectData.visualEquipmentAppearances);
      visualEquipmentAppearances.delete(visualEquipmentId);

      set({
        objectData: {
          ...state.objectData,
          equipmentAppearances,
          visualEquipmentAppearances,
        },
        dirty: true,
        editVersion: state.editVersion + 1,
      });
    },
  };
}
