/**
 * Global state for the Object Builder using Zustand.
 */
import { create } from 'zustand';
import type { ObjectData, SpriteData, ThingType, ThingCategory, ThingFlags, FrameGroup, ServerItemData } from './lib/types';
import { parseObjectData } from './lib/object-parser';
import { parseSpriteData, clearSpriteCache, clearSpriteCacheId } from './lib/sprite-decoder';
import { syncOtbFromVisual, deriveGroup } from './lib/types';

interface UndoEntry {
  thingId: number;
  oldFlags: ThingFlags;
  newFlags: ThingFlags;
}

/**
 * Shift all things with id >= shiftFrom up by 1.
 * Must iterate in reverse to avoid overwrites.
 * Also shifts dirtyIds and returns the new set.
 */
function shiftThingsUp(od: ObjectData, shiftFrom: number, oldTotal: number, dirtyIds: Set<number>): Set<number> {
  for (let id = oldTotal; id >= shiftFrom; id--) {
    const t = od.things.get(id);
    if (t) {
      t.id = id + 1;
      od.things.set(id + 1, t);
      od.things.delete(id);
    }
  }
  const newDirty = new Set<number>();
  for (const d of dirtyIds) {
    newDirty.add(d >= shiftFrom ? d + 1 : d);
  }
  return newDirty;
}

/**
 * Shift all things with id > shiftAfter down by 1.
 * Must iterate forward to avoid overwrites.
 * Also shifts dirtyIds.
 */
function shiftThingsDown(od: ObjectData, shiftAfter: number, oldTotal: number, dirtyIds: Set<number>): Set<number> {
  for (let id = shiftAfter + 1; id <= oldTotal; id++) {
    const t = od.things.get(id);
    if (t) {
      t.id = id - 1;
      od.things.set(id - 1, t);
      od.things.delete(id);
    }
  }
  const newDirty = new Set<number>();
  for (const d of dirtyIds) {
    if (d === shiftAfter) continue; // removed thing
    newDirty.add(d > shiftAfter ? d - 1 : d);
  }
  return newDirty;
}

/**
 * Allocate a new thing ID in the given category and shift higher categories.
 * Returns { insertId, dirtyIds } with the new thing's ID and updated dirty set.
 */
function allocateThingId(od: ObjectData, cat: ThingCategory, dirtyIds: Set<number>): { insertId: number; dirtyIds: Set<number> } {
  const oldTotal = od.itemCount + od.outfitCount + od.effectCount + od.distanceCount;
  let insertId: number;
  let shiftFrom: number;

  switch (cat) {
    case 'item':
      od.itemCount++;
      insertId = od.itemCount;
      shiftFrom = insertId;
      break;
    case 'outfit':
      od.outfitCount++;
      insertId = od.itemCount + od.outfitCount;
      shiftFrom = insertId;
      break;
    case 'effect':
      od.effectCount++;
      insertId = od.itemCount + od.outfitCount + od.effectCount;
      shiftFrom = insertId;
      break;
    case 'distance':
      od.distanceCount++;
      insertId = od.itemCount + od.outfitCount + od.effectCount + od.distanceCount;
      shiftFrom = insertId + 1; // last category, nothing to shift
      break;
  }

  const newDirty = shiftFrom <= oldTotal
    ? shiftThingsUp(od, shiftFrom, oldTotal, dirtyIds)
    : new Set(dirtyIds);
  newDirty.add(insertId);
  return { insertId, dirtyIds: newDirty };
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

  // Server item definitions (from definitions.json)
  /** Map of serverId (JSON key) → server-side item data */
  itemDefinitions: Map<number, ServerItemData>;
  /** Map of clientId → serverId for UI lookups (multiple serverIds can map to same clientId) */
  clientToServerIds: Map<number, number>;
  definitionsLoaded: boolean;

  // File System Access API: directory handle for saving back to source folder
  sourceDir: FileSystemDirectoryHandle | null;
  /** Original file names keyed by role */
  sourceNames: { obj?: string; spr?: string; def?: string };

  // UI state
  activeCategory: ThingCategory;
  selectedThingId: number | null;
  searchQuery: string;
  /** Bumped on every edit to force re-render of dependent components */
  editVersion: number;
  /** Set by preview click to tell atlas to scroll to this sprite */
  focusSpriteId: number | null;

  // Actions
  loadFiles: (objBuffer: ArrayBuffer, sprBuffer: ArrayBuffer) => void;
  loadDefinitions: (json: Record<string, ServerItemData>) => void;
  setSourceDir: (dir: FileSystemDirectoryHandle, names: OBState['sourceNames']) => void;
  setActiveCategory: (cat: ThingCategory) => void;
  setSelectedThingId: (id: number | null) => void;
  setSearchQuery: (q: string) => void;
  reset: () => void;

  // Edit actions
  updateThingFlags: (id: number, flags: ThingFlags) => void;
  replaceSprite: (spriteId: number, imageData: ImageData) => void;
  addSprite: (imageData: ImageData) => number | null;
  deleteSprite: (spriteId: number) => void;
  addThing: (cat: ThingCategory) => number | null;
  removeThing: (id: number) => void;
  importThing: (cat: ThingCategory, flags: ThingFlags, frameGroups: FrameGroup[], spritePixels: Map<number, ImageData>) => number | null;
  replaceThing: (targetId: number, flags: ThingFlags, frameGroups: FrameGroup[], spritePixels: Map<number, ImageData>) => boolean;
  undo: () => void;
  redo: () => void;
  markClean: () => void;

  // Server definitions actions
  updateItemDefinition: (itemId: number, data: Partial<ServerItemData>) => void;

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

  itemDefinitions: new Map(),
  clientToServerIds: new Map(),
  definitionsLoaded: false,
  sourceDir: null,
  sourceNames: {},

  activeCategory: 'item',
  selectedThingId: null,
  searchQuery: '',
  editVersion: 0,
  focusSpriteId: null,

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
        focusSpriteId: null,
        // Preserve definitions if already loaded
        ...(get().definitionsLoaded ? {} : { itemDefinitions: new Map(), clientToServerIds: new Map(), definitionsLoaded: false }),
      });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : String(e),
        loading: false,
      });
    }
  },

  loadDefinitions: (json) => {
    const defs = new Map<number, ServerItemData>();
    const c2s = new Map<number, number>();
    for (const [key, value] of Object.entries(json)) {
      const serverId = parseInt(key, 10);
      if (isNaN(serverId)) continue;
      const clientId = value.id ?? serverId;
      defs.set(serverId, {
        serverId,
        id: clientId,
        flags: value.flags ?? 0,
        group: value.group ?? 0,
        properties: value.properties ? { ...value.properties } : null,
      });
      // Build clientId → serverId reverse lookup; prefer entry where serverId==clientId
      if (!c2s.has(clientId) || serverId === clientId) {
        c2s.set(clientId, serverId);
      }
    }
    set({ itemDefinitions: defs, clientToServerIds: c2s, definitionsLoaded: true });
    console.log(`[OB] Loaded ${defs.size} definitions (by serverId), ${c2s.size} client→server mappings`);
  },

  setSourceDir: (dir, names) => {
    set({ sourceDir: dir, sourceNames: { ...get().sourceNames, ...names } });
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
      focusSpriteId: null,
      itemDefinitions: new Map(),
      clientToServerIds: new Map(),
      definitionsLoaded: false,
    });
  },

  updateItemDefinition: (clientId, data) => {
    const { itemDefinitions, clientToServerIds, editVersion } = get();
    const serverId = clientToServerIds.get(clientId) ?? clientId;
    const existing = itemDefinitions.get(serverId);
    const updated: ServerItemData = {
      serverId,
      id: data.id ?? existing?.id ?? clientId,
      flags: data.flags ?? existing?.flags ?? 0,
      group: data.group ?? existing?.group ?? 0,
      properties: data.properties !== undefined
        ? (data.properties ? { ...(existing?.properties ?? {}), ...data.properties } : null)
        : (existing?.properties ? { ...existing.properties } : null),
    };
    const newDefs = new Map(itemDefinitions);
    newDefs.set(serverId, updated);
    const newC2s = new Map(clientToServerIds);
    if (!newC2s.has(clientId)) newC2s.set(clientId, serverId);
    set({ itemDefinitions: newDefs, clientToServerIds: newC2s, dirty: true, editVersion: editVersion + 1 });
  },

  updateThingFlags: (id, newFlags) => {
    const { objectData, undoStack, dirtyIds, editVersion, itemDefinitions } = get();
    if (!objectData) return;
    const thing = objectData.things.get(id);
    if (!thing) return;

    const oldFlags = { ...thing.flags };
    thing.flags = newFlags;
    thing.rawBytes = undefined; // force re-serialization on compile

    const newDirtyIds = new Set(dirtyIds);
    newDirtyIds.add(id);

    // Sync server OTB flags & group from updated visual flags
    if (thing.category === 'item') {
      const { clientToServerIds } = get();
      const serverId = clientToServerIds.get(id) ?? id;
      const existing = itemDefinitions.get(serverId);
      const oldOtb = existing?.flags ?? 0;
      const newOtb = syncOtbFromVisual(oldOtb, newFlags);
      const newGroup = deriveGroup(newFlags);
      const updated: ServerItemData = {
        serverId,
        id: existing?.id ?? id,
        flags: newOtb,
        group: newGroup,
        properties: existing?.properties ? { ...existing.properties } : null,
      };
      const newDefs = new Map(itemDefinitions);
      newDefs.set(serverId, updated);
      set({
        dirty: true,
        dirtyIds: newDirtyIds,
        undoStack: [...undoStack, { thingId: id, oldFlags, newFlags: { ...newFlags } }],
        redoStack: [],
        editVersion: editVersion + 1,
        itemDefinitions: newDefs,
      });
    } else {
      set({
        dirty: true,
        dirtyIds: newDirtyIds,
        undoStack: [...undoStack, { thingId: id, oldFlags, newFlags: { ...newFlags } }],
        redoStack: [],
        editVersion: editVersion + 1,
      });
    }
  },

  undo: () => {
    const { objectData, undoStack, redoStack, editVersion, itemDefinitions } = get();
    if (!objectData || undoStack.length === 0) return;
    const entry = undoStack[undoStack.length - 1];
    const thing = objectData.things.get(entry.thingId);
    if (thing) {
      thing.flags = { ...entry.oldFlags };
      // Sync OTB flags for items
      if (thing.category === 'item') {
        const { clientToServerIds } = get();
        const sid = clientToServerIds.get(entry.thingId) ?? entry.thingId;
        const existing = itemDefinitions.get(sid);
        const newDefs = new Map(itemDefinitions);
        newDefs.set(sid, {
          serverId: sid,
          id: existing?.id ?? entry.thingId,
          flags: syncOtbFromVisual(existing?.flags ?? 0, entry.oldFlags),
          group: deriveGroup(entry.oldFlags),
          properties: existing?.properties ? { ...existing.properties } : null,
        });
        set({
          undoStack: undoStack.slice(0, -1),
          redoStack: [...redoStack, entry],
          editVersion: editVersion + 1,
          itemDefinitions: newDefs,
        });
        return;
      }
    }

    set({
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, entry],
      editVersion: editVersion + 1,
    });
  },

  redo: () => {
    const { objectData, undoStack, redoStack, editVersion, itemDefinitions } = get();
    if (!objectData || redoStack.length === 0) return;
    const entry = redoStack[redoStack.length - 1];
    const thing = objectData.things.get(entry.thingId);
    if (thing) {
      thing.flags = { ...entry.newFlags };
      // Sync OTB flags for items
      if (thing.category === 'item') {
        const { clientToServerIds } = get();
        const sid = clientToServerIds.get(entry.thingId) ?? entry.thingId;
        const existing = itemDefinitions.get(sid);
        const newDefs = new Map(itemDefinitions);
        newDefs.set(sid, {
          serverId: sid,
          id: existing?.id ?? entry.thingId,
          flags: syncOtbFromVisual(existing?.flags ?? 0, entry.newFlags),
          group: deriveGroup(entry.newFlags),
          properties: existing?.properties ? { ...existing.properties } : null,
        });
        set({
          undoStack: [...undoStack, entry],
          redoStack: redoStack.slice(0, -1),
          editVersion: editVersion + 1,
          itemDefinitions: newDefs,
        });
        return;
      }
    }

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

    clearSpriteCacheId(spriteId);

    set({
      dirty: true,
      spriteOverrides: newOverrides,
      dirtySpriteIds: newDirtySpriteIds,
      editVersion: editVersion + 1,
    });
  },

  addSprite: (imageData) => {
    const { spriteData, spriteOverrides, dirtySpriteIds, editVersion } = get();
    if (!spriteData) return null;

    spriteData.spriteCount++;
    const newId = spriteData.spriteCount;

    const newOverrides = new Map(spriteOverrides);
    newOverrides.set(newId, imageData);
    const newDirtySpriteIds = new Set(dirtySpriteIds);
    newDirtySpriteIds.add(newId);

    set({
      dirty: true,
      spriteOverrides: newOverrides,
      dirtySpriteIds: newDirtySpriteIds,
      editVersion: editVersion + 1,
    });

    return newId;
  },

  deleteSprite: (spriteId) => {
    const { spriteOverrides, dirtySpriteIds, editVersion } = get();
    if (spriteId <= 0) return;

    // Store a blank (transparent) ImageData as the override — effectively erases the sprite
    const blank = new ImageData(32, 32);
    const newOverrides = new Map(spriteOverrides);
    newOverrides.set(spriteId, blank);
    const newDirtySpriteIds = new Set(dirtySpriteIds);
    newDirtySpriteIds.add(spriteId);

    clearSpriteCacheId(spriteId);

    set({
      dirty: true,
      spriteOverrides: newOverrides,
      dirtySpriteIds: newDirtySpriteIds,
      editVersion: editVersion + 1,
    });
  },

  addThing: (cat) => {
    const { objectData, editVersion } = get();
    if (!objectData) return null;

    const { insertId, dirtyIds: newDirtyIds } = allocateThingId(objectData, cat, get().dirtyIds);

    const defaultFlags: ThingFlags = {
      ground: false, groundBorder: false, onBottom: false, onTop: false,
      container: false, stackable: false, forceUse: false, multiUse: false,
      writable: false, writableOnce: false, fluidContainer: false, splash: false,
      notWalkable: false, notMoveable: false, blockProjectile: false, notPathable: false,
      pickupable: false, hangable: false, hookSouth: false, hookEast: false,
      rotateable: false, hasLight: false, dontHide: false, translucent: false,
      hasDisplacement: false, hasElevation: false, lyingCorpse: false,
      animateAlways: false, hasMinimapColor: false, fullGround: false, look: false,
      cloth: false, hasMarket: false, usable: false, wrapable: false,
      unwrapable: false, topEffect: false, noMoveAnimation: false, chargeable: false,
    };

    const defaultFrameGroup = {
      type: 0, width: 1, height: 1, layers: 1,
      patternX: 1, patternY: 1, patternZ: 1,
      animationLength: 1, asynchronous: 0, nLoop: 0, start: 0,
      animationLengths: [{ min: 0, max: 0 }],
      sprites: [0],
    };

    const newThing = {
      id: insertId,
      category: cat,
      flags: defaultFlags,
      frameGroups: [defaultFrameGroup],
    };

    objectData.things.set(insertId, newThing);
    newDirtyIds.add(insertId);

    set({
      dirty: true,
      dirtyIds: newDirtyIds,
      selectedThingId: insertId,
      editVersion: editVersion + 1,
    });

    return insertId;
  },

  removeThing: (id) => {
    const { objectData, editVersion, activeCategory } = get();
    if (!objectData) return;
    const thing = objectData.things.get(id);
    if (!thing) return;

    const range = get().getCategoryRange(activeCategory);
    if (!range) return;

    // Only allow removing the last thing in the category
    const lastId = range.end;
    if (id !== lastId) return;

    const oldTotal = objectData.itemCount + objectData.outfitCount + objectData.effectCount + objectData.distanceCount;

    objectData.things.delete(id);

    switch (activeCategory) {
      case 'item': objectData.itemCount--; break;
      case 'outfit': objectData.outfitCount--; break;
      case 'effect': objectData.effectCount--; break;
      case 'distance': objectData.distanceCount--; break;
    }

    // Shift higher-category things down by 1
    const newDirtyIds = shiftThingsDown(objectData, id, oldTotal, get().dirtyIds);

    // Select the previous thing
    const newSelected = id > range.start ? id - 1 : range.start;

    set({
      dirty: true,
      dirtyIds: newDirtyIds,
      selectedThingId: objectData.things.has(newSelected) ? newSelected : null,
      editVersion: editVersion + 1,
    });
  },

  importThing: (cat, flags, frameGroups, spritePixels) => {
    const { objectData, spriteData, editVersion, spriteOverrides, dirtySpriteIds } = get();
    if (!objectData || !spriteData) return null;

    // Step 1: Allocate a new thing ID and shift higher categories
    const { insertId: newId, dirtyIds: shiftedDirtyIds } = allocateThingId(objectData, cat, get().dirtyIds);

    // Step 2: Remap sprite IDs to new IDs starting from spriteData.spriteCount + 1
    // and store the pixel data as overrides
    const newOverrides = new Map(spriteOverrides);
    const newDirtySpriteIds = new Set(dirtySpriteIds);
    const idRemap = new Map<number, number>();

    for (const [oldId, imgData] of spritePixels) {
      if (oldId === 0) continue;
      if (idRemap.has(oldId)) continue;
      spriteData.spriteCount++;
      const newSpriteId = spriteData.spriteCount;
      idRemap.set(oldId, newSpriteId);
      newOverrides.set(newSpriteId, imgData);
      newDirtySpriteIds.add(newSpriteId);
    }

    // Step 3: Clone frame groups with remapped sprite IDs
    const remappedGroups = frameGroups.map((fg, i) => ({
      ...fg,
      type: i,
      sprites: fg.sprites.map(sid => sid === 0 ? 0 : (idRemap.get(sid) ?? sid)),
      animationLengths: fg.animationLengths.map(d => ({ ...d })),
    }));

    const newThing: ThingType = {
      id: newId,
      category: cat,
      flags: { ...flags },
      frameGroups: remappedGroups,
    };

    objectData.things.set(newId, newThing);

    clearSpriteCache();

    set({
      dirty: true,
      dirtyIds: shiftedDirtyIds,
      spriteOverrides: newOverrides,
      dirtySpriteIds: newDirtySpriteIds,
      selectedThingId: newId,
      activeCategory: cat,
      editVersion: editVersion + 1,
    });

    return newId;
  },

  replaceThing: (targetId, flags, frameGroups, spritePixels) => {
    const { objectData, spriteData, editVersion, spriteOverrides, dirtySpriteIds } = get();
    if (!objectData || !spriteData) return false;

    const existing = objectData.things.get(targetId);
    if (!existing) return false;

    // Step 1: Remap sprite IDs to new IDs (same as importThing)
    const newOverrides = new Map(spriteOverrides);
    const newDirtySpriteIds = new Set(dirtySpriteIds);
    const idRemap = new Map<number, number>();

    for (const [oldId, imgData] of spritePixels) {
      if (oldId === 0) continue;
      if (idRemap.has(oldId)) continue;
      spriteData.spriteCount++;
      const newSpriteId = spriteData.spriteCount;
      idRemap.set(oldId, newSpriteId);
      newOverrides.set(newSpriteId, imgData);
      newDirtySpriteIds.add(newSpriteId);
    }

    // Step 2: Clone frame groups with remapped sprite IDs
    const remappedGroups = frameGroups.map((fg, i) => ({
      ...fg,
      type: i,
      sprites: fg.sprites.map(sid => sid === 0 ? 0 : (idRemap.get(sid) ?? sid)),
      animationLengths: fg.animationLengths.map(d => ({ ...d })),
    }));

    // Step 3: Overwrite the existing thing in-place (same ID and category)
    const replacedThing: ThingType = {
      id: targetId,
      category: existing.category,
      flags: { ...flags },
      frameGroups: remappedGroups,
    };

    objectData.things.set(targetId, replacedThing);

    const newDirtyIds = new Set(get().dirtyIds);
    newDirtyIds.add(targetId);

    clearSpriteCache();

    set({
      dirty: true,
      dirtyIds: newDirtyIds,
      spriteOverrides: newOverrides,
      dirtySpriteIds: newDirtySpriteIds,
      editVersion: editVersion + 1,
    });

    return true;
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

/** Convert internal map ID to display ID (0-based for outfits/effects/distances). */
export function getDisplayId(objectData: ObjectData, internalId: number): number {
  if (internalId <= objectData.itemCount) return internalId; // items stay as-is (100+)
  if (internalId <= objectData.itemCount + objectData.outfitCount) return internalId - objectData.itemCount - 1;
  if (internalId <= objectData.itemCount + objectData.outfitCount + objectData.effectCount) return internalId - objectData.itemCount - objectData.outfitCount - 1;
  return internalId - objectData.itemCount - objectData.outfitCount - objectData.effectCount - 1;
}

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
      if (searchQuery) {
        const displayId = getDisplayId(objectData, id);
        if (!displayId.toString().includes(searchQuery)) continue;
      }
      things.push(thing);
    }
  }
  return things;
}
