/**
 * Equipment catalog editor.
 *
 * Shows all equipment appearances embedded in EOBJ, filtered by equipment slot,
 * with inline sprite previews. Allows assigning outfit sprites to items
 * and shows left/right hand variants side by side for weapons.
 */
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Search, Plus, Trash2, X, ChevronDown } from 'lucide-react';
import { useOBStore, getDisplayId } from '../store';
import { decodeSprite, getSpriteDataUrl } from '../lib/sprite-decoder';
import { applyOutfitMask } from '../lib/outfit-colors';
import type {
  EquipSlotFilter,
  EquipmentCatalogEntry,
  FrameGroup,
  ObjectData,
  SpriteData,
  VisualEquipmentAppearance,
} from '../lib/types';
import { getEquipmentCatalogEntries } from '../lib/equipment-catalog';

// ─── Constants ───────────────────────────────────────────────────────────────

const SLOT_FILTERS: { value: EquipSlotFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'head', label: 'Head' },
  { value: 'body', label: 'Body' },
  { value: 'legs', label: 'Legs' },
  { value: 'feet', label: 'Feet' },
  { value: 'left-hand', label: 'Left Hand' },
  { value: 'right-hand', label: 'Right Hand' },
  { value: 'backpack', label: 'Backpack' },
  { value: 'belt', label: 'Belt' },
];

/** Derive the slot category from server slotType (authoritative) or entry name (fallback). */
function inferSlot(entry: EquipmentCatalogEntry, slotType?: string): EquipSlotFilter | null {
  // Server slotType is authoritative when available
  if (slotType === 'head') return 'head';
  if (slotType === 'body') return 'body';
  if (slotType === 'legs') return 'legs';
  if (slotType === 'feet') return 'feet';
  if (slotType === 'backpack') return 'backpack';

  // Fall back to name-based inference
  const n = entry.name.toLowerCase();
  if (n.includes('left-hand') || n.includes('lefthand') || n.includes('left hand')) return 'left-hand';
  if (n.includes('right-hand') || n.includes('righthand') || n.includes('right hand')) return 'right-hand';
  // Check specific body-part keywords before ambiguous ones like 'crown'
  if (n.includes('armor') || n.includes('armour')) return 'body';
  if (n.includes(' legs') || n.includes(' leg')) return 'legs';
  if (n.includes('boots') || n.includes('boot') || n.includes('shoes')) return 'feet';
  if (n.includes('backpack') || n.includes('cape')) return 'backpack';
  if (n.includes('belt')) return 'belt';
  if (n.includes('helmet') || n.includes('hat') || n.includes('crown helmet')) return 'head';
  if (n.includes('shield') || n.includes('orb')) return 'right-hand';
  if (n.includes('bow') || n.includes('crossbow') || n.includes('sword') || n.includes('axe') || n.includes('club') || n.includes('wand')) return 'left-hand';
  return null;
}

// ─── Outfit Composite Rendering ──────────────────────────────────────────────

/** Index into a frame group's sprite array. */
function fgSpriteIndex(
  fg: FrameGroup,
  frame: number,
  px: number,
  py: number,
  pz: number,
  layer: number,
  tx: number,
  ty: number,
): number {
  return ((((((frame * fg.patternZ + pz) * fg.patternY + py) *
    fg.patternX + px) * fg.layers + layer) *
    fg.height + ty) *
    fg.width + tx);
}

/** Cache: key = `${internalId}:${direction}`, value = data URL. */
const outfitThumbCache = new Map<string, string>();

/** Clear the outfit thumbnail cache (call when edit version bumps). */
function clearOutfitThumbCache() { outfitThumbCache.clear(); }

/**
 * Crop transparent margins so small equipment sprites remain legible inside
 * fixed-size catalog thumbnails.
 */
function cropTransparentCanvas(source: HTMLCanvasElement, padding = 1): HTMLCanvasElement {
  const sourceContext = source.getContext('2d');
  if (!sourceContext) return source;

  const { width, height } = source;
  const pixels = sourceContext.getImageData(0, 0, width, height).data;
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] === 0) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }

  if (right < left || bottom < top) return source;

  left = Math.max(0, left - padding);
  top = Math.max(0, top - padding);
  right = Math.min(width - 1, right + padding);
  bottom = Math.min(height - 1, bottom + padding);

  const cropped = document.createElement('canvas');
  cropped.width = right - left + 1;
  cropped.height = bottom - top + 1;
  cropped.getContext('2d')?.drawImage(
    source,
    left,
    top,
    cropped.width,
    cropped.height,
    0,
    0,
    cropped.width,
    cropped.height,
  );
  return cropped;
}

/**
 * Composite-render an outfit thing into a data URL thumbnail.
 * Handles multi-tile (width × height), outfit mask (layer 0 + 1), and direction.
 * Returns null if the thing has no valid sprites.
 */
function renderOutfitThumb(
  objectData: ObjectData,
  spriteData: SpriteData,
  spriteOverrides: Map<number, ImageData>,
  internalId: number,
  direction: number = 2,
): string | null {
  const cacheKey = `${internalId}:${direction}`;
  const cached = outfitThumbCache.get(cacheKey);
  if (cached) return cached;

  const thing = objectData.things.get(internalId);
  if (!thing) return null;
  const fg = thing.frameGroups[0];
  if (!fg || fg.sprites.length === 0) return null;

  const cellW = fg.width * 32;
  const cellH = fg.height * 32;
  const canvas = document.createElement('canvas');
  canvas.width = cellW;
  canvas.height = cellH;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, cellW, cellH);

  const px = Math.min(direction, fg.patternX - 1);
  const hasOutfitMask = fg.layers >= 2;
  const defaultColors = { head: 0, body: 0, legs: 0, feet: 0 };

  for (let ty = 0; ty < fg.height; ty++) {
    for (let tx = 0; tx < fg.width; tx++) {
      const idx = fgSpriteIndex(fg, 0, px, 0, 0, 0, tx, ty);
      if (idx >= fg.sprites.length) continue;
      const sprId = fg.sprites[idx];
      if (sprId <= 0) continue;

      const rawData = spriteOverrides.get(sprId) ?? decodeSprite(spriteData, sprId);
      if (!rawData) continue;

      const imgData = new ImageData(new Uint8ClampedArray(rawData.data), 32, 32);

      if (hasOutfitMask) {
        const maskIdx = fgSpriteIndex(fg, 0, px, 0, 0, 1, tx, ty);
        if (maskIdx < fg.sprites.length) {
          const maskSprId = fg.sprites[maskIdx];
          if (maskSprId > 0) {
            const maskRaw = spriteOverrides.get(maskSprId) ?? decodeSprite(spriteData, maskSprId);
            if (maskRaw) {
              applyOutfitMask(imgData, maskRaw, defaultColors);
            }
          }
        }
      }

      const dx = (fg.width - 1 - tx) * 32;
      const dy = (fg.height - 1 - ty) * 32;
      // Use drawImage for alpha compositing when mask is applied (putImageData replaces pixels)
      if (hasOutfitMask) {
        const tmp = document.createElement('canvas');
        tmp.width = 32; tmp.height = 32;
        tmp.getContext('2d')!.putImageData(imgData, 0, 0);
        ctx.drawImage(tmp, dx, dy);
      } else {
        ctx.putImageData(imgData, dx, dy);
      }
    }
  }

  const url = cropTransparentCanvas(canvas).toDataURL();
  outfitThumbCache.set(cacheKey, url);
  return url;
}

/**
 * Convert a zero-based equipment appearance ID to the internal thing ID.
 */
function equipmentAppearanceIdToInternal(objectData: ObjectData, equipmentAppearanceId: number): number {
  return objectData.itemCount + objectData.outfitCount + 1 + equipmentAppearanceId;
}

// ─── Outfit Sprite Picker Modal ──────────────────────────────────────────────

function OutfitSpritePicker({
  onSelect,
  onClose,
}: {
  onSelect: (equipmentAppearanceId: number) => void;
  onClose: () => void;
}) {
  const objectData = useOBStore((s) => s.objectData);
  const spriteData = useOBStore((s) => s.spriteData);
  const spriteOverrides = useOBStore((s) => s.spriteOverrides);
  const getCategoryRange = useOBStore((s) => s.getCategoryRange);
  const [search, setSearch] = useState('');
  const [direction, setDirection] = useState(2); // 0=N,1=E,2=S,3=W
  const containerRef = useRef<HTMLDivElement>(null);

  const outfitRange = getCategoryRange('equipment');

  const outfits = useMemo(() => {
    if (!objectData || !outfitRange) return [];
    const q = search.trim().toLowerCase();
    const result: { id: number; displayId: number }[] = [];
    for (let id = outfitRange.start; id <= outfitRange.end; id++) {
      const thing = objectData.things.get(id);
      if (!thing) continue;
      const displayId = getDisplayId(objectData, id);
      if (q && !displayId.toString().includes(q)) continue;
      result.push({ id, displayId });
    }
    return result;
  }, [objectData, outfitRange, search]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div ref={containerRef} className="bg-emperia-surface border border-emperia-border rounded-lg shadow-2xl w-[520px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-emperia-border shrink-0">
          <h3 className="text-sm font-semibold text-emperia-text flex-1">Select Equipment Appearance</h3>
          <div className="flex items-center gap-1 text-[10px] text-emperia-muted">
            {['N', 'E', 'S', 'W'].map((d, i) => (
              <button
                key={d}
                onClick={() => setDirection(i)}
                className={`px-1.5 py-0.5 rounded ${direction === i ? 'bg-emperia-accent/30 text-emperia-accent' : 'hover:bg-emperia-hover'}`}
              >
                {d}
              </button>
            ))}
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-emperia-hover text-emperia-muted hover:text-emperia-text">
            <X className="w-4 h-4" />
          </button>
        </div>
        {/* Search */}
        <div className="px-3 py-1.5 border-b border-emperia-border shrink-0">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-emperia-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search equipment ID..."
              className="w-full pl-7 pr-2 py-1 bg-emperia-bg border border-emperia-border rounded text-xs text-emperia-text"
              autoFocus
            />
          </div>
        </div>
        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-2">
          <div className="grid grid-cols-8 gap-1">
            {outfits.map(({ id, displayId }) => {
              if (!objectData || !spriteData) return null;
              const url = renderOutfitThumb(objectData, spriteData, spriteOverrides, id, direction);

              return (
                <button
                  key={id}
                  onClick={() => onSelect(displayId)}
                  className="flex flex-col items-center gap-0.5 p-1 rounded hover:bg-emperia-hover border border-transparent hover:border-emperia-accent/40 transition-colors"
                  title={`Equipment #${displayId}`}
                >
                  <div className="w-10 h-10 checkerboard rounded flex items-center justify-center overflow-hidden">
                    {url ? (
                      <img src={url} alt="" className="pixelated max-w-full max-h-full" style={{ imageRendering: 'pixelated' }} draggable={false} />
                    ) : (
                      <div className="w-10 h-10 bg-emperia-bg/50 rounded" />
                    )}
                  </div>
                  <span className="text-[9px] text-emperia-muted">{displayId}</span>
                </button>
              );
            })}
          </div>
          {outfits.length === 0 && (
            <p className="text-center text-emperia-muted text-xs py-8">No equipment appearances found.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Outfit Thumbnail Component ─────────────────────────────────────────────

/**
 * Renders a composite outfit thumbnail for an EOBJ equipment outfit ID.
 * Handles multi-tile outfits with outfit mask coloring.
 */
function OutfitThumbnail({ equipmentAppearanceId, size = 32, direction = 2 }: { equipmentAppearanceId: number; size?: number; direction?: number }) {
  const objectData = useOBStore((s) => s.objectData);
  const spriteData = useOBStore((s) => s.spriteData);
  const spriteOverrides = useOBStore((s) => s.spriteOverrides);
  const editVersion = useOBStore((s) => s.editVersion);

  // Clear cache when edits happen
  useEffect(() => { clearOutfitThumbCache(); }, [editVersion]);

  if (!objectData || !spriteData || equipmentAppearanceId < 0) {
    return (
      <div
        className="checkerboard rounded border border-emperia-border/50 flex items-center justify-center text-emperia-muted/30 text-[9px]"
        style={{ width: size, height: size }}
      >
        —
      </div>
    );
  }

  const internalId = equipmentAppearanceIdToInternal(objectData, equipmentAppearanceId);
  const url = renderOutfitThumb(objectData, spriteData, spriteOverrides, internalId, direction);

  return (
    <div className="checkerboard rounded border border-emperia-border/50 overflow-hidden flex items-center justify-center" style={{ width: size, height: size }}>
      {url ? (
        <img src={url} alt={`equipment#${equipmentAppearanceId}`} className="pixelated max-w-full max-h-full" style={{ imageRendering: 'pixelated' }} draggable={false} />
      ) : (
        <div className="flex items-center justify-center text-emperia-muted/30 text-[9px]" style={{ width: size, height: size }}>?</div>
      )}
    </div>
  );
}

// ─── Item Thumbnail Component ────────────────────────────────────────────────

/**
 * Renders the base sprite for a public item ID.
 * Resolves item ID → appearance ID, then looks up the ThingType.
 */
function ItemThumbnail({ itemId, size = 28 }: { itemId: number; size?: number }) {
  const objectData = useOBStore((s) => s.objectData);
  const spriteData = useOBStore((s) => s.spriteData);
  const spriteOverrides = useOBStore((s) => s.spriteOverrides);
  useOBStore((s) => s.editVersion);

  if (!objectData || !spriteData || itemId <= 0) {
    return (
      <div
        className="checkerboard rounded border border-emperia-border/50 flex items-center justify-center text-emperia-muted/30 text-[9px]"
        style={{ width: size, height: size }}
      >
        —
      </div>
    );
  }

  // Resolve the public item ID to its internal EOBJ appearance.
  const appearanceId = objectData.itemAppearances.get(itemId);
  const thing = appearanceId == null ? undefined : objectData.things.get(appearanceId);
  const sprId = thing?.frameGroups[0]?.sprites[0] ?? 0;
  const url = sprId > 0 ? getSpriteDataUrl(spriteData, sprId, spriteOverrides) : null;

  const handleClick = () => {
    if (!thing) return;
    const { setCenterTab, setSelectedThingId } = useOBStore.getState();
    // Switch to item category if not already
    if (useOBStore.getState().activeCategory !== 'item') {
      useOBStore.setState({ activeCategory: 'item', activeLibrary: 'item', searchQuery: '', filterGroup: -1 });
    }
    setSelectedThingId(appearanceId!);
    setCenterTab('texture');
  };

  return (
    <button
      onClick={handleClick}
      className="checkerboard rounded border border-emperia-border/50 overflow-hidden flex items-center justify-center hover:border-emperia-accent/60 transition-colors cursor-pointer shrink-0"
      style={{ width: size, height: size }}
      title={appearanceId == null ? `Item #${itemId} has no appearance mapping` : `Go to item #${itemId} (appearance #${appearanceId})`}
    >
      {url ? (
        <img src={url} alt={`item#${itemId}`} className="pixelated" style={{ width: size, height: size, imageRendering: 'pixelated' }} draggable={false} />
      ) : (
        <div className="flex items-center justify-center text-emperia-muted/30 text-[9px]" style={{ width: size, height: size }}>?</div>
      )}
    </button>
  );
}

// ─── Add Entry Form ──────────────────────────────────────────────────────────

function AddEntryForm({ onAdd, onCancel }: { onAdd: (entry: EquipmentCatalogEntry) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [itemId, setItemId] = useState('');
  const [equipmentAppearanceId, setEquipmentAppearanceId] = useState('');
  const [showPicker, setShowPicker] = useState(false);

  const handleSubmit = () => {
    const parsedItemId = parseInt(itemId, 10);
    const parsedEquipmentAppearanceId = parseInt(equipmentAppearanceId, 10);
    if (!name.trim() || isNaN(parsedItemId) || isNaN(parsedEquipmentAppearanceId)) return;
    onAdd({ name: name.trim(), itemId: parsedItemId, equipmentAppearanceId: parsedEquipmentAppearanceId });
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-emperia-accent/5 border-t border-emperia-border">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name (e.g. Left-Hand (katana))"
        className="flex-1 bg-emperia-bg border border-emperia-border rounded px-2 py-1 text-xs text-emperia-text min-w-0"
      />
      <input
        type="number"
        value={itemId}
        onChange={(e) => setItemId(e.target.value)}
        placeholder="Item ID"
        className="w-20 bg-emperia-bg border border-emperia-border rounded px-2 py-1 text-xs text-emperia-text"
      />
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={equipmentAppearanceId}
          onChange={(e) => setEquipmentAppearanceId(e.target.value)}
          placeholder="Equipment ID"
          className="w-20 bg-emperia-bg border border-emperia-border rounded px-2 py-1 text-xs text-emperia-text"
        />
        <button
          onClick={() => setShowPicker(true)}
          className="p-1 rounded hover:bg-emperia-hover text-emperia-muted hover:text-emperia-accent text-[10px] border border-emperia-border"
          title="Pick from outfit sprites"
        >
          Pick
        </button>
      </div>
      <button
        onClick={handleSubmit}
        className="px-2 py-1 rounded bg-emperia-accent/20 text-emperia-accent text-xs font-medium hover:bg-emperia-accent/30"
      >
        Add
      </button>
      <button onClick={onCancel} className="p-1 rounded hover:bg-emperia-hover text-emperia-muted">
        <X className="w-3.5 h-3.5" />
      </button>
      {showPicker && (
        <OutfitSpritePicker
          onSelect={(displayId) => { setEquipmentAppearanceId(displayId.toString()); setShowPicker(false); }}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}

// ─── Entry Row ───────────────────────────────────────────────────────────────

type EquipmentVariant = 'default' | 'left' | 'right';

function UnassignedEquipmentRow({
  equipmentAppearanceId,
  onAssign,
}: {
  equipmentAppearanceId: number;
  onAssign: (equipmentAppearanceId: number, itemId: number, variant: EquipmentVariant, name: string) => void;
}) {
  const itemDefinitions = useOBStore((s) => s.itemDefinitions);
  const [itemIdValue, setItemIdValue] = useState('');
  const [variant, setVariant] = useState<EquipmentVariant>('default');
  const [name, setName] = useState('');

  const itemId = Number.parseInt(itemIdValue, 10);
  const itemDefinition = Number.isNaN(itemId) ? undefined : itemDefinitions.get(itemId);
  const itemName = itemDefinition?.properties?.name;
  const canAssign = itemDefinition != null;

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-amber-400/20 bg-amber-400/5">
      <OutfitThumbnail equipmentAppearanceId={equipmentAppearanceId} size={40} />

      <div className="w-20 shrink-0">
        <span className="block text-[9px] uppercase tracking-wide text-amber-300/70">Unassigned</span>
        <span className="text-[11px] text-cyan-400 font-mono" title="Equipment appearance ID">
          #{equipmentAppearanceId}
        </span>
      </div>

      <input
        type="number"
        min={1}
        value={itemIdValue}
        onChange={(event) => setItemIdValue(event.target.value)}
        placeholder="Item ID"
        className={`w-24 bg-emperia-bg border rounded px-2 py-1 text-xs text-emperia-text ${
          itemIdValue && !canAssign ? 'border-red-400/60' : 'border-emperia-border'
        }`}
        title={itemIdValue && !canAssign ? 'This item ID does not exist in the loaded definitions.' : 'Public item ID'}
      />

      <select
        value={variant}
        onChange={(event) => setVariant(event.target.value as EquipmentVariant)}
        className="bg-emperia-bg border border-emperia-border rounded px-2 py-1 text-xs text-emperia-text"
        title="Equipment variant"
      >
        <option value="default">Default</option>
        <option value="left">Left hand</option>
        <option value="right">Right hand</option>
      </select>

      <div className="flex-1 min-w-0">
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={itemName ? `Name (currently ${itemName})` : 'Optional item name'}
          className="w-full bg-emperia-bg border border-emperia-border rounded px-2 py-1 text-xs text-emperia-text"
          title="Optional: also updates the item name in items.json"
        />
        {itemIdValue && !canAssign && (
          <span className="block mt-0.5 text-[9px] text-red-400">Item ID not found.</span>
        )}
      </div>

      <button
        type="button"
        disabled={!canAssign}
        onClick={() => onAssign(equipmentAppearanceId, itemId, variant, name)}
        className="px-2.5 py-1 rounded text-xs font-medium bg-amber-400/15 text-amber-300 hover:bg-amber-400/25 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        Assign
      </button>
    </div>
  );
}

function VisualEquipmentRow({
  entry,
  onAssign,
}: {
  entry: VisualEquipmentAppearance;
  onAssign: (visualEquipmentId: number, itemId: number, variant: EquipmentVariant) => void;
}) {
  const itemDefinitions = useOBStore((s) => s.itemDefinitions);
  const objectData = useOBStore((s) => s.objectData);
  const [expanded, setExpanded] = useState(false);
  const [itemIdValue, setItemIdValue] = useState('');
  const [variant, setVariant] = useState<EquipmentVariant>('default');

  const itemId = Number.parseInt(itemIdValue, 10);
  const itemDefinition = Number.isNaN(itemId) ? undefined : itemDefinitions.get(itemId);
  const existingVariant = itemDefinition
    ? objectData?.equipmentAppearances.get(itemId)?.[variant]
    : undefined;
  const canAssign = itemDefinition != null;

  return (
    <div className="border-b border-emperia-border/30 bg-violet-500/5">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-violet-400/5"
        aria-expanded={expanded}
      >
        <div className="w-10 h-10 checkerboard rounded border border-violet-400/30 flex items-center justify-center text-[9px] text-violet-300">
          visual
        </div>
        <OutfitThumbnail equipmentAppearanceId={entry.equipmentAppearanceId} size={40} />
        <div className="flex-1 min-w-0">
          <span className="text-xs text-emperia-text truncate block">{entry.name}</span>
          <span className="text-[9px] text-emperia-muted">
            {expanded ? 'Choose an item to convert this visual equipment' : 'Click to assign an item'}
          </span>
        </div>
        <span className="text-[10px] text-violet-300 font-mono" title="Stable visual ID">
          {entry.visualEquipmentId}
        </span>
        <span className="text-[10px] text-cyan-400 font-mono w-12 text-right" title="Equipment appearance ID">
          {entry.equipmentAppearanceId}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-emperia-muted transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="flex items-start gap-2 px-14 pb-2">
          <div>
            <input
              type="number"
              min={1}
              value={itemIdValue}
              onChange={(event) => setItemIdValue(event.target.value)}
              placeholder="Item ID"
              className={`w-28 bg-emperia-bg border rounded px-2 py-1 text-xs text-emperia-text ${
                itemIdValue && !canAssign ? 'border-red-400/60' : 'border-emperia-border'
              }`}
              autoFocus
            />
            {itemIdValue && !canAssign && (
              <span className="block mt-0.5 text-[9px] text-red-400">Item ID not found.</span>
            )}
          </div>
          <select
            value={variant}
            onChange={(event) => setVariant(event.target.value as EquipmentVariant)}
            className="bg-emperia-bg border border-emperia-border rounded px-2 py-1 text-xs text-emperia-text"
          >
            <option value="default">Default</option>
            <option value="left">Left hand</option>
            <option value="right">Right hand</option>
          </select>
          <div className="flex-1 min-w-0 pt-1">
            {itemDefinition && (
              <span className="block text-[10px] text-emperia-muted truncate">
                {itemDefinition.properties?.name || `Item ${itemId}`}
              </span>
            )}
            {existingVariant != null && (
              <span className="block text-[9px] text-amber-300">
                This replaces appearance #{existingVariant} for the selected variant.
              </span>
            )}
          </div>
          <button
            type="button"
            disabled={!canAssign}
            onClick={() => onAssign(entry.visualEquipmentId, itemId, variant)}
            className="px-2.5 py-1 rounded text-xs font-medium bg-violet-400/15 text-violet-300 hover:bg-violet-400/25 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Assign item
          </button>
        </div>
      )}
    </div>
  );
}

function EntryRow({
  entry,
  index,
  onUpdate,
  onRemove,
}: {
  entry: EquipmentCatalogEntry;
  index: number;
  onUpdate: (index: number, entry: EquipmentCatalogEntry) => void;
  onRemove: (index: number) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(entry.name);
  const [editingItemId, setEditingItemId] = useState(false);
  const [itemIdValue, setItemIdValue] = useState(entry.itemId.toString());

  const itemDefinitions = useOBStore((s) => s.itemDefinitions);

  // Look up the public item definition.
  const def = itemDefinitions.get(entry.itemId);
  const serverName = def?.properties?.name;

  const handleNameBlur = () => {
    setEditingName(false);
    if (nameValue.trim() !== entry.name) {
      onUpdate(index, { ...entry, name: nameValue.trim() });
    }
  };

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 hover:bg-emperia-hover/50 group border-b border-emperia-border/30">
      {/* Item + Outfit sprite preview */}
      <ItemThumbnail itemId={entry.itemId} size={40} />
      <OutfitThumbnail equipmentAppearanceId={entry.equipmentAppearanceId} size={40} />

      {/* Name */}
      <div className="flex-1 min-w-0">
        {editingName ? (
          <input
            type="text"
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={handleNameBlur}
            onKeyDown={(e) => { if (e.key === 'Enter') handleNameBlur(); }}
            className="w-full bg-emperia-bg border border-emperia-border rounded px-1.5 py-0.5 text-xs text-emperia-text"
            autoFocus
          />
        ) : (
          <button
            onClick={() => { setEditingName(true); setNameValue(entry.name); }}
            className="text-xs text-emperia-text truncate block text-left w-full hover:underline"
            title={entry.name}
          >
            {entry.name}
          </button>
        )}
        {serverName && (
          <span className="text-[9px] text-emperia-muted/60 truncate block">{serverName}</span>
        )}
      </div>

      {/* Item ID */}
      {editingItemId ? (
        <input
          type="number"
          value={itemIdValue}
          onChange={(e) => setItemIdValue(e.target.value)}
          onBlur={() => {
            setEditingItemId(false);
            const parsed = parseInt(itemIdValue, 10);
            if (!isNaN(parsed) && parsed !== entry.itemId) {
              onUpdate(index, { ...entry, itemId: parsed });
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') { setEditingItemId(false); setItemIdValue(entry.itemId.toString()); }
          }}
          className="w-16 bg-emperia-bg border border-emperia-border rounded px-1.5 py-0.5 text-[10px] text-amber-400 font-mono text-right shrink-0"
          autoFocus
        />
      ) : (
        <button
          onClick={() => { setEditingItemId(true); setItemIdValue(entry.itemId.toString()); }}
          className="text-[10px] text-amber-400 font-mono w-12 text-right shrink-0 hover:underline cursor-pointer"
          title="Click to change Item ID"
        >
          {entry.itemId}
        </button>
      )}

      {/* Sprite ID + change button */}
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-[10px] text-cyan-400 font-mono w-12 text-right" title="Outfit Sprite ID">
          {entry.equipmentAppearanceId}
        </span>
        <button
          onClick={() => setShowPicker(true)}
          className="px-1.5 py-0.5 rounded text-[10px] bg-emperia-accent/10 text-emperia-accent hover:bg-emperia-accent/20 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          Change
        </button>
      </div>

      {/* Delete */}
      <button
        onClick={() => onRemove(index)}
        className="p-0.5 rounded text-red-400/40 hover:text-red-400 hover:bg-red-400/10 opacity-0 group-hover:opacity-100 transition-opacity"
        title="Remove entry"
      >
        <Trash2 className="w-3 h-3" />
      </button>

      {showPicker && (
        <OutfitSpritePicker
          onSelect={(displayId) => {
            onUpdate(index, { ...entry, equipmentAppearanceId: displayId });
            setShowPicker(false);
          }}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}

// ─── Grouped Weapon View ─────────────────────────────────────────────────────

interface WeaponGroup {
  itemId: number;
  baseName: string;
  leftEntry: { entry: EquipmentCatalogEntry; index: number } | null;
  rightEntry: { entry: EquipmentCatalogEntry; index: number } | null;
  otherEntries: { entry: EquipmentCatalogEntry; index: number }[];
}

function WeaponGroupRow({
  group,
  onUpdate,
  onRemove,
}: {
  group: WeaponGroup;
  onUpdate: (index: number, entry: EquipmentCatalogEntry) => void;
  onRemove: (index: number) => void;
}) {
  const [showPickerFor, setShowPickerFor] = useState<'left' | 'right' | null>(null);

  const itemDefinitions = useOBStore((s) => s.itemDefinitions);
  const def = itemDefinitions.get(group.itemId);
  const serverName = def?.properties?.name;

  return (
    <div className="px-3 py-2 hover:bg-emperia-hover/50 border-b border-emperia-border/30 group">
      <div className="flex items-center gap-2 mb-1.5">
        <ItemThumbnail itemId={group.itemId} size={32} />
        <span className="text-xs text-emperia-text font-medium truncate flex-1">{group.baseName}</span>
        {serverName && <span className="text-[9px] text-emperia-muted/60">{serverName}</span>}
        <span className="text-[10px] text-amber-400 font-mono" title="Item ID">{group.itemId}</span>
      </div>
      <div className="flex items-center gap-4 pl-2">
        {/* Left hand */}
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] text-emperia-muted w-8">Left</span>
          {group.leftEntry ? (
            <>
              <OutfitThumbnail equipmentAppearanceId={group.leftEntry.entry.equipmentAppearanceId} size={36} />
              <span className="text-[10px] text-cyan-400 font-mono">{group.leftEntry.entry.equipmentAppearanceId}</span>
              <button
                onClick={() => setShowPickerFor('left')}
                className="px-1 py-0.5 rounded text-[9px] bg-emperia-accent/10 text-emperia-accent hover:bg-emperia-accent/20 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                Change
              </button>
              <button
                onClick={() => onRemove(group.leftEntry!.index)}
                className="p-0.5 rounded text-red-400/40 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 className="w-2.5 h-2.5" />
              </button>
            </>
          ) : (
            <button
              onClick={() => setShowPickerFor('left')}
              className="text-[9px] text-emperia-muted/50 hover:text-emperia-accent underline"
            >
              Assign
            </button>
          )}
        </div>

        <div className="w-px h-6 bg-emperia-border/40" />

        {/* Right hand */}
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] text-emperia-muted w-8">Right</span>
          {group.rightEntry ? (
            <>
              <OutfitThumbnail equipmentAppearanceId={group.rightEntry.entry.equipmentAppearanceId} size={36} />
              <span className="text-[10px] text-cyan-400 font-mono">{group.rightEntry.entry.equipmentAppearanceId}</span>
              <button
                onClick={() => setShowPickerFor('right')}
                className="px-1 py-0.5 rounded text-[9px] bg-emperia-accent/10 text-emperia-accent hover:bg-emperia-accent/20 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                Change
              </button>
              <button
                onClick={() => onRemove(group.rightEntry!.index)}
                className="p-0.5 rounded text-red-400/40 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 className="w-2.5 h-2.5" />
              </button>
            </>
          ) : (
            <button
              onClick={() => setShowPickerFor('right')}
              className="text-[9px] text-emperia-muted/50 hover:text-emperia-accent underline"
            >
              Assign
            </button>
          )}
        </div>
      </div>

      {/* Other entries that aren't left/right */}
      {group.otherEntries.map(({ entry, index }) => (
        <div key={index} className="flex items-center gap-2 pl-2 mt-1">
          <span className="text-[9px] text-emperia-muted w-8 truncate">{entry.name}</span>
          <OutfitThumbnail equipmentAppearanceId={entry.equipmentAppearanceId} size={32} />
          <span className="text-[10px] text-cyan-400 font-mono">{entry.equipmentAppearanceId}</span>
        </div>
      ))}

      {showPickerFor && (
        <OutfitSpritePicker
          onSelect={(displayId) => {
            const addCatalogEntry = useOBStore.getState().addEquipmentCatalogEntry;
            const updateCatalogEntry = useOBStore.getState().updateEquipmentCatalogEntry;
            const hand = showPickerFor === 'left' ? 'Left-Hand' : 'Right-Hand';
            if (showPickerFor === 'left' && group.leftEntry) {
              updateCatalogEntry(group.leftEntry.entry, { ...group.leftEntry.entry, equipmentAppearanceId: displayId });
            } else if (showPickerFor === 'right' && group.rightEntry) {
              updateCatalogEntry(group.rightEntry.entry, { ...group.rightEntry.entry, equipmentAppearanceId: displayId });
            } else {
              addCatalogEntry({ name: `${hand} (${group.baseName})`, itemId: group.itemId, equipmentAppearanceId: displayId });
            }
            setShowPickerFor(null);
          }}
          onClose={() => setShowPickerFor(null)}
        />
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function EquipmentCatalogEditor() {
  const objectData = useOBStore((s) => s.objectData);
  const itemDefinitions = useOBStore((s) => s.itemDefinitions);
  const updateItemDefinition = useOBStore((s) => s.updateItemDefinition);
  const updateEquipmentCatalogEntry = useOBStore((s) => s.updateEquipmentCatalogEntry);
  const addEquipmentCatalogEntry = useOBStore((s) => s.addEquipmentCatalogEntry);
  const removeEquipmentCatalogEntry = useOBStore((s) => s.removeEquipmentCatalogEntry);
  const assignVisualEquipmentToItem = useOBStore((s) => s.assignVisualEquipmentToItem);
  const editVersion = useOBStore((s) => s.editVersion);
  const catalogEntries = useMemo(
    () => getEquipmentCatalogEntries(objectData),
    [objectData, editVersion],
  );
  const visualEntries = useMemo(
    () => Array.from(objectData?.visualEquipmentAppearances.values() ?? [])
      .sort((a, b) => a.visualEquipmentId - b.visualEquipmentId),
    [objectData, editVersion],
  );
  const unassignedAppearanceIds = useMemo(() => {
    if (!objectData) return [];

    const assigned = new Set<number>();
    for (const appearance of objectData.equipmentAppearances.values()) {
      if (appearance.default != null) assigned.add(appearance.default);
      if (appearance.left != null) assigned.add(appearance.left);
      if (appearance.right != null) assigned.add(appearance.right);
    }
    for (const appearance of objectData.visualEquipmentAppearances.values()) {
      assigned.add(appearance.equipmentAppearanceId);
    }

    const unassigned: number[] = [];
    for (let appearanceId = 0; appearanceId < objectData.equipmentCount; appearanceId++) {
      if (assigned.has(appearanceId)) continue;
      const internalId = equipmentAppearanceIdToInternal(objectData, appearanceId);
      const thing = objectData.things.get(internalId);
      const hasSpriteReference = thing?.frameGroups.some((group) => (
        group.sprites.some((spriteId) => spriteId > 0)
      )) ?? false;
      if (hasSpriteReference) unassigned.push(appearanceId);
    }
    return unassigned;
  }, [objectData, editVersion]);
  const updateCatalogEntry = useCallback((index: number, entry: EquipmentCatalogEntry) => {
    const previous = catalogEntries[index];
    if (previous) updateEquipmentCatalogEntry(previous, entry);
  }, [catalogEntries, updateEquipmentCatalogEntry]);
  const removeCatalogEntry = useCallback((index: number) => {
    const entry = catalogEntries[index];
    if (entry) removeEquipmentCatalogEntry(entry);
  }, [catalogEntries, removeEquipmentCatalogEntry]);
  const assignAppearance = useCallback((
    equipmentAppearanceId: number,
    itemId: number,
    variant: EquipmentVariant,
    name: string,
  ) => {
    const definition = itemDefinitions.get(itemId);
    if (!definition) return;

    const trimmedName = name.trim();
    const baseName = trimmedName || definition.properties?.name || `item ${itemId}`;
    const entryName = variant === 'left'
      ? `${baseName} left-hand`
      : variant === 'right'
        ? `${baseName} right-hand`
        : baseName;

    addEquipmentCatalogEntry({ name: entryName, itemId, equipmentAppearanceId });

    if (trimmedName) {
      updateItemDefinition(definition.appearanceId, {
        properties: {
          ...(definition.properties ?? {}),
          name: trimmedName,
        },
      });
    }
  }, [addEquipmentCatalogEntry, itemDefinitions, updateItemDefinition]);

  const [slotFilter, setSlotFilter] = useState<EquipSlotFilter>('all');
  const [search, setSearch] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [catalogSection, setCatalogSection] = useState<'assigned' | 'visual'>('assigned');
  const [viewMode, setViewMode] = useState<'list' | 'weapons'>('list');

  // Get slot type from public item definitions for each entry.
  const getSlotType = useCallback((itemId: number): string | undefined => {
    return itemDefinitions.get(itemId)?.properties?.slotType;
  }, [itemDefinitions]);

  // Filter entries
  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalogEntries
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => {
        // Slot filter
        if (slotFilter !== 'all') {
          const slot = inferSlot(entry, getSlotType(entry.itemId));
          if (slot !== slotFilter) return false;
        }
        // Search filter
        if (q) {
          const nameMatch = entry.name.toLowerCase().includes(q);
          const idMatch = entry.itemId.toString().includes(q);
          const spriteMatch = entry.equipmentAppearanceId.toString().includes(q);
          if (!nameMatch && !idMatch && !spriteMatch) return false;
        }
        return true;
      });
  }, [catalogEntries, slotFilter, search, getSlotType]);
  const filteredVisualEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return visualEntries;
    return visualEntries.filter((entry) => (
      entry.name.toLowerCase().includes(q)
      || entry.visualEquipmentId.toString().includes(q)
      || entry.equipmentAppearanceId.toString().includes(q)
    ));
  }, [search, visualEntries]);
  const filteredUnassignedAppearanceIds = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return unassignedAppearanceIds;
    return unassignedAppearanceIds.filter((appearanceId) => (
      appearanceId.toString().includes(q) || 'unassigned'.includes(q)
    ));
  }, [search, unassignedAppearanceIds]);

  // Group weapons by item ID for the weapon view
  const weaponGroups = useMemo((): WeaponGroup[] => {
    if (viewMode !== 'weapons') return [];
    const groups = new Map<number, WeaponGroup>();

    for (const { entry, index } of filteredEntries) {
      const n = entry.name.toLowerCase();
      const isLeft = n.includes('left-hand') || n.includes('lefthand') || n.includes('left hand');
      const isRight = n.includes('right-hand') || n.includes('righthand') || n.includes('right hand');

      if (!isLeft && !isRight) continue;

      if (!groups.has(entry.itemId)) {
        // Derive base name from the entry name
        let baseName = entry.name
          .replace(/left-hand|lefthand|left hand|right-hand|righthand|right hand/gi, '')
          .replace(/\(|\)/g, '')
          .trim();
        if (!baseName) baseName = `Item ${entry.itemId}`;
        groups.set(entry.itemId, { itemId: entry.itemId, baseName, leftEntry: null, rightEntry: null, otherEntries: [] });
      }

      const g = groups.get(entry.itemId)!;
      if (isLeft && !g.leftEntry) g.leftEntry = { entry, index };
      else if (isRight && !g.rightEntry) g.rightEntry = { entry, index };
      else g.otherEntries.push({ entry, index });
    }

    return Array.from(groups.values());
  }, [filteredEntries, viewMode]);

  if (!objectData) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-emperia-muted text-sm p-8 gap-3">
        <p>No equipment catalog loaded.</p>
        <p className="text-[10px] text-emperia-muted/50">
          Open an EOBJ v6 file containing the equipment catalog.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-emperia-border shrink-0">
        <div className="flex items-center gap-0.5 border border-emperia-border rounded overflow-hidden">
          <button
            type="button"
            onClick={() => setCatalogSection('assigned')}
            className={`px-2 py-1 text-[10px] ${
              catalogSection === 'assigned'
                ? 'bg-emperia-accent/20 text-emperia-accent'
                : 'text-emperia-muted hover:text-emperia-text'
            }`}
          >
            Item-linked
          </button>
          <button
            type="button"
            onClick={() => setCatalogSection('visual')}
            className={`px-2 py-1 text-[10px] ${
              catalogSection === 'visual'
                ? 'bg-violet-400/20 text-violet-300'
                : 'text-emperia-muted hover:text-emperia-text'
            }`}
          >
            Visual
          </button>
        </div>

        {/* Slot filter dropdown */}
        {catalogSection === 'assigned' && <div className="relative">
          <select
            value={slotFilter}
            onChange={(e) => setSlotFilter(e.target.value as EquipSlotFilter)}
            className="appearance-none bg-emperia-bg border border-emperia-border rounded pl-2 pr-6 py-1 text-xs text-emperia-text cursor-pointer"
          >
            {SLOT_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-emperia-muted pointer-events-none" />
        </div>}

        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-emperia-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, item ID, or sprite ID..."
            className="w-full pl-7 pr-2 py-1 bg-emperia-bg border border-emperia-border rounded text-xs text-emperia-text"
          />
        </div>

        {/* View mode toggle */}
        {catalogSection === 'assigned' && <div className="flex items-center gap-0.5 border border-emperia-border rounded overflow-hidden">
          <button
            onClick={() => setViewMode('list')}
            className={`px-2 py-1 text-[10px] ${viewMode === 'list' ? 'bg-emperia-accent/20 text-emperia-accent' : 'text-emperia-muted hover:text-emperia-text'}`}
          >
            List
          </button>
          <button
            onClick={() => setViewMode('weapons')}
            className={`px-2 py-1 text-[10px] ${viewMode === 'weapons' ? 'bg-emperia-accent/20 text-emperia-accent' : 'text-emperia-muted hover:text-emperia-text'}`}
          >
            Weapons
          </button>
        </div>}

        {/* Add button */}
        {catalogSection === 'assigned' && <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-emperia-accent/10 text-emperia-accent hover:bg-emperia-accent/20"
        >
          <Plus className="w-3 h-3" />
          Add
        </button>}

        {/* Count */}
        <span className="text-[10px] text-emperia-muted shrink-0">
          {catalogSection === 'visual'
            ? `${filteredVisualEntries.length} / ${visualEntries.length}`
            : `${filteredEntries.length + filteredUnassignedAppearanceIds.length} / ${
              catalogEntries.length + unassignedAppearanceIds.length
            }`}
        </span>
      </div>

      {/* Add form */}
      {catalogSection === 'assigned' && showAddForm && (
        <AddEntryForm
          onAdd={(entry) => { addEquipmentCatalogEntry(entry); setShowAddForm(false); }}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {catalogSection === 'visual' ? (
          filteredVisualEntries.length === 0 ? (
            <p className="text-center text-emperia-muted text-xs py-8">
              No visual equipment matches the current filter.
            </p>
          ) : (
            filteredVisualEntries.map((entry) => (
              <VisualEquipmentRow
                key={entry.visualEquipmentId}
                entry={entry}
                onAssign={assignVisualEquipmentToItem}
              />
            ))
          )
        ) : viewMode === 'list' ? (
          filteredEntries.length === 0
            && (slotFilter !== 'all' || filteredUnassignedAppearanceIds.length === 0) ? (
              <p className="text-center text-emperia-muted text-xs py-8">No entries match the current filter.</p>
            ) : (
              <>
                {slotFilter === 'all' && filteredUnassignedAppearanceIds.map((appearanceId) => (
                  <UnassignedEquipmentRow
                    key={`unassigned-${appearanceId}`}
                    equipmentAppearanceId={appearanceId}
                    onAssign={assignAppearance}
                  />
                ))}
                {filteredEntries.map(({ entry, index }) => (
                  <EntryRow
                    key={`${index}-${entry.itemId}-${entry.equipmentAppearanceId}`}
                    entry={entry}
                    index={index}
                    onUpdate={updateCatalogEntry}
                    onRemove={removeCatalogEntry}
                  />
                ))}
              </>
            )
        ) : (
          weaponGroups.length === 0 ? (
            <p className="text-center text-emperia-muted text-xs py-8">
              No weapon entries with left/right hand variants found.
            </p>
          ) : (
            weaponGroups.map((group) => (
              <WeaponGroupRow
                key={group.itemId}
                group={group}
                onUpdate={updateCatalogEntry}
                onRemove={removeCatalogEntry}
              />
            ))
          )
        )}
      </div>
    </div>
  );
}
