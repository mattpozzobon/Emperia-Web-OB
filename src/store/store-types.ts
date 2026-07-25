/**
 * Shared types for the OB Zustand store.
 */
import type { ObjectData, SpriteData, ThingType, ThingCategory, LibraryCategory, ThingFlags, FrameGroup, ItemDefinition, EquipmentCatalogEntry, HairDefinition } from '../lib/types';
import type { OutfitDefinition } from './outfit-slice';
import type { OutfitColorIndices } from '../lib/outfit-colors';

export interface UndoEntry {
  thingId: number;
  oldFlags: ThingFlags;
  newFlags: ThingFlags;
}

/** A group of imported sprites that form a logical multi-tile unit (e.g. 2×2 item). */
export interface SpriteGroup {
  /** Unique ID for this group */
  id: number;
  /** Label (e.g. filename) */
  label: string;
  /** Tile columns in the group */
  cols: number;
  /** Tile rows in the group */
  rows: number;
  /** Sprite IDs in row-major order: [row][col] flattened to spriteIds[row * cols + col] */
  spriteIds: number[];
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

  // Public item definitions (from items.json + EOBJ appearance mapping)
  /** Map of public itemId (JSON key) → item definition. */
  itemDefinitions: Map<number, ItemDefinition>;
  /** Map of appearanceId → primary public itemId for UI lookups. */
  appearanceToItemIds: Map<number, number>;
  definitionsLoaded: boolean;

  /** Currently selected hair ID in the Hair tab */
  selectedHairId: number | null;

  // Outfit definitions (outfit builder)
  outfitDefinitions: OutfitDefinition[];
  outfitDefsLoaded: boolean;
  /** Currently selected outfit index in the Outfit Builder tab */
  selectedOutfitIndex: number | null;

  // File System Access API: handles for saving back to source files
  sourceDir: FileSystemDirectoryHandle | null;
  /** Original file names keyed by role */
  sourceNames: { obj?: string; spr?: string; def?: string };
  /** Per-file handles for save-back (files may be in different folders) */
  sourceHandles: {
    obj?: FileSystemFileHandle | null;
    spr?: FileSystemFileHandle | null;
    def?: FileSystemFileHandle | null;
  };

  // UI state
  centerTab: 'texture' | 'properties' | 'equipment' | 'hair' | 'outfits';
  activeCategory: ThingCategory;
  activeLibrary: LibraryCategory;
  selectedThingId: number | null;
  /** Multi-select set (Ctrl+click / Shift+click in ThingGrid) */
  selectedThingIds: Set<number>;
  searchQuery: string;
  /** Filter items by group (-1 = all) */
  filterGroup: number;
  /** Number of columns shown in the left object library. */
  libraryColumns: number;
  /** Bumped on every edit to force re-render of dependent components */
  editVersion: number;
  /** Set by preview click to tell atlas to scroll to this sprite */
  focusSpriteId: number | null;
  /** Import tile grouping width (columns): 1=no grouping — pads atlas rows between groups for visual clarity */
  importTileWidth: number;
  /** Import tile grouping height (rows): 1=no grouping */
  importTileHeight: number;
  /** Imported sprite groups available for drag-and-drop onto the canvas */
  spriteGroups: SpriteGroup[];
  /** Auto-incrementing counter for sprite group IDs */
  nextSpriteGroupId: number;
  /** Sprite group currently being dragged onto the preview, if any */
  draggingSpriteGroupId: number | null;
  /** Selected object sprite slots — shared between ObjectSlots and atlas for multi-select assignment */
  selectedSlots: { group: number; index: number }[];
  /** Clipboard for copy/paste of thing properties — each field is optional so partial copies work */
  copiedThing: {
    flags?: ThingFlags;
    frameGroups?: FrameGroup[];
    itemDefinition?: ItemDefinition | null;
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
  loadDefinitions: (json: Record<string, Partial<ItemDefinition> & { id?: number }>) => void;
  setSourceDir: (dir: FileSystemDirectoryHandle, names: OBState['sourceNames']) => void;
  setSourceHandles: (handles: Partial<OBState['sourceHandles']>) => void;
  setCenterTab: (tab: OBState['centerTab']) => void;
  setActiveCategory: (cat: ThingCategory) => void;
  setActiveLibrary: (cat: LibraryCategory) => void;
  setSelectedThingId: (id: number | null) => void;
  toggleThingSelection: (id: number, range?: number[]) => void;
  clearThingSelection: () => void;
  setSearchQuery: (q: string) => void;
  setFilterGroup: (g: number) => void;
  setLibraryColumns: (columns: number) => void;
  reset: () => void;

  // Edit actions
  updateThingFlags: (id: number, flags: ThingFlags) => void;
  replaceSprite: (spriteId: number, imageData: ImageData) => void;
  addSprite: (imageData: ImageData) => number | null;
  deleteSprite: (spriteId: number) => void;
  deleteSprites: (spriteIds: number[]) => void;
  addThing: (cat: ThingCategory) => number | null;
  removeThing: (id: number) => void;
  clearThing: (id: number) => void;
  importThing: (cat: ThingCategory, flags: ThingFlags, frameGroups: FrameGroup[], spritePixels: Map<number, ImageData>) => number | null;
  replaceThing: (targetId: number, flags: ThingFlags, frameGroups: FrameGroup[], spritePixels: Map<number, ImageData>) => boolean;
  undo: () => void;
  redo: () => void;
  markClean: () => void;

  // Server definitions actions
  updateItemDefinition: (appearanceId: number, data: Partial<ItemDefinition>) => void;

  // Sprite atlas maintenance
  compactSpriteAtlas: () => { removed: number; deduplicated: number; blanked: number; oldCount: number; newCount: number } | null;

  // Sprite group actions
  addSpriteGroup: (label: string, cols: number, rows: number, spriteIds: number[]) => number;
  removeSpriteGroup: (id: number) => void;
  clearSpriteGroups: () => void;

  // Equipment appearances embedded directly in EOBJ
  updateEquipmentCatalogEntry: (previous: EquipmentCatalogEntry, entry: EquipmentCatalogEntry) => void;
  addEquipmentCatalogEntry: (entry: EquipmentCatalogEntry) => void;
  removeEquipmentCatalogEntry: (entry: EquipmentCatalogEntry) => void;
  assignVisualEquipmentToItem: (
    visualEquipmentId: number,
    itemId: number,
    variant: 'default' | 'left' | 'right',
  ) => void;

  // Hair definitions embedded directly in EOBJ
  addHairDefinition: (hair: HairDefinition) => void;
  updateHairDefinition: (hairId: number, data: Partial<HairDefinition>) => void;
  removeHairDefinition: (hairId: number) => void;
  duplicateHairDefinition: (hairId: number) => void;
  setSelectedHairId: (id: number | null) => void;

  // Outfit definition actions
  loadOutfitDefinitions: (json: Record<string, OutfitDefinition>) => void;
  addOutfitDefinition: (outfit: OutfitDefinition) => void;
  updateOutfitDefinition: (index: number, data: Partial<OutfitDefinition>) => void;
  removeOutfitDefinition: (index: number) => void;
  duplicateOutfitDefinition: (index: number) => void;
  setSelectedOutfitIndex: (index: number | null) => void;
  exportOutfitDefinitionsJson: () => string;

  // Derived
  getCategoryRange: (cat: ThingCategory) => { start: number; end: number } | null;
}
