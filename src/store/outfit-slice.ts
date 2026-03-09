/**
 * Outfit definition actions for the OB store.
 */
import type { OBState } from './store-types';

export interface OutfitSpriteColors {
  yellow: number;
  red: number;
  green: number;
  blue: number;
}

export interface OutfitSpriteSlot {
  id: number;
  colors?: OutfitSpriteColors;
}

export interface OutfitAttachments {
  healthPotion: number;
  manaPotion: number;
  energyPotion: number;
  bag: number;
}

export interface OutfitDefinition {
  id: number;
  renderHelmet: boolean;
  sprites: OutfitSpriteSlot[];
  attachments: OutfitAttachments;
}

export const SLOT_NAMES = ['Hair', 'Head', 'Body', 'Legs', 'Feet', 'Left Hand', 'Right Hand', 'Backpack', 'Belt'] as const;
export const SLOT_COUNT = 9;

export const EMPTY_ATTACHMENTS: OutfitAttachments = { healthPotion: 0, manaPotion: 0, energyPotion: 0, bag: 0 };

export function createEmptyOutfit(): OutfitDefinition {
  return {
    id: 0,
    renderHelmet: false,
    sprites: Array.from({ length: SLOT_COUNT }, () => ({ id: 0 })),
    attachments: { ...EMPTY_ATTACHMENTS },
  };
}

type Set_ = (partial: Partial<OBState>) => void;
type Get_ = () => OBState;

export function createOutfitSlice(set: Set_, get: Get_) {
  return {
    loadOutfitDefinitions: (json: Record<string, OutfitDefinition>) => {
      const defs: OutfitDefinition[] = [];
      for (const [key, value] of Object.entries(json)) {
        const numKey = parseInt(key, 10);
        if (isNaN(numKey)) continue;
        const sprites: OutfitSpriteSlot[] = [];
        const rawSprites = value.sprites ?? [];
        for (let i = 0; i < SLOT_COUNT; i++) {
          const raw = rawSprites[i];
          if (raw && raw.id > 0) {
            sprites.push({
              id: raw.id,
              ...(raw.colors ? { colors: { ...raw.colors } } : {}),
            });
          } else {
            sprites.push({ id: 0 });
          }
        }
        defs.push({
          id: value.id ?? 0,
          renderHelmet: value.renderHelmet ?? false,
          sprites,
          attachments: value.attachments
            ? { ...EMPTY_ATTACHMENTS, ...value.attachments }
            : { ...EMPTY_ATTACHMENTS },
        });
      }
      defs.sort((a, b) => a.id - b.id);
      set({
        outfitDefinitions: defs,
        outfitDefsLoaded: true,
        selectedOutfitIndex: defs.length > 0 ? 0 : null,
      });
    },

    addOutfitDefinition: (outfit: OutfitDefinition) => {
      const defs = [...get().outfitDefinitions, outfit];
      defs.sort((a, b) => a.id - b.id);
      const idx = defs.findIndex((d) => d === outfit);
      set({
        outfitDefinitions: defs,
        selectedOutfitIndex: idx >= 0 ? idx : defs.length - 1,
        dirty: true,
        editVersion: get().editVersion + 1,
      });
    },

    updateOutfitDefinition: (index: number, data: Partial<OutfitDefinition>) => {
      const defs = get().outfitDefinitions.map((d, i) =>
        i === index ? { ...d, ...data } : d,
      );
      if (data.id != null) defs.sort((a, b) => a.id - b.id);
      set({ outfitDefinitions: defs, dirty: true, editVersion: get().editVersion + 1 });
    },

    removeOutfitDefinition: (index: number) => {
      const defs = get().outfitDefinitions.filter((_, i) => i !== index);
      const { selectedOutfitIndex } = get();
      let newIdx: number | null = selectedOutfitIndex;
      if (selectedOutfitIndex === index) {
        newIdx = defs.length > 0 ? Math.min(index, defs.length - 1) : null;
      } else if (selectedOutfitIndex != null && selectedOutfitIndex > index) {
        newIdx = selectedOutfitIndex - 1;
      }
      set({
        outfitDefinitions: defs,
        selectedOutfitIndex: newIdx,
        dirty: true,
        editVersion: get().editVersion + 1,
      });
    },

    duplicateOutfitDefinition: (index: number) => {
      const source = get().outfitDefinitions[index];
      if (!source) return;
      const clone: OutfitDefinition = {
        ...source,
        id: source.id + 1,
        sprites: source.sprites.map((s) => ({ ...s, ...(s.colors ? { colors: { ...s.colors } } : {}) })),
        attachments: { ...source.attachments },
      };
      const defs = [...get().outfitDefinitions, clone];
      defs.sort((a, b) => a.id - b.id);
      const idx = defs.findIndex((d) => d === clone);
      set({
        outfitDefinitions: defs,
        selectedOutfitIndex: idx >= 0 ? idx : defs.length - 1,
        dirty: true,
        editVersion: get().editVersion + 1,
      });
    },

    setSelectedOutfitIndex: (index: number | null) => set({ selectedOutfitIndex: index }),

    exportOutfitDefinitionsJson: (): string => {
      const defs = get().outfitDefinitions;
      const obj: Record<string, unknown> = {};
      for (let i = 0; i < defs.length; i++) {
        const d = defs[i];
        obj[String(i)] = {
          id: d.id,
          renderHelmet: d.renderHelmet,
          sprites: d.sprites.map((s) => {
            if (s.colors) return { id: s.id, colors: { ...s.colors } };
            return { id: s.id };
          }),
          attachments: { ...d.attachments },
        };
      }
      return JSON.stringify(obj, null, 2);
    },
  };
}
