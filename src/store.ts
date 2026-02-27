/**
 * Global state for the Object Builder using Zustand.
 */
import { create } from 'zustand';
import type { ObjectData, SpriteData, ThingType, ThingCategory } from './lib/types';
import { parseObjectData } from './lib/object-parser';
import { parseSpriteData, clearSpriteCache } from './lib/sprite-decoder';

interface OBState {
  // Data
  objectData: ObjectData | null;
  spriteData: SpriteData | null;
  loaded: boolean;
  loading: boolean;
  error: string | null;

  // UI state
  activeCategory: ThingCategory;
  selectedThingId: number | null;
  searchQuery: string;

  // Actions
  loadFiles: (objBuffer: ArrayBuffer, sprBuffer: ArrayBuffer) => void;
  setActiveCategory: (cat: ThingCategory) => void;
  setSelectedThingId: (id: number | null) => void;
  setSearchQuery: (q: string) => void;
  reset: () => void;

  // Derived
  getThingsForCategory: () => ThingType[];
  getCategoryRange: (cat: ThingCategory) => { start: number; end: number } | null;
}

export const useOBStore = create<OBState>((set, get) => ({
  objectData: null,
  spriteData: null,
  loaded: false,
  loading: false,
  error: null,

  activeCategory: 'item',
  selectedThingId: null,
  searchQuery: '',

  loadFiles: (objBuffer, sprBuffer) => {
    set({ loading: true, error: null });
    try {
      const objectData = parseObjectData(objBuffer);
      const spriteData = parseSpriteData(sprBuffer);
      clearSpriteCache();
      set({
        objectData,
        spriteData,
        loaded: true,
        loading: false,
        selectedThingId: 100,
        activeCategory: 'item',
      });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : String(e),
        loading: false,
      });
    }
  },

  setActiveCategory: (cat) => {
    const range = get().getCategoryRange(cat);
    set({
      activeCategory: cat,
      selectedThingId: range ? range.start : null,
      searchQuery: '',
    });
  },

  setSelectedThingId: (id) => set({ selectedThingId: id }),
  setSearchQuery: (q) => set({ searchQuery: q }),

  reset: () => {
    clearSpriteCache();
    set({
      objectData: null,
      spriteData: null,
      loaded: false,
      loading: false,
      error: null,
      activeCategory: 'item',
      selectedThingId: null,
      searchQuery: '',
    });
  },

  getCategoryRange: (cat) => {
    const od = get().objectData;
    if (!od) return null;
    switch (cat) {
      case 'item':
        return { start: 100, end: od.itemCount };
      case 'outfit':
        return { start: od.itemCount + 1, end: od.itemCount + od.outfitCount };
      case 'effect':
        return { start: od.itemCount + od.outfitCount + 1, end: od.itemCount + od.outfitCount + od.effectCount };
      case 'distance':
        return { start: od.itemCount + od.outfitCount + od.effectCount + 1, end: od.itemCount + od.outfitCount + od.effectCount + od.distanceCount };
    }
  },

  getThingsForCategory: () => {
    const { objectData, activeCategory, searchQuery } = get();
    if (!objectData) return [];
    const range = get().getCategoryRange(activeCategory);
    if (!range) return [];

    const things: ThingType[] = [];
    for (let id = range.start; id <= range.end; id++) {
      const thing = objectData.things.get(id);
      if (thing) {
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          if (!id.toString().includes(q)) continue;
        }
        things.push(thing);
      }
    }
    return things;
  },
}));
