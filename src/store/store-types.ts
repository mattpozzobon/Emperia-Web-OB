/**
 * Shared types for the OB Zustand store.
 */
import type { ObjectData, SpriteData, ThingType, ThingCategory, ThingFlags, FrameGroup, ServerItemData, ItemToSpriteEntry, ItemToSpriteFile, HairDefinition, HairDefinitionsFile } from '../lib/types';
import type { OutfitColorIndices } from '../lib/outfit-colors';

export interface UndoEntry {
  thingId: number;
  oldFlags: ThingFlags;
  newFlags: ThingFlags;
}

export interface OBState {
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

  // Equipment sprite mapping (item-to-sprite.json)
  /** Raw entries from item-to-sprite.json */
  spriteMapEntries: ItemToSpriteEntry[];
  spriteMapLoaded: boolean;

  // Hair definitions (hair-definitions.json)
  hairDefinitions: HairDefinition[];
  hairDefsLoaded: boolean;
  /** Currently selected hair ID in the Hair tab */
  selectedHairId: number | null;

  // File System Access API: handles for saving back to source files
  sourceDir: FileSystemDirectoryHandle | null;
  /** Original file names keyed by role */
  sourceNames: { obj?: string; spr?: string; def?: string; spriteMap?: string };
  /** Per-file handles for save-back (files may be in different folders) */
  sourceHandles: {
    obj?: FileSystemFileHandle | null;
    spr?: FileSystemFileHandle | null;
    def?: FileSystemFileHandle | null;
    spriteMap?: FileSystemFileHandle | null;
  };

  // UI state
  centerTab: 'texture' | 'properties' | 'attributes' | 'server' | 'equipment' | 'hair';
  activeCategory: ThingCategory;
  selectedThingId: number | null;
  /** Multi-select set (Ctrl+click / Shift+click in ThingGrid) */
  selectedThingIds: Set<number>;
  searchQuery: string;
  /** Filter items by group (-1 = all) */
  filterGroup: number;
  /** Bumped on every edit to force re-render of dependent components */
  editVersion: number;
  /** Set by preview click to tell atlas to scroll to this sprite */
  focusSpriteId: number | null;
  /** Import tile grouping: 1=no grouping, 2=2×2 objects, 4=4×4 objects — pads atlas rows between groups for visual clarity */
  importTileSize: 1 | 2 | 4;
  /** Selected object sprite slots — shared between ObjectSlots and atlas for multi-select assignment */
  selectedSlots: { group: number; index: number }[];
  /** Clipboard for copy/paste of thing properties — each field is optional so partial copies work */
  copiedThing: {
    flags?: ThingFlags;
    frameGroups?: FrameGroup[];
    serverDef?: ServerItemData | null;
    /** Label describing what was copied, for UI display */
    label?: string;
  } | null;

  // Preview state (shared between SpritePreview and LayerPanel)
  activeLayer: number;
  blendLayers: boolean;
  currentFrame: number;
  playing: boolean;
  outfitColors: OutfitColorIndices;
  showColorPicker: keyof OutfitColorIndices | null;

  // Actions
  loadFiles: (objBuffer: ArrayBuffer, sprBuffer: ArrayBuffer) => Promise<void>;
  loadDefinitions: (json: Record<string, ServerItemData>) => void;
  setSourceDir: (dir: FileSystemDirectoryHandle, names: OBState['sourceNames']) => void;
  setSourceHandles: (handles: Partial<OBState['sourceHandles']>) => void;
  setCenterTab: (tab: OBState['centerTab']) => void;
  setActiveCategory: (cat: ThingCategory) => void;
  setSelectedThingId: (id: number | null) => void;
  toggleThingSelection: (id: number, range?: number[]) => void;
  clearThingSelection: () => void;
  setSearchQuery: (q: string) => void;
  setFilterGroup: (g: number) => void;
  reset: () => void;

  // Edit actions
  updateThingFlags: (id: number, flags: ThingFlags) => void;
  replaceSprite: (spriteId: number, imageData: ImageData) => void;
  addSprite: (imageData: ImageData) => number | null;
  deleteSprite: (spriteId: number) => void;
  deleteSprites: (spriteIds: number[]) => void;
  addThing: (cat: ThingCategory) => number | null;
  removeThing: (id: number) => void;
  importThing: (cat: ThingCategory, flags: ThingFlags, frameGroups: FrameGroup[], spritePixels: Map<number, ImageData>) => number | null;
  replaceThing: (targetId: number, flags: ThingFlags, frameGroups: FrameGroup[], spritePixels: Map<number, ImageData>) => boolean;
  undo: () => void;
  redo: () => void;
  markClean: () => void;

  // Server definitions actions
  updateItemDefinition: (itemId: number, data: Partial<ServerItemData>) => void;

  // Sprite atlas maintenance
  compactSpriteAtlas: () => { removed: number; oldCount: number; newCount: number } | null;

  // Equipment sprite mapping actions
  loadSpriteMap: (json: ItemToSpriteFile) => void;
  updateSpriteMapEntry: (index: number, entry: ItemToSpriteEntry) => void;
  addSpriteMapEntry: (entry: ItemToSpriteEntry) => void;
  removeSpriteMapEntry: (index: number) => void;
  exportSpriteMapJson: () => string;

  // Hair definition actions
  loadHairDefinitions: (json: HairDefinitionsFile) => void;
  addHairDefinition: (hair: HairDefinition) => void;
  updateHairDefinition: (hairId: number, data: Partial<HairDefinition>) => void;
  removeHairDefinition: (hairId: number) => void;
  duplicateHairDefinition: (hairId: number) => void;
  setSelectedHairId: (id: number | null) => void;
  exportHairDefinitionsJson: () => string;

  // Derived
  getCategoryRange: (cat: ThingCategory) => { start: number; end: number } | null;
}
