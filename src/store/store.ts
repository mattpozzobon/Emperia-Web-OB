/**
 * Global state for the Object Builder using Zustand.
 */
import { create } from 'zustand';
import type { ThingType, ThingCategory, ThingFlags, FrameGroup, ServerItemData } from '../lib/types';
import { parseObjectData } from '../lib/object-parser';
import { parseSpriteData, clearSpriteCache, clearSpriteCacheId } from '../lib/sprite-decoder';
import { maybeDecompress } from '../lib/emperia-format';
import { syncOtbFromVisual, deriveGroup } from '../lib/types';
import type { OBState } from './store-types';
import { shiftThingsDown, allocateThingId } from './thing-helpers';
import { createHairSlice } from './hair-slice';
import { createSpriteMapSlice } from './sprite-map-slice';
import { createCompactAtlasAction } from './compact-atlas';

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
  spriteMapEntries: [],
  spriteMapLoaded: false,
  hairDefinitions: [],
  hairDefsLoaded: false,
  selectedHairId: null,
  sourceDir: null,
  sourceNames: {},
  sourceHandles: {},

  centerTab: 'texture',
  activeCategory: 'item',
  selectedThingId: null,
  selectedThingIds: new Set(),
  searchQuery: '',
  filterGroup: -1,
  editVersion: 0,
  focusSpriteId: null,
  importTileSize: 1,
  selectedSlots: [],
  copiedThing: null,

  activeLayer: 0,
  blendLayers: false,
  currentFrame: 0,
  playing: false,
  outfitColors: { head: 0, body: 0, legs: 0, feet: 0 },
  showColorPicker: null,

  // ─── File loading ───────────────────────────────────────────────────────────

  loadFiles: async (objBuffer, sprBuffer) => {
    set({ loading: true, error: null });
    try {
      const objectData = parseObjectData(objBuffer);
      const decompressedSpr = await maybeDecompress(sprBuffer);
      const spriteData = parseSpriteData(decompressedSpr);
      clearSpriteCache();
      set({
        objectData,
        spriteData,
        loaded: true,
        loading: false,
        selectedThingId: 100,
        selectedThingIds: new Set(),
        activeCategory: 'item',
        dirty: false,
        dirtyIds: new Set(),
        undoStack: [],
        redoStack: [],
        spriteOverrides: new Map(),
        dirtySpriteIds: new Set(),
        editVersion: 0,
        focusSpriteId: null,
        copiedThing: null,
        // Preserve definitions and sprite map if already loaded
        ...(get().definitionsLoaded ? {} : { itemDefinitions: new Map(), clientToServerIds: new Map(), definitionsLoaded: false }),
        ...(get().spriteMapLoaded ? {} : { spriteMapEntries: [], spriteMapLoaded: false }),
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

    // Warn if definitions reference clientIds beyond the .eobj item range
    const od = get().objectData;
    if (od) {
      let outOfRange = 0;
      for (const def of defs.values()) {
        const cid = def.id ?? 0;
        if (cid > od.itemCount || cid < 100) outOfRange++;
      }
      if (outOfRange > 0) {
        console.warn(`[OB] ⚠️ ${outOfRange} definitions reference clientIds outside the .eobj range (100–${od.itemCount}). These items will be invisible in-game.`);
      }
    }
  },

  // ─── Source file handles ────────────────────────────────────────────────────

  setSourceDir: (dir, names) => {
    set({ sourceDir: dir, sourceNames: { ...get().sourceNames, ...names } });
  },

  setSourceHandles: (handles) => {
    set({ sourceHandles: { ...get().sourceHandles, ...handles } });
  },

  // ─── UI state ───────────────────────────────────────────────────────────────

  setCenterTab: (tab) => set({ centerTab: tab }),

  setActiveCategory: (cat) => {
    const range = get().getCategoryRange(cat);
    set({
      activeCategory: cat,
      selectedThingId: range ? range.start : null,
      selectedThingIds: new Set(),
      searchQuery: '',
      filterGroup: -1,
    });
  },

  setSelectedThingId: (id) => set({ selectedThingId: id, selectedThingIds: new Set() }),
  toggleThingSelection: (id, range) => {
    const prev = get().selectedThingIds;
    const next = new Set(prev);
    if (range) {
      // Shift+click: add entire range
      for (const rid of range) next.add(rid);
    } else {
      // Ctrl+click: toggle single
      if (next.has(id)) next.delete(id); else next.add(id);
    }
    set({ selectedThingIds: next, selectedThingId: id });
  },
  clearThingSelection: () => set({ selectedThingIds: new Set() }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setFilterGroup: (g) => set({ filterGroup: g }),

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
      filterGroup: -1,
      dirty: false,
      dirtyIds: new Set(),
      undoStack: [],
      redoStack: [],
      spriteOverrides: new Map(),
      dirtySpriteIds: new Set(),
      editVersion: 0,
      focusSpriteId: null,
      copiedThing: null,
      itemDefinitions: new Map(),
      clientToServerIds: new Map(),
      definitionsLoaded: false,
      spriteMapEntries: [],
      spriteMapLoaded: false,
      hairDefinitions: [],
      hairDefsLoaded: false,
      selectedHairId: null,
      sourceHandles: {},
    });
  },

  // ─── Server definitions ─────────────────────────────────────────────────────

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

  // ─── Thing flag editing + undo/redo ─────────────────────────────────────────

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
      // Sync friction property from groundSpeed
      const syncedProps: Record<string, unknown> = existing?.properties ? { ...existing.properties } : {};
      if (newFlags.ground && newFlags.groundSpeed != null && newFlags.groundSpeed !== 100) {
        syncedProps.friction = newFlags.groundSpeed;
      } else {
        delete syncedProps.friction;
      }
      const updated: ServerItemData = {
        serverId,
        id: existing?.id ?? id,
        flags: newOtb,
        group: newGroup,
        properties: Object.keys(syncedProps).length > 0 ? syncedProps as any : null,
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

  // ─── Sprite editing ─────────────────────────────────────────────────────────

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

  deleteSprites: (spriteIds) => {
    const { spriteOverrides, dirtySpriteIds, editVersion } = get();
    if (spriteIds.length === 0) return;

    const blank = new ImageData(32, 32);
    const newOverrides = new Map(spriteOverrides);
    const newDirtySpriteIds = new Set(dirtySpriteIds);

    for (const id of spriteIds) {
      if (id <= 0) continue;
      newOverrides.set(id, blank);
      newDirtySpriteIds.add(id);
      clearSpriteCacheId(id);
    }

    set({
      dirty: true,
      spriteOverrides: newOverrides,
      dirtySpriteIds: newDirtySpriteIds,
      editVersion: editVersion + 1,
    });
  },

  // ─── Thing add / remove / import / replace ──────────────────────────────────

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

    // Auto-create a server definition for new items so the clientId matches the .eobj position
    const stateUpdate: Partial<OBState> = {
      dirty: true,
      dirtyIds: newDirtyIds,
      selectedThingId: insertId,
      editVersion: editVersion + 1,
    };

    if (cat === 'item' && get().definitionsLoaded) {
      const { itemDefinitions, clientToServerIds } = get();
      // Always create a new server definition for new items.
      // Even if c2s already maps this clientId to an old serverId, the new .eobj
      // entry needs its own definition so the server can reference it correctly.
      const existingServerId = clientToServerIds.get(insertId);

      // Allocate next available serverId (max existing + 1)
      let maxServerId = 0;
      for (const sid of itemDefinitions.keys()) {
        if (sid > maxServerId) maxServerId = sid;
      }
      const newServerId = maxServerId + 1;

      const newDef: ServerItemData = {
        serverId: newServerId,
        id: insertId, // clientId = .eobj internal ID
        flags: 0,
        group: 0,
        properties: null,
      };

      const newDefs = new Map(itemDefinitions);
      newDefs.set(newServerId, newDef);
      const newC2s = new Map(clientToServerIds);
      // Point this clientId to the NEW serverId (overrides any stale mapping)
      newC2s.set(insertId, newServerId);

      stateUpdate.itemDefinitions = newDefs;
      stateUpdate.clientToServerIds = newC2s;

      if (existingServerId != null) {
        console.log(`[OB] Auto-created definition: serverId=${newServerId} clientId=${insertId} (overriding stale mapping to serverId=${existingServerId})`);
      } else {
        console.log(`[OB] Auto-created definition: serverId=${newServerId} clientId=${insertId}`);
      }
    }

    set(stateUpdate);

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

  // ─── Domain slices ──────────────────────────────────────────────────────────

  ...createSpriteMapSlice(set, get),
  ...createHairSlice(set, get),
  ...createCompactAtlasAction(set, get),

  // ─── Utility ────────────────────────────────────────────────────────────────

  markClean: () => {
    // Clear rawBytes on all things so future compiles always re-serialize from parsed data
    const od = get().objectData;
    if (od) {
      for (const thing of od.things.values()) {
        thing.rawBytes = undefined;
      }
    }
    set({ dirty: false, dirtyIds: new Set(), dirtySpriteIds: new Set(), spriteOverrides: new Map() });
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

}));
