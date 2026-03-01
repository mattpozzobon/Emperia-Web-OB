/**
 * Hair definition actions for the OB store.
 */
import type { HairDefinition, HairDefinitionsFile } from '../lib/types';
import { HAIR_RACE_ALL, HAIR_GENDER_ALL, HAIR_TIER_ALL } from '../lib/types';
import type { OBState } from './store-types';

type Set_ = (partial: Partial<OBState>) => void;
type Get_ = () => OBState;

export function createHairSlice(set: Set_, get: Get_) {
  return {
    loadHairDefinitions: (json: HairDefinitionsFile) => {
      const defs: HairDefinition[] = [];
      for (const [key, value] of Object.entries(json)) {
        const hairId = parseInt(key, 10);
        if (isNaN(hairId)) continue;
        defs.push({
          hairId,
          name: value.name ?? `Hair ${hairId}`,
          outfitId: value.outfitId ?? hairId,
          races: value.races ?? HAIR_RACE_ALL,
          genders: value.genders ?? HAIR_GENDER_ALL,
          tiers: value.tiers ?? HAIR_TIER_ALL,
          sortOrder: value.sortOrder ?? 0,
        });
      }
      defs.sort((a, b) => a.sortOrder - b.sortOrder || a.hairId - b.hairId);
      set({ hairDefinitions: defs, hairDefsLoaded: true, selectedHairId: defs[0]?.hairId ?? null });
      console.log(`[OB] Loaded ${defs.length} hair definitions`);
    },

    addHairDefinition: (hair: HairDefinition) => {
      const defs = [...get().hairDefinitions, hair];
      defs.sort((a, b) => a.sortOrder - b.sortOrder || a.hairId - b.hairId);
      set({ hairDefinitions: defs, selectedHairId: hair.hairId, dirty: true, editVersion: get().editVersion + 1 });
    },

    updateHairDefinition: (hairId: number, data: Partial<HairDefinition>) => {
      const defs = get().hairDefinitions.map((h) =>
        h.hairId === hairId ? { ...h, ...data } : h,
      );
      defs.sort((a, b) => a.sortOrder - b.sortOrder || a.hairId - b.hairId);
      set({ hairDefinitions: defs, dirty: true, editVersion: get().editVersion + 1 });
    },

    removeHairDefinition: (hairId: number) => {
      const defs = get().hairDefinitions.filter((h) => h.hairId !== hairId);
      const { selectedHairId } = get();
      set({
        hairDefinitions: defs,
        selectedHairId: selectedHairId === hairId ? (defs[0]?.hairId ?? null) : selectedHairId,
        dirty: true,
        editVersion: get().editVersion + 1,
      });
    },

    duplicateHairDefinition: (hairId: number) => {
      const source = get().hairDefinitions.find((h) => h.hairId === hairId);
      if (!source) return;
      const existingIds = new Set(get().hairDefinitions.map((h) => h.hairId));
      let newId = source.hairId + 1;
      while (existingIds.has(newId)) newId++;
      const clone: HairDefinition = { ...source, hairId: newId, name: `${source.name} (copy)` };
      const defs = [...get().hairDefinitions, clone];
      defs.sort((a, b) => a.sortOrder - b.sortOrder || a.hairId - b.hairId);
      set({ hairDefinitions: defs, selectedHairId: newId, dirty: true, editVersion: get().editVersion + 1 });
    },

    setSelectedHairId: (id: number | null) => set({ selectedHairId: id }),

    exportHairDefinitionsJson: (): string => {
      const defs = get().hairDefinitions;
      const sorted = [...defs].sort((a, b) => a.hairId - b.hairId);
      const obj: Record<string, unknown> = {};
      for (const h of sorted) {
        obj[String(h.hairId)] = {
          name: h.name,
          outfitId: h.outfitId,
          races: h.races,
          genders: h.genders,
          tiers: h.tiers,
          sortOrder: h.sortOrder,
        };
      }
      return JSON.stringify(obj, null, 4);
    },
  };
}
