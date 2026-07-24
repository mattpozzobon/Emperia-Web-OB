/**
 * Hair catalog actions. The EOBJ map is the only source of truth.
 */
import type { HairDefinition } from '../lib/types';
import type { OBState } from './store-types';

type Set_ = (partial: Partial<OBState>) => void;
type Get_ = () => OBState;

function updateCatalog(
  set: Set_,
  get: Get_,
  mutate: (catalog: Map<number, HairDefinition>) => void,
  selectedHairId?: number | null,
) {
  const state = get();
  if (!state.objectData) return;
  const hairDefinitions = new Map(state.objectData.hairDefinitions);
  mutate(hairDefinitions);
  set({
    objectData: { ...state.objectData, hairDefinitions },
    ...(selectedHairId !== undefined ? { selectedHairId } : {}),
    dirty: true,
    editVersion: state.editVersion + 1,
  });
}

export function createHairCatalogSlice(set: Set_, get: Get_) {
  return {
    addHairDefinition: (hair: HairDefinition) => {
      updateCatalog(set, get, (catalog) => catalog.set(hair.hairId, hair), hair.hairId);
    },
    updateHairDefinition: (hairId: number, data: Partial<HairDefinition>) => {
      const state = get();
      const selectedHairId = data.hairId != null && state.selectedHairId === hairId
        ? data.hairId
        : state.selectedHairId;
      updateCatalog(set, get, (catalog) => {
        const current = catalog.get(hairId);
        if (!current) return;
        const updated = { ...current, ...data };
        catalog.delete(hairId);
        catalog.set(updated.hairId, updated);
      }, selectedHairId);
    },
    removeHairDefinition: (hairId: number) => {
      const state = get();
      const nextSelected = state.selectedHairId === hairId
        ? Array.from(state.objectData?.hairDefinitions.keys() ?? []).find((id) => id !== hairId) ?? null
        : state.selectedHairId;
      updateCatalog(set, get, (catalog) => catalog.delete(hairId), nextSelected);
    },
    duplicateHairDefinition: (hairId: number) => {
      const state = get();
      const source = state.objectData?.hairDefinitions.get(hairId);
      if (!source) return;
      let newId = source.hairId + 1;
      while (state.objectData!.hairDefinitions.has(newId)) newId++;
      updateCatalog(
        set,
        get,
        (catalog) => catalog.set(newId, { ...source, hairId: newId, name: `${source.name} (copy)` }),
        newId,
      );
    },
    setSelectedHairId: (id: number | null) => set({ selectedHairId: id }),
  };
}
