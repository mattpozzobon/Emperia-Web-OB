/**
 * Global state for the Object Builder using Zustand.
 */
import { create } from 'zustand';
import type { ObjectData, SpriteData, ThingType, ThingCategory, ThingFlags } from './lib/types';
import { parseObjectData } from './lib/object-parser';
import { parseSpriteData, clearSpriteCache } from './lib/sprite-decoder';

interface UndoEntry {
  thingId: number;
  oldFlags: ThingFlags;
  newFlags: ThingFlags;
}

interface OBState {
  // Data
  objectData: ObjectData | null;
  spriteData: SpriteData | null;
  loaded: boolean;
  loading: boolean;
  error: string | null;

  // Edit state
  dirty: boolean;
  dirtyIds: Set<number>;
  undoStack: UndoEntry[];
  redoStack: UndoEntry[];

  // Sprite edit state
  /** Map of spriteId → replacement ImageData */
  spriteOverrides: Map<number, ImageData>;
  dirtySpriteIds: Set<number>;

  // UI state
  activeCategory: ThingCategory;
  selectedThingId: number | null;
  searchQuery: string;
  /** Bumped on every edit to force re-render of dependent components */
  editVersion: number;

  // Actions
  loadFiles: (objBuffer: ArrayBuffer, sprBuffer: ArrayBuffer) => void;
  setActiveCategory: (cat: ThingCategory) => void;
  setSelectedThingId: (id: number | null) => void;
  setSearchQuery: (q: string) => void;
  reset: () => void;

  // Edit actions
  updateThingFlags: (id: number, flags: ThingFlags) => void;
  replaceSprite: (spriteId: number, imageData: ImageData) => void;
  undo: () => void;
  redo: () => void;
  markClean: () => void;

  // Derived
  getCategoryRange: (cat: ThingCategory) => { start: number; end: number } | null;
}

export const useOBStore = create<OBState>((set, get) => ({
  objectData: null,
  spriteData: null,
  loaded: false,
  loading: false,
  error: null,

  dirty: false,
  dirtyIds: new Set(),
  undoStack: [],
  redoStack: [],
  spriteOverrides: new Map(),
  dirtySpriteIds: new Set(),

  activeCategory: 'item',
  selectedThingId: null,
  searchQuery: '',
  editVersion: 0,

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
        dirty: false,
        dirtyIds: new Set(),
        undoStack: [],
        redoStack: [],
        spriteOverrides: new Map(),
        dirtySpriteIds: new Set(),
        editVersion: 0,
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
      dirty: false,
      dirtyIds: new Set(),
      undoStack: [],
      redoStack: [],
      spriteOverrides: new Map(),
      dirtySpriteIds: new Set(),
      editVersion: 0,
    });
  },

  updateThingFlags: (id, newFlags) => {
    const { objectData, undoStack, dirtyIds, editVersion } = get();
    if (!objectData) return;
    const thing = objectData.things.get(id);
    if (!thing) return;

    const oldFlags = { ...thing.flags };
    thing.flags = newFlags;
    thing.rawBytes = undefined; // force re-serialization on compile

    const newDirtyIds = new Set(dirtyIds);
    newDirtyIds.add(id);

    set({
      dirty: true,
      dirtyIds: newDirtyIds,
      undoStack: [...undoStack, { thingId: id, oldFlags, newFlags: { ...newFlags } }],
      redoStack: [],
      editVersion: editVersion + 1,
    });
  },

  undo: () => {
    const { objectData, undoStack, redoStack, editVersion } = get();
    if (!objectData || undoStack.length === 0) return;
    const entry = undoStack[undoStack.length - 1];
    const thing = objectData.things.get(entry.thingId);
    if (thing) thing.flags = { ...entry.oldFlags };

    set({
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, entry],
      editVersion: editVersion + 1,
    });
  },

  redo: () => {
    const { objectData, undoStack, redoStack, editVersion } = get();
    if (!objectData || redoStack.length === 0) return;
    const entry = redoStack[redoStack.length - 1];
    const thing = objectData.things.get(entry.thingId);
    if (thing) thing.flags = { ...entry.newFlags };

    set({
      undoStack: [...undoStack, entry],
      redoStack: redoStack.slice(0, -1),
      editVersion: editVersion + 1,
    });
  },

  replaceSprite: (spriteId, imageData) => {
    const { spriteOverrides, dirtySpriteIds, editVersion } = get();
    const newOverrides = new Map(spriteOverrides);
    newOverrides.set(spriteId, imageData);
    const newDirtySpriteIds = new Set(dirtySpriteIds);
    newDirtySpriteIds.add(spriteId);

    // Clear cached data URL so it re-renders
    clearSpriteCache();

    set({
      dirty: true,
      spriteOverrides: newOverrides,
      dirtySpriteIds: newDirtySpriteIds,
      editVersion: editVersion + 1,
    });
  },

  markClean: () => set({ dirty: false, dirtyIds: new Set(), dirtySpriteIds: new Set() }),

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

}));

/** Derive filtered things list outside the store (safe for useMemo). */
export function getThingsForCategory(
  objectData: ObjectData | null,
  activeCategory: ThingCategory,
  searchQuery: string,
  getCategoryRange: (cat: ThingCategory) => { start: number; end: number } | null,
): ThingType[] {
  if (!objectData) return [];
  const range = getCategoryRange(activeCategory);
  if (!range) return [];

  const things: ThingType[] = [];
  for (let id = range.start; id <= range.end; id++) {
    const thing = objectData.things.get(id);
    if (thing) {
      if (searchQuery && !id.toString().includes(searchQuery)) continue;
      things.push(thing);
    }
  }
  return things;
}
