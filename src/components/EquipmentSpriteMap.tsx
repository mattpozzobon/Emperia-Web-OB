/**
 * Equipment Sprite Map panel.
 *
 * Shows all entries from item-to-sprite.json, filtered by equipment slot,
 * with inline sprite previews. Allows assigning outfit sprites to items
 * and shows left/right hand variants side by side for weapons.
 */
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Search, Plus, Trash2, X, ChevronDown } from 'lucide-react';
import { useOBStore, getDisplayId } from '../store';
import { decodeSprite, getSpriteDataUrl } from '../lib/sprite-decoder';
import { applyOutfitMask } from '../lib/outfit-colors';
import type { EquipSlotFilter, ItemToSpriteEntry, FrameGroup, ObjectData, SpriteData } from '../lib/types';

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

/** Derive the slot category from an entry name. */
function inferSlot(entry: ItemToSpriteEntry, slotType?: string): EquipSlotFilter | null {
  const n = entry.name.toLowerCase();
  if (n.includes('left-hand') || n.includes('lefthand') || n.includes('left hand')) return 'left-hand';
  if (n.includes('right-hand') || n.includes('righthand') || n.includes('right hand')) return 'right-hand';
  if (slotType === 'head' || n.includes('helmet') || n.includes('hat') || n.includes('crown helmet')) return 'head';
  if (slotType === 'body' || n.includes('armor') || n.includes('armour')) return 'body';
  if (slotType === 'legs' || n.includes(' legs') || n.includes(' leg')) return 'legs';
  if (slotType === 'feet' || n.includes('boots') || n.includes('boot') || n.includes('shoes')) return 'feet';
  if (slotType === 'backpack' || n.includes('backpack') || n.includes('cape')) return 'backpack';
  if (n.includes('belt')) return 'belt';
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
      ctx.putImageData(imgData, dx, dy);
    }
  }

  const url = canvas.toDataURL();
  outfitThumbCache.set(cacheKey, url);
  return url;
}

/**
 * Convert an outfit ID (as stored in item-to-sprite.json, 1-based) to internal thing ID.
 * The desktop OB uses 1-based outfit numbering, so sprite_id=1 → internal=itemCount+1.
 */
function outfitIdToInternal(objectData: ObjectData, outfitId: number): number {
  return objectData.itemCount + outfitId;
}

// ─── Outfit Sprite Picker Modal ──────────────────────────────────────────────

function OutfitSpritePicker({
  onSelect,
  onClose,
}: {
  onSelect: (outfitDisplayId: number) => void;
  onClose: () => void;
}) {
  const objectData = useOBStore((s) => s.objectData);
  const spriteData = useOBStore((s) => s.spriteData);
  const spriteOverrides = useOBStore((s) => s.spriteOverrides);
  const getCategoryRange = useOBStore((s) => s.getCategoryRange);
  const [search, setSearch] = useState('');
  const [direction, setDirection] = useState(2); // 0=N,1=E,2=S,3=W
  const containerRef = useRef<HTMLDivElement>(null);

  const outfitRange = getCategoryRange('outfit');

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
          <h3 className="text-sm font-semibold text-emperia-text flex-1">Select Outfit Sprite</h3>
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
              placeholder="Search outfit ID..."
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
                  title={`Outfit #${displayId}`}
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
            <p className="text-center text-emperia-muted text-xs py-8">No outfits found.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Outfit Thumbnail Component ─────────────────────────────────────────────

/**
 * Renders a composite outfit thumbnail for a given outfit display ID (from item-to-sprite.json).
 * Handles multi-tile outfits with outfit mask coloring.
 */
function OutfitThumbnail({ outfitDisplayId, size = 32, direction = 2 }: { outfitDisplayId: number; size?: number; direction?: number }) {
  const objectData = useOBStore((s) => s.objectData);
  const spriteData = useOBStore((s) => s.spriteData);
  const spriteOverrides = useOBStore((s) => s.spriteOverrides);
  const editVersion = useOBStore((s) => s.editVersion);

  // Clear cache when edits happen
  useEffect(() => { clearOutfitThumbCache(); }, [editVersion]);

  if (!objectData || !spriteData || outfitDisplayId <= 0) {
    return (
      <div
        className="checkerboard rounded border border-emperia-border/50 flex items-center justify-center text-emperia-muted/30 text-[9px]"
        style={{ width: size, height: size }}
      >
        —
      </div>
    );
  }

  const internalId = outfitIdToInternal(objectData, outfitDisplayId);
  const url = renderOutfitThumb(objectData, spriteData, spriteOverrides, internalId, direction);

  return (
    <div className="checkerboard rounded border border-emperia-border/50 overflow-hidden flex items-center justify-center" style={{ width: size, height: size }}>
      {url ? (
        <img src={url} alt={`outfit#${outfitDisplayId}`} className="pixelated max-w-full max-h-full" style={{ imageRendering: 'pixelated' }} draggable={false} />
      ) : (
        <div className="flex items-center justify-center text-emperia-muted/30 text-[9px]" style={{ width: size, height: size }}>?</div>
      )}
    </div>
  );
}

// ─── Item Thumbnail Component ────────────────────────────────────────────────

/**
 * Renders the base item sprite for a given server item ID.
 * Resolves server ID → client ID via itemDefinitions, then looks up the ThingType.
 */
function ItemThumbnail({ itemId, size = 28 }: { itemId: number; size?: number }) {
  const objectData = useOBStore((s) => s.objectData);
  const spriteData = useOBStore((s) => s.spriteData);
  const spriteOverrides = useOBStore((s) => s.spriteOverrides);
  const itemDefinitions = useOBStore((s) => s.itemDefinitions);
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

  // itemId is a server ID; resolve to client ID via definitions
  const def = itemDefinitions.get(itemId);
  const clientId = def?.id ?? itemId;
  const thing = objectData.things.get(clientId);
  const sprId = thing?.frameGroups[0]?.sprites[0] ?? 0;
  const url = sprId > 0 ? getSpriteDataUrl(spriteData, sprId, spriteOverrides) : null;

  const handleClick = () => {
    if (!thing) return;
    const { setCenterTab, setSelectedThingId } = useOBStore.getState();
    // Switch to item category if not already
    if (useOBStore.getState().activeCategory !== 'item') {
      useOBStore.setState({ activeCategory: 'item', searchQuery: '', filterGroup: -1 });
    }
    setSelectedThingId(clientId);
    setCenterTab('texture');
  };

  return (
    <button
      onClick={handleClick}
      className="checkerboard rounded border border-emperia-border/50 overflow-hidden flex items-center justify-center hover:border-emperia-accent/60 transition-colors cursor-pointer shrink-0"
      style={{ width: size, height: size }}
      title={`Go to item #${clientId}`}
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

function AddEntryForm({ onAdd, onCancel }: { onAdd: (entry: ItemToSpriteEntry) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [itemId, setItemId] = useState('');
  const [spriteId, setSpriteId] = useState('');
  const [showPicker, setShowPicker] = useState(false);

  const handleSubmit = () => {
    const id = parseInt(itemId, 10);
    const sid = parseInt(spriteId, 10);
    if (!name.trim() || isNaN(id) || isNaN(sid)) return;
    onAdd({ name: name.trim(), id, sprite_id: sid });
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
          value={spriteId}
          onChange={(e) => setSpriteId(e.target.value)}
          placeholder="Sprite ID"
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
          onSelect={(displayId) => { setSpriteId(displayId.toString()); setShowPicker(false); }}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}

// ─── Entry Row ───────────────────────────────────────────────────────────────

function EntryRow({
  entry,
  index,
  onUpdate,
  onRemove,
}: {
  entry: ItemToSpriteEntry;
  index: number;
  onUpdate: (index: number, entry: ItemToSpriteEntry) => void;
  onRemove: (index: number) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(entry.name);

  const itemDefinitions = useOBStore((s) => s.itemDefinitions);
  const clientToServerIds = useOBStore((s) => s.clientToServerIds);

  // Look up server definition for this item ID
  const serverId = clientToServerIds.get(entry.id);
  const def = serverId != null ? itemDefinitions.get(serverId) : undefined;
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
      <ItemThumbnail itemId={entry.id} size={40} />
      <OutfitThumbnail outfitDisplayId={entry.sprite_id} size={40} />

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
      <span className="text-[10px] text-amber-400 font-mono w-12 text-right shrink-0" title="Client Item ID">
        {entry.id}
      </span>

      {/* Sprite ID + change button */}
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-[10px] text-cyan-400 font-mono w-12 text-right" title="Outfit Sprite ID">
          {entry.sprite_id}
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
            onUpdate(index, { ...entry, sprite_id: displayId });
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
  leftEntry: { entry: ItemToSpriteEntry; index: number } | null;
  rightEntry: { entry: ItemToSpriteEntry; index: number } | null;
  otherEntries: { entry: ItemToSpriteEntry; index: number }[];
}

function WeaponGroupRow({
  group,
  onUpdate,
  onRemove,
}: {
  group: WeaponGroup;
  onUpdate: (index: number, entry: ItemToSpriteEntry) => void;
  onRemove: (index: number) => void;
}) {
  const [showPickerFor, setShowPickerFor] = useState<'left' | 'right' | null>(null);

  const itemDefinitions = useOBStore((s) => s.itemDefinitions);
  const clientToServerIds = useOBStore((s) => s.clientToServerIds);
  const serverId = clientToServerIds.get(group.itemId);
  const def = serverId != null ? itemDefinitions.get(serverId) : undefined;
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
              <OutfitThumbnail outfitDisplayId={group.leftEntry.entry.sprite_id} size={36} />
              <span className="text-[10px] text-cyan-400 font-mono">{group.leftEntry.entry.sprite_id}</span>
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
              <OutfitThumbnail outfitDisplayId={group.rightEntry.entry.sprite_id} size={36} />
              <span className="text-[10px] text-cyan-400 font-mono">{group.rightEntry.entry.sprite_id}</span>
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
          <OutfitThumbnail outfitDisplayId={entry.sprite_id} size={32} />
          <span className="text-[10px] text-cyan-400 font-mono">{entry.sprite_id}</span>
        </div>
      ))}

      {showPickerFor && (
        <OutfitSpritePicker
          onSelect={(displayId) => {
            const addSpriteMapEntry = useOBStore.getState().addSpriteMapEntry;
            const updateSpriteMapEntry = useOBStore.getState().updateSpriteMapEntry;
            const hand = showPickerFor === 'left' ? 'Left-Hand' : 'Right-Hand';
            if (showPickerFor === 'left' && group.leftEntry) {
              updateSpriteMapEntry(group.leftEntry.index, { ...group.leftEntry.entry, sprite_id: displayId });
            } else if (showPickerFor === 'right' && group.rightEntry) {
              updateSpriteMapEntry(group.rightEntry.index, { ...group.rightEntry.entry, sprite_id: displayId });
            } else {
              addSpriteMapEntry({ name: `${hand} (${group.baseName})`, id: group.itemId, sprite_id: displayId });
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

export function EquipmentSpriteMap() {
  const spriteMapEntries = useOBStore((s) => s.spriteMapEntries);
  const spriteMapLoaded = useOBStore((s) => s.spriteMapLoaded);
  const itemDefinitions = useOBStore((s) => s.itemDefinitions);
  const clientToServerIds = useOBStore((s) => s.clientToServerIds);
  const updateSpriteMapEntry = useOBStore((s) => s.updateSpriteMapEntry);
  const addSpriteMapEntry = useOBStore((s) => s.addSpriteMapEntry);
  const removeSpriteMapEntry = useOBStore((s) => s.removeSpriteMapEntry);
  useOBStore((s) => s.editVersion);

  const [slotFilter, setSlotFilter] = useState<EquipSlotFilter>('all');
  const [search, setSearch] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'weapons'>('list');

  // Get slot type from server definitions for each entry
  const getSlotType = useCallback((itemId: number): string | undefined => {
    const sid = clientToServerIds.get(itemId);
    const def = sid != null ? itemDefinitions.get(sid) : undefined;
    return def?.properties?.slotType;
  }, [clientToServerIds, itemDefinitions]);

  // Filter entries
  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return spriteMapEntries
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => {
        // Slot filter
        if (slotFilter !== 'all') {
          const slot = inferSlot(entry, getSlotType(entry.id));
          if (slot !== slotFilter) return false;
        }
        // Search filter
        if (q) {
          const nameMatch = entry.name.toLowerCase().includes(q);
          const idMatch = entry.id.toString().includes(q);
          const spriteMatch = entry.sprite_id.toString().includes(q);
          if (!nameMatch && !idMatch && !spriteMatch) return false;
        }
        return true;
      });
  }, [spriteMapEntries, slotFilter, search, getSlotType]);

  // Group weapons by item ID for the weapon view
  const weaponGroups = useMemo((): WeaponGroup[] => {
    if (viewMode !== 'weapons') return [];
    const groups = new Map<number, WeaponGroup>();

    for (const { entry, index } of filteredEntries) {
      const n = entry.name.toLowerCase();
      const isLeft = n.includes('left-hand') || n.includes('lefthand') || n.includes('left hand');
      const isRight = n.includes('right-hand') || n.includes('righthand') || n.includes('right hand');

      if (!isLeft && !isRight) continue;

      if (!groups.has(entry.id)) {
        // Derive base name from the entry name
        let baseName = entry.name
          .replace(/left-hand|lefthand|left hand|right-hand|righthand|right hand/gi, '')
          .replace(/\(|\)/g, '')
          .trim();
        if (!baseName) baseName = `Item ${entry.id}`;
        groups.set(entry.id, { itemId: entry.id, baseName, leftEntry: null, rightEntry: null, otherEntries: [] });
      }

      const g = groups.get(entry.id)!;
      if (isLeft && !g.leftEntry) g.leftEntry = { entry, index };
      else if (isRight && !g.rightEntry) g.rightEntry = { entry, index };
      else g.otherEntries.push({ entry, index });
    }

    return Array.from(groups.values());
  }, [filteredEntries, viewMode]);

  if (!spriteMapLoaded) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-emperia-muted text-sm p-8 gap-3">
        <p>No equipment sprite map loaded.</p>
        <p className="text-[10px] text-emperia-muted/50">
          Drop an <code className="text-emperia-accent">item-to-sprite.json</code> file or open a folder containing one.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-emperia-border shrink-0">
        {/* Slot filter dropdown */}
        <div className="relative">
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
        </div>

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
        <div className="flex items-center gap-0.5 border border-emperia-border rounded overflow-hidden">
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
        </div>

        {/* Add button */}
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-emperia-accent/10 text-emperia-accent hover:bg-emperia-accent/20"
        >
          <Plus className="w-3 h-3" />
          Add
        </button>

        {/* Count */}
        <span className="text-[10px] text-emperia-muted shrink-0">
          {filteredEntries.length} / {spriteMapEntries.length}
        </span>
      </div>

      {/* Add form */}
      {showAddForm && (
        <AddEntryForm
          onAdd={(entry) => { addSpriteMapEntry(entry); setShowAddForm(false); }}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {viewMode === 'list' ? (
          filteredEntries.length === 0 ? (
            <p className="text-center text-emperia-muted text-xs py-8">No entries match the current filter.</p>
          ) : (
            filteredEntries.map(({ entry, index }) => (
              <EntryRow
                key={`${index}-${entry.id}-${entry.sprite_id}`}
                entry={entry}
                index={index}
                onUpdate={updateSpriteMapEntry}
                onRemove={removeSpriteMapEntry}
              />
            ))
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
                onUpdate={updateSpriteMapEntry}
                onRemove={removeSpriteMapEntry}
              />
            ))
          )
        )}
      </div>
    </div>
  );
}
