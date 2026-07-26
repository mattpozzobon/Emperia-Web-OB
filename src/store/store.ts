/**
 * Global state for the Object Builder using Zustand.
 */
import { create } from 'zustand';
import { ITEM_LOCALES, type ThingType, type ThingCategory, type ThingFlags, type FrameGroup, type ItemDefinition } from '../lib/types';
import { parseObjectData } from '../lib/object-parser';
import { parseSpriteData, clearSpriteCache, clearSpriteCacheId } from '../lib/sprite-decoder';
import { maybeDecompress } from '../lib/emperia-format';
import { syncItemFlagsFromVisual, deriveGroup, deriveTopOrder, poseSetProfileKey } from '../lib/types';
import type { OBState } from './store-types';
import { shiftThingsDown, allocateThingId, remapSpriteIds } from './thing-helpers';
import { createHairCatalogSlice } from './hair-catalog-slice';
import { createEquipmentCatalogSlice } from './equipment-catalog-slice';
import { createCompactAtlasAction } from './compact-atlas';
import { createSpriteGroupSlice } from './sprite-group-slice';
import { createOutfitSlice } from './outfit-slice';
import { sourceHash, sourceTextFromDefinition } from '../lib/item-localization';

function emptyItemLocalizations() {
  return {
    en: new Map(),
    pt: new Map(),
    es: new Map(),
    pl: new Map(),
  };
}

const getSavedLibraryColumns = (): number => {
  if (typeof localStorage === 'undefined') return 6;
  const saved = Number(localStorage.getItem('emperia-ob-library-columns'));
  return Number.isInteger(saved) && saved >= 2 && saved <= 6 ? saved : 6;
};

function registerPrimaryItemForAppearance(
  appearanceMap: Map<number, number>,
  definitions: Map<number, ItemDefinition>,
  definition: ItemDefinition,
): void {
  const currentItemId = appearanceMap.get(definition.appearanceId);
  if (currentItemId == null) {
    appearanceMap.set(definition.appearanceId, definition.itemId);
    return;
  }

  const current = definitions.get(currentItemId);
  if (!current) {
    appearanceMap.set(definition.appearanceId, definition.itemId);
    return;
  }

  const candidateIsExact = definition.itemId === definition.appearanceId;
  const currentIsExact = current.itemId === current.appearanceId;

  if (candidateIsExact && !currentIsExact) {
    appearanceMap.set(definition.appearanceId, definition.itemId);
  }
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
  appearanceToItemIds: new Map(),
  definitionsLoaded: false,
  itemLocalizations: emptyItemLocalizations(),
  selectedHairId: null,
  outfitDefinitions: [],
  outfitDefsLoaded: false,
  selectedOutfitIndex: null,
  sourceDir: null,
  sourceNames: {},
  sourceHandles: {},

  centerTab: 'texture',
  activeCategory: 'item',
  activeLibrary: 'item',
  selectedThingId: null,
  selectedThingIds: new Set(),
  searchQuery: '',
  filterGroup: -1,
  libraryColumns: getSavedLibraryColumns(),
  editVersion: 0,
  focusSpriteId: null,
  importTileWidth: 1,
  importTileHeight: 1,
  spriteGroups: [],
  nextSpriteGroupId: 1,
  draggingSpriteGroupId: null,
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
      const currentState = get();
      let remappedDefinitions = currentState.itemDefinitions;
      let remappedAppearanceToItem = currentState.appearanceToItemIds;
      if (currentState.definitionsLoaded && objectData.itemAppearances.size > 0) {
        remappedDefinitions = new Map();
        remappedAppearanceToItem = new Map();
        for (const [itemId, definition] of currentState.itemDefinitions) {
          const appearanceId = objectData.itemAppearances.get(itemId);
          if (appearanceId == null) continue;
          const remappedDefinition = { ...definition, appearanceId };
          remappedDefinitions.set(itemId, remappedDefinition);
          registerPrimaryItemForAppearance(
            remappedAppearanceToItem,
            remappedDefinitions,
            remappedDefinition,
          );
        }
      }
      const embeddedHairDefinitions = Array.from(objectData.hairDefinitions.values())
        .sort((a, b) => a.sortOrder - b.sortOrder || a.hairId - b.hairId);
      set({
        objectData,
        spriteData,
        loaded: true,
        loading: false,
        selectedThingId: 100,
        selectedThingIds: new Set(),
        activeCategory: 'item',
        activeLibrary: 'item',
        dirty: false,
        dirtyIds: new Set(),
        undoStack: [],
        redoStack: [],
        spriteOverrides: new Map(),
        dirtySpriteIds: new Set(),
        editVersion: 0,
        focusSpriteId: null,
        copiedThing: null,
        // Preserve public item definitions, but always use the catalogs embedded in
        // the EOBJ that was just opened.
        ...(currentState.definitionsLoaded
          ? { itemDefinitions: remappedDefinitions, appearanceToItemIds: remappedAppearanceToItem }
          : { itemDefinitions: new Map(), appearanceToItemIds: new Map(), definitionsLoaded: false }),
        selectedHairId: embeddedHairDefinitions[0]?.hairId ?? null,
      });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : String(e),
        loading: false,
      });
    }
  },

  loadDefinitions: (json) => {
    const defs = new Map<number, ItemDefinition>();
    const appearanceMap = new Map<number, number>();
    const embeddedAppearances = get().objectData?.itemAppearances;
    for (const [key, value] of Object.entries(json)) {
      const itemId = parseInt(key, 10);
      if (isNaN(itemId)) continue;
      const appearanceId = embeddedAppearances?.get(itemId);
      if (appearanceId == null) continue;
      const definition: ItemDefinition = {
        itemId,
        appearanceId,
        flags: value.flags ?? 0,
        group: value.group ?? 0,
        ...(value.topOrder ? { topOrder: value.topOrder } : {}),
        properties: value.properties ? { ...value.properties } : null,
      };
      defs.set(itemId, definition);
      registerPrimaryItemForAppearance(appearanceMap, defs, definition);
    }
    const itemLocalizations = { ...get().itemLocalizations, en: new Map(get().itemLocalizations.en) };
    for (const [itemId, definition] of defs) {
      const source = sourceTextFromDefinition(definition);
      if (source) itemLocalizations.en.set(itemId, source);
    }
    set({ itemDefinitions: defs, appearanceToItemIds: appearanceMap, definitionsLoaded: true, itemLocalizations });
  },

  loadItemCatalogs: (catalogs) => {
    const next = emptyItemLocalizations();
    for (const locale of ITEM_LOCALES) {
      const catalog = catalogs[locale];
      if (!catalog) continue;
      for (const [itemId, entry] of Object.entries(catalog.items)) {
        next[locale].set(Number(itemId), { ...entry });
      }
    }
    for (const [itemId, definition] of get().itemDefinitions) {
      const source = sourceTextFromDefinition(definition);
      if (source) next.en.set(itemId, source);
    }
    for (const locale of ITEM_LOCALES) {
      if (locale === 'en') continue;
      for (const [itemId, entry] of next[locale]) {
        const source = next.en.get(itemId);
        if (source && entry.sourceHash !== sourceHash(source)) {
          next[locale].set(itemId, { ...entry, status: 'stale' });
        }
      }
    }
    set({ itemLocalizations: next });
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
      activeLibrary: cat,
      selectedThingId: range ? range.start : null,
      selectedThingIds: new Set(),
      searchQuery: '',
      filterGroup: -1,
    });
  },

  setActiveLibrary: (cat) => {
    get().setActiveCategory(cat);
    if (cat === 'equipment' || cat === 'hair') set({ centerTab: cat });
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
  setLibraryColumns: (columns) => {
    const next = Math.max(2, Math.min(6, Math.round(columns)));
    localStorage.setItem('emperia-ob-library-columns', String(next));
    set({ libraryColumns: next });
  },

  reset: () => {
    clearSpriteCache();
    set({
      objectData: null,
      spriteData: null,
      loaded: false,
      loading: false,
      error: null,
      activeCategory: 'item',
      activeLibrary: 'item',
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
      appearanceToItemIds: new Map(),
      definitionsLoaded: false,
      itemLocalizations: emptyItemLocalizations(),
      selectedHairId: null,
      sourceHandles: {},
    });
  },

  // ─── Server definitions ─────────────────────────────────────────────────────

  updateItemDefinition: (appearanceId, data) => {
    const { itemDefinitions, appearanceToItemIds, editVersion, itemLocalizations } = get();
    const itemId = appearanceToItemIds.get(appearanceId) ?? appearanceId;
    const existing = itemDefinitions.get(itemId);
    const updated: ItemDefinition = {
      itemId,
      appearanceId: data.appearanceId ?? existing?.appearanceId ?? appearanceId,
      flags: data.flags ?? existing?.flags ?? 0,
      group: data.group ?? existing?.group ?? 0,
      properties: data.properties !== undefined
        ? (data.properties ? { ...data.properties } : null)
        : (existing?.properties ? { ...existing.properties } : null),
    };
    const newDefs = new Map(itemDefinitions);
    newDefs.set(itemId, updated);
    const newAppearanceMap = new Map(appearanceToItemIds);
    if (!newAppearanceMap.has(appearanceId)) newAppearanceMap.set(appearanceId, itemId);
    const nextLocalizations = { ...itemLocalizations, en: new Map(itemLocalizations.en) };
    const source = sourceTextFromDefinition(updated);
    if (source) {
      const previousHash = itemLocalizations.en.get(itemId)
        ? sourceHash(itemLocalizations.en.get(itemId)!)
        : null;
      const nextHash = sourceHash(source);
      nextLocalizations.en.set(itemId, source);
      if (previousHash !== null && previousHash !== nextHash) {
        for (const locale of ITEM_LOCALES) {
          if (locale === 'en') continue;
          const translated = itemLocalizations[locale].get(itemId);
          if (!translated) continue;
          nextLocalizations[locale] = new Map(nextLocalizations[locale]);
          nextLocalizations[locale].set(itemId, { ...translated, status: 'stale' });
        }
      }
    } else {
      nextLocalizations.en.delete(itemId);
      for (const locale of ITEM_LOCALES) {
        if (locale === 'en' || !itemLocalizations[locale].has(itemId)) continue;
        nextLocalizations[locale] = new Map(nextLocalizations[locale]);
        nextLocalizations[locale].delete(itemId);
      }
    }
    set({
      itemDefinitions: newDefs,
      appearanceToItemIds: newAppearanceMap,
      itemLocalizations: nextLocalizations,
      dirty: true,
      editVersion: editVersion + 1,
    });
  },

  updateItemLocalization: (itemId, locale, text) => {
    if (locale === 'en') return;
    const { itemLocalizations, editVersion } = get();
    const next = { ...itemLocalizations, [locale]: new Map(itemLocalizations[locale]) };
    if (text?.name.trim()) next[locale].set(itemId, { ...text, name: text.name.trim() });
    else next[locale].delete(itemId);
    set({ itemLocalizations: next, dirty: true, editVersion: editVersion + 1 });
  },

  markItemTranslationReviewed: (itemId, locale) => {
    const { itemLocalizations, editVersion } = get();
    const current = itemLocalizations[locale].get(itemId);
    const source = itemLocalizations.en.get(itemId);
    if (!current || !source) return;
    const next = { ...itemLocalizations, [locale]: new Map(itemLocalizations[locale]) };
    next[locale].set(itemId, {
      ...current,
      sourceHash: sourceHash(source),
      status: 'reviewed',
    });
    set({ itemLocalizations: next, dirty: true, editVersion: editVersion + 1 });
  },

  resetItemTranslationReviews: (onlyLocale) => {
    const { itemLocalizations, editVersion } = get();
    const next = { ...itemLocalizations };
    let changed = 0;
    for (const locale of ITEM_LOCALES) {
      if (locale === 'en' || (onlyLocale && locale !== onlyLocale)) continue;
      const entries = new Map(itemLocalizations[locale]);
      for (const [itemId, entry] of entries) {
        if (entry.status !== 'reviewed') continue;
        entries.set(itemId, { ...entry, status: 'draft' });
        changed += 1;
      }
      next[locale] = entries;
    }
    if (changed > 0) {
      set({
        itemLocalizations: next,
        dirty: true,
        editVersion: editVersion + 1,
      });
    }
    return changed;
  },

  updateItemSeatDefinition: (appearanceId, definition) => {
    const { objectData, appearanceToItemIds, editVersion } = get();
    if (!objectData) return;
    let itemId = appearanceToItemIds.get(appearanceId);
    if (itemId == null) {
      for (const [candidateItemId, candidateAppearanceId] of objectData.itemAppearances) {
        if (candidateAppearanceId === appearanceId) {
          itemId = candidateItemId;
          break;
        }
      }
    }
    if (itemId == null) return;
    const itemSeatDefinitions = new Map(objectData.itemSeatDefinitions);
    if (definition) {
      itemSeatDefinitions.set(itemId, {
        poseSetId: definition.poseSetId,
        directionMask: definition.directionMask & 0x0F,
        offsets: {
          north: { ...definition.offsets.north },
          east: { ...definition.offsets.east },
          south: { ...definition.offsets.south },
          west: { ...definition.offsets.west },
        },
      });
    } else {
      itemSeatDefinitions.delete(itemId);
    }
    set({
      objectData: { ...objectData, itemSeatDefinitions },
      dirty: true,
      editVersion: editVersion + 1,
    });
  },

  updateSeatPoseProfile: (profile) => {
    const { objectData, editVersion } = get();
    if (!objectData) return;
    if (profile.poseSetId == null || !objectData.poseSets.has(profile.poseSetId)) return;
    const seatPoseProfiles = new Map(objectData.seatPoseProfiles);
    const poseSet = objectData.poseSets.get(profile.poseSetId)!;
    const profileKey = poseSetProfileKey(profile.poseSetId, profile.direction);
    seatPoseProfiles.set(profileKey, structuredClone({
      ...profile,
      action: poseSet.action,
      variant: undefined,
      seatType: undefined,
    }));
    set({
      objectData: { ...objectData, seatPoseProfiles },
      dirty: true,
      editVersion: editVersion + 1,
    });
  },

  createPoseSet: (action, name, copyFromId) => {
    const { objectData, editVersion } = get();
    if (!objectData) return null;
    const usedIds = new Set(objectData.poseSets.keys());
    let id = 1;
    while (usedIds.has(id) && id < 0xFFFF) id++;
    if (usedIds.has(id)) return null;

    const poseSets = new Map(objectData.poseSets);
    poseSets.set(id, {
      id,
      action,
      name: name.trim() || `Pose Set ${id}`,
    });
    const seatPoseProfiles = new Map(objectData.seatPoseProfiles);
    if (copyFromId != null) {
      for (const profile of objectData.seatPoseProfiles.values()) {
        if (profile.poseSetId !== copyFromId) continue;
        const copy = structuredClone(profile);
        copy.poseSetId = id;
        copy.action = action;
        copy.variant = undefined;
        copy.seatType = undefined;
        seatPoseProfiles.set(poseSetProfileKey(id, copy.direction), copy);
      }
    }
    set({
      objectData: { ...objectData, poseSets, seatPoseProfiles },
      dirty: true,
      editVersion: editVersion + 1,
    });
    return id;
  },

  renamePoseSet: (poseSetId, name) => {
    const { objectData, editVersion } = get();
    const poseSet = objectData?.poseSets.get(poseSetId);
    const trimmedName = name.trim();
    if (!objectData || !poseSet || !trimmedName || trimmedName === poseSet.name) return;
    const poseSets = new Map(objectData.poseSets);
    poseSets.set(poseSetId, { ...poseSet, name: trimmedName });
    set({
      objectData: { ...objectData, poseSets },
      dirty: true,
      editVersion: editVersion + 1,
    });
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
      const { appearanceToItemIds } = get();
      let itemId = appearanceToItemIds.get(id);
      const newDefs = new Map(itemDefinitions);
      let newAppearanceMap: Map<number, number> | undefined;

      // Auto-create a public item definition if this appearance doesn't have one yet.
      if (itemId == null) {
        let maxItemId = 0;
        for (const existingItemId of itemDefinitions.keys()) {
          if (existingItemId > maxItemId) maxItemId = existingItemId;
        }
        itemId = maxItemId + 1;
        newAppearanceMap = new Map(appearanceToItemIds);
        newAppearanceMap.set(id, itemId);
      }

      const existing = itemDefinitions.get(itemId);
      const oldItemFlags = existing?.flags ?? 0;
      const newItemFlags = syncItemFlagsFromVisual(oldItemFlags, newFlags);
      const newGroup = deriveGroup(newFlags);
      // Sync friction property from groundSpeed
      const syncedProps: Record<string, unknown> = existing?.properties ? { ...existing.properties } : {};
      if (newFlags.ground && newFlags.groundSpeed != null && newFlags.groundSpeed !== 100) {
        syncedProps.friction = newFlags.groundSpeed;
      } else {
        delete syncedProps.friction;
      }
      const newTopOrder = deriveTopOrder(newFlags);
      const updated: ItemDefinition = {
        itemId,
        appearanceId: existing?.appearanceId ?? id,
        flags: newItemFlags,
        group: newGroup,
        ...(newTopOrder ? { topOrder: newTopOrder } : {}),
        properties: Object.keys(syncedProps).length > 0 ? syncedProps as any : null,
      };
      newDefs.set(itemId, updated);
      set({
        dirty: true,
        dirtyIds: newDirtyIds,
        undoStack: [...undoStack, { thingId: id, oldFlags, newFlags: { ...newFlags } }],
        redoStack: [],
        editVersion: editVersion + 1,
        itemDefinitions: newDefs,
        ...(newAppearanceMap ? { appearanceToItemIds: newAppearanceMap } : {}),
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
        const { appearanceToItemIds } = get();
        const itemId = appearanceToItemIds.get(entry.thingId) ?? entry.thingId;
        const existing = itemDefinitions.get(itemId);
        const newDefs = new Map(itemDefinitions);
        const undoTopOrder = deriveTopOrder(entry.oldFlags);
        newDefs.set(itemId, {
          itemId,
          appearanceId: existing?.appearanceId ?? entry.thingId,
          flags: syncItemFlagsFromVisual(existing?.flags ?? 0, entry.oldFlags),
          group: deriveGroup(entry.oldFlags),
          ...(undoTopOrder ? { topOrder: undoTopOrder } : {}),
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
        const { appearanceToItemIds } = get();
        const itemId = appearanceToItemIds.get(entry.thingId) ?? entry.thingId;
        const existing = itemDefinitions.get(itemId);
        const newDefs = new Map(itemDefinitions);
        const redoTopOrder = deriveTopOrder(entry.newFlags);
        newDefs.set(itemId, {
          itemId,
          appearanceId: existing?.appearanceId ?? entry.thingId,
          flags: syncItemFlagsFromVisual(existing?.flags ?? 0, entry.newFlags),
          group: deriveGroup(entry.newFlags),
          ...(redoTopOrder ? { topOrder: redoTopOrder } : {}),
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
      rotateable: false, hasLight: false, translucent: false,
      hasDisplacement: false, hasElevation: false,
      animateAlways: false, hasMinimapColor: false,
      renderBelowCreatures: false,
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

    // Auto-create a public item definition so appearanceId matches the EOBJ position.
    const stateUpdate: Partial<OBState> = {
      dirty: true,
      dirtyIds: newDirtyIds,
      selectedThingId: insertId,
      editVersion: editVersion + 1,
    };

    if (cat === 'item' && get().definitionsLoaded) {
      const { itemDefinitions, appearanceToItemIds } = get();
      // Always create a new public item definition for new items.
      // Even if appearanceMap already maps this appearanceId to an old itemId, the new .eobj
      // entry needs its own definition so the server can reference it correctly.
      // Allocate next available itemId (max existing + 1)
      let maxItemId = 0;
      for (const existingItemId of itemDefinitions.keys()) {
        if (existingItemId > maxItemId) maxItemId = existingItemId;
      }
      const newItemId = maxItemId + 1;

      const newDef: ItemDefinition = {
        itemId: newItemId,
        appearanceId: insertId,
        flags: 0,
        group: 0,
        properties: null,
      };

      const newDefs = new Map(itemDefinitions);
      newDefs.set(newItemId, newDef);
      const newAppearanceMap = new Map(appearanceToItemIds);
      // Point this appearanceId to the NEW itemId (overrides any stale mapping)
      newAppearanceMap.set(insertId, newItemId);

      stateUpdate.itemDefinitions = newDefs;
      stateUpdate.appearanceToItemIds = newAppearanceMap;

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

    const oldTotal = objectData.itemCount + objectData.outfitCount + objectData.equipmentCount
      + objectData.hairCount + objectData.effectCount + objectData.distanceCount;

    objectData.things.delete(id);

    switch (activeCategory) {
      case 'item': objectData.itemCount--; break;
      case 'outfit': objectData.outfitCount--; break;
      case 'equipment': objectData.equipmentCount--; break;
      case 'hair': objectData.hairCount--; break;
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

  clearThing: (id) => {
    const { objectData, editVersion } = get();
    if (!objectData) return;
    const thing = objectData.things.get(id);
    if (!thing) return;

    // Strip the thing down to an empty placeholder — zero sprites, zero flags.
    // The ID slot stays so nothing shifts.
    const emptyFlags: ThingFlags = {
      ground: false, groundBorder: false, onBottom: false, onTop: false,
      container: false, stackable: false, forceUse: false, multiUse: false,
      writable: false, writableOnce: false, fluidContainer: false, splash: false,
      notWalkable: false, notMoveable: false, blockProjectile: false, notPathable: false,
      pickupable: false, hangable: false, hookSouth: false, hookEast: false,
      rotateable: false, hasLight: false, translucent: false,
      hasDisplacement: false, hasElevation: false,
      animateAlways: false, hasMinimapColor: false,
      renderBelowCreatures: false,
    };

    const emptyFrameGroup = {
      type: 0, width: 1, height: 1, layers: 1,
      patternX: 1, patternY: 1, patternZ: 1,
      animationLength: 1, asynchronous: 0, nLoop: 0, start: 0,
      animationLengths: [{ min: 0, max: 0 }],
      sprites: [0],
    };

    thing.flags = emptyFlags;
    thing.frameGroups = [emptyFrameGroup];
    thing.rawBytes = undefined;

    const newDirtyIds = new Set(get().dirtyIds);
    newDirtyIds.add(id);

    const stateUpdate: Partial<OBState> = {
      dirty: true,
      dirtyIds: newDirtyIds,
      editVersion: editVersion + 1,
    };

    // Also clear public item definition properties.
    if (thing.category === 'item' && get().definitionsLoaded) {
      const { itemDefinitions, appearanceToItemIds } = get();
      const itemId = appearanceToItemIds.get(id);
      if (itemId != null && itemDefinitions.has(itemId)) {
        const newDefs = new Map(itemDefinitions);
        newDefs.set(itemId, { itemId, appearanceId: id, flags: 0, group: 0, properties: null });
        stateUpdate.itemDefinitions = newDefs;
      }
    }

    clearSpriteCache();
    set(stateUpdate);
  },

  importThing: (cat, flags, frameGroups, spritePixels) => {
    const { objectData, spriteData, editVersion, spriteOverrides, dirtySpriteIds } = get();
    if (!objectData || !spriteData) return null;

    // Step 1: Allocate a new thing ID and shift higher categories
    const { insertId: newId, dirtyIds: shiftedDirtyIds } = allocateThingId(objectData, cat, get().dirtyIds);

    // Step 2: Remap sprite IDs and clone frame groups
    const { newOverrides, newDirtySpriteIds, remappedGroups } = remapSpriteIds(
      spriteData, spriteOverrides, dirtySpriteIds, frameGroups, spritePixels,
    );

    const newThing: ThingType = {
      id: newId,
      category: cat,
      flags: { ...flags },
      frameGroups: remappedGroups,
    };

    objectData.things.set(newId, newThing);

    clearSpriteCache();

    const stateUpdate: Partial<OBState> = {
      dirty: true,
      dirtyIds: shiftedDirtyIds,
      spriteOverrides: newOverrides,
      dirtySpriteIds: newDirtySpriteIds,
      selectedThingId: newId,
      activeCategory: cat,
      editVersion: editVersion + 1,
    };

    // Auto-create a public item definition for imported items.
    if (cat === 'item' && get().definitionsLoaded) {
      const { itemDefinitions, appearanceToItemIds } = get();
      let maxItemId = 0;
      for (const existingItemId of itemDefinitions.keys()) {
        if (existingItemId > maxItemId) maxItemId = existingItemId;
      }
      const newItemId = maxItemId + 1;

      const newDef: ItemDefinition = {
        itemId: newItemId,
        appearanceId: newId,
        flags: 0,
        group: 0,
        properties: null,
      };

      const newDefs = new Map(itemDefinitions);
      newDefs.set(newItemId, newDef);
      const newAppearanceMap = new Map(appearanceToItemIds);
      newAppearanceMap.set(newId, newItemId);

      stateUpdate.itemDefinitions = newDefs;
      stateUpdate.appearanceToItemIds = newAppearanceMap;
    }

    set(stateUpdate);

    return newId;
  },

  replaceThing: (targetId, flags, frameGroups, spritePixels) => {
    const { objectData, spriteData, editVersion, spriteOverrides, dirtySpriteIds } = get();
    if (!objectData || !spriteData) return false;

    const existing = objectData.things.get(targetId);
    if (!existing) return false;

    // Step 1: Remap sprite IDs and clone frame groups
    const { newOverrides, newDirtySpriteIds, remappedGroups } = remapSpriteIds(
      spriteData, spriteOverrides, dirtySpriteIds, frameGroups, spritePixels,
    );

    // Step 2: Overwrite the existing thing in-place (same ID and category)
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

    const stateUpdate: Partial<OBState> = {
      dirty: true,
      dirtyIds: newDirtyIds,
      spriteOverrides: newOverrides,
      dirtySpriteIds: newDirtySpriteIds,
      editVersion: editVersion + 1,
    };

    // Ensure a public item definition exists for replaced items.
    if (existing.category === 'item' && get().definitionsLoaded) {
      const { itemDefinitions, appearanceToItemIds } = get();
      if (!appearanceToItemIds.has(targetId)) {
        let maxItemId = 0;
        for (const existingItemId of itemDefinitions.keys()) {
          if (existingItemId > maxItemId) maxItemId = existingItemId;
        }
        const newItemId = maxItemId + 1;

        const newDef: ItemDefinition = {
          itemId: newItemId,
          appearanceId: targetId,
          flags: 0,
          group: 0,
          properties: null,
        };

        const newDefs = new Map(itemDefinitions);
        newDefs.set(newItemId, newDef);
        const newAppearanceMap = new Map(appearanceToItemIds);
        newAppearanceMap.set(targetId, newItemId);

        stateUpdate.itemDefinitions = newDefs;
        stateUpdate.appearanceToItemIds = newAppearanceMap;
      }
    }

    set(stateUpdate);

    return true;
  },

  // ─── Domain slices ──────────────────────────────────────────────────────────

  ...createEquipmentCatalogSlice(set, get),
  ...createHairCatalogSlice(set, get),
  ...createCompactAtlasAction(set, get),
  ...createSpriteGroupSlice(set, get),
  ...createOutfitSlice(set, get),

  // ─── Utility ────────────────────────────────────────────────────────────────

  markClean: () => {
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
      case 'equipment':
        return {
          start: od.itemCount + od.outfitCount + 1,
          end: od.itemCount + od.outfitCount + od.equipmentCount,
        };
      case 'hair':
        return {
          start: od.itemCount + od.outfitCount + od.equipmentCount + 1,
          end: od.itemCount + od.outfitCount + od.equipmentCount + od.hairCount,
        };
      case 'effect':
        return {
          start: od.itemCount + od.outfitCount + od.equipmentCount + od.hairCount + 1,
          end: od.itemCount + od.outfitCount + od.equipmentCount + od.hairCount + od.effectCount,
        };
      case 'distance':
        return {
          start: od.itemCount + od.outfitCount + od.equipmentCount + od.hairCount + od.effectCount + 1,
          end: od.itemCount + od.outfitCount + od.equipmentCount + od.hairCount + od.effectCount + od.distanceCount,
        };
    }
  },

}));
