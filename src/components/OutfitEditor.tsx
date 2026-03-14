/**
 * Outfit Builder editor panel.
 *
 * Compact UI with race/sex/skin-tone presets, per-slot color pickers
 * (auto-detected from mask layers), hair coloring, directional preview,
 * and JSON import/export.
 */
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Search, Plus, Trash2, Copy, Download, Upload, Palette, X } from 'lucide-react';
import { useOBStore } from '../store';
import { decodeSprite } from '../lib/sprite-decoder';
import { applyOutfitMask, PALETTE_SIZE, paletteToCSS } from '../lib/outfit-colors';
import type { ObjectData, SpriteData, FrameGroup, ItemToSpriteEntry, EquipSlotFilter } from '../lib/types';
import { HairRace, HairGender } from '../lib/types';
import {
  createEmptyOutfit,
  SLOT_NAMES,
  SLOT_COUNT,
  type OutfitDefinition,
  type OutfitSpriteSlot,
  type OutfitSpriteColors,
  type OutfitAttachments,
} from '../store/outfit-slice';

// ─── Race / Sex / Skin-tone presets ──────────────────────────────────────────

interface SkinPreset {
  readonly label: string;
  readonly baseOutfitIds: readonly number[];
  readonly defaultOutfitId: number;
}

interface RacePreset {
  readonly label: string;
  readonly hasHair: boolean;
  readonly male: SkinPreset;
  readonly female: SkinPreset;
}

/** Maps RACE_PRESETS array index → HairRace bitmask flag. */
const RACE_INDEX_TO_BITMASK: readonly number[] = [HairRace.Human, HairRace.Demon, HairRace.Orc];
/** Maps sex string → HairGender bitmask flag. */
const SEX_TO_GENDER: Record<'male' | 'female', number> = { male: HairGender.Male, female: HairGender.Female };

const RACE_PRESETS: readonly RacePreset[] = [
  {
    label: 'Human',
    hasHair: true,
    male: { label: 'Male', baseOutfitIds: [134, 135, 136, 137], defaultOutfitId: 134 },
    female: { label: 'Female', baseOutfitIds: [129, 130, 131, 132], defaultOutfitId: 129 },
  },
  {
    label: 'Demon',
    hasHair: false,
    male: { label: 'Male', baseOutfitIds: [139, 140, 141, 142], defaultOutfitId: 139 },
    female: { label: 'Female', baseOutfitIds: [144, 145, 146, 147], defaultOutfitId: 144 },
  },
  {
    label: 'Orc',
    hasHair: true,
    male: { label: 'Male', baseOutfitIds: [152, 153, 154], defaultOutfitId: 152 },
    female: { label: 'Female', baseOutfitIds: [156, 157, 158], defaultOutfitId: 156 },
  },
];

// ─── Sprite rendering helpers ────────────────────────────────────────────────

function fgSpriteIndex(
  fg: FrameGroup, frame: number, px: number, py: number, pz: number, layer: number, tx: number, ty: number,
): number {
  return ((((((frame * fg.patternZ + pz) * fg.patternY + py) * fg.patternX + px) * fg.layers + layer) * fg.height + ty) * fg.width + tx);
}

const thumbCache = new Map<string, string>();

function drawOutfitLayer(
  ctx: CanvasRenderingContext2D,
  objectData: ObjectData, spriteData: SpriteData, spriteOverrides: Map<number, ImageData>,
  internalId: number, direction: number, colors: { yellow: number; red: number; green: number; blue: number },
): void {
  const thing = objectData.things.get(internalId);
  if (!thing) return;
  const fg = thing.frameGroups[0];
  if (!fg || fg.sprites.length === 0) return;

  const px = Math.min(direction, fg.patternX - 1);
  const mapped = { head: colors.yellow, body: colors.red, legs: colors.green, feet: colors.blue };

  for (let ty = 0; ty < fg.height; ty++) {
    for (let tx = 0; tx < fg.width; tx++) {
      const idx = fgSpriteIndex(fg, 0, px, 0, 0, 0, tx, ty);
      if (idx >= fg.sprites.length) continue;
      const sprId = fg.sprites[idx];
      if (sprId <= 0) continue;

      const rawData = spriteOverrides.get(sprId) ?? decodeSprite(spriteData, sprId);
      if (!rawData) continue;
      const imgData = new ImageData(new Uint8ClampedArray(rawData.data), 32, 32);

      if (fg.layers >= 2) {
        const maskIdx = fgSpriteIndex(fg, 0, px, 0, 0, 1, tx, ty);
        if (maskIdx < fg.sprites.length) {
          const maskSprId = fg.sprites[maskIdx];
          if (maskSprId > 0) {
            const maskRaw = spriteOverrides.get(maskSprId) ?? decodeSprite(spriteData, maskSprId);
            if (maskRaw) applyOutfitMask(imgData, maskRaw, mapped);
          }
        }
      }

      const dx = (fg.width - 1 - tx) * 32;
      const dy = (fg.height - 1 - ty) * 32;
      const tmp = document.createElement('canvas');
      tmp.width = 32; tmp.height = 32;
      tmp.getContext('2d')!.putImageData(imgData, 0, 0);
      ctx.drawImage(tmp, dx, dy);
    }
  }
}

/** Check whether an outfit sprite in the .eobj has a mask layer (layers >= 2). */
function outfitHasMask(objectData: ObjectData, outfitDisplayId: number): boolean {
  if (outfitDisplayId <= 0) return false;
  const internalId = objectData.itemCount + outfitDisplayId;
  const thing = objectData.things.get(internalId);
  if (!thing) return false;
  const fg = thing.frameGroups[0];
  return !!fg && fg.layers >= 2;
}

function renderComposite(
  objectData: ObjectData, spriteData: SpriteData, spriteOverrides: Map<number, ImageData>,
  outfit: OutfitDefinition, direction: number,
): string | null {
  const key = `${outfit.id}:${direction}:${outfit.sprites.map(s => `${s.id}:${s.colors?.yellow??0}:${s.colors?.red??0}:${s.colors?.green??0}:${s.colors?.blue??0}`).join(',')}`;
  const cached = thumbCache.get(key);
  if (cached) return cached;

  const baseId = objectData.itemCount + outfit.id;
  const baseThing = objectData.things.get(baseId);
  const fg0 = baseThing?.frameGroups[0];
  const w = fg0 ? fg0.width * 32 : 64;
  const h = fg0 ? fg0.height * 32 : 64;

  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);

  const bc = { yellow: outfit.sprites[0]?.colors?.yellow ?? 0, red: outfit.sprites[2]?.colors?.red ?? 0, green: outfit.sprites[3]?.colors?.green ?? 0, blue: outfit.sprites[4]?.colors?.blue ?? 0 };
  drawOutfitLayer(ctx, objectData, spriteData, spriteOverrides, baseId, direction, bc);

  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    const s = outfit.sprites[slot];
    if (!s || s.id <= 0) continue;
    drawOutfitLayer(ctx, objectData, spriteData, spriteOverrides, objectData.itemCount + s.id, direction,
      { yellow: s.colors?.yellow ?? 0, red: s.colors?.red ?? 0, green: s.colors?.green ?? 0, blue: s.colors?.blue ?? 0 });
  }

  const url = c.toDataURL();
  thumbCache.set(key, url);
  return url;
}

// ─── Compact Color Picker Popover ────────────────────────────────────────────

const PAL_COLS = 19;
const PAL_SW = 11;

function ColorSwatch({ value, onChange, title }: { value: number; onChange: (v: number) => void; title: string }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node) && btnRef.current && !btnRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  return (
    <>
      <button ref={btnRef} onClick={() => setOpen(!open)}
        className="w-4 h-4 rounded-sm border border-white/20 cursor-pointer hover:scale-125 transition-transform shrink-0"
        style={{ backgroundColor: paletteToCSS(value) }} title={`${title}: ${value}`} />
      {open && createPortal(
        <div ref={popRef} className="fixed z-[9999] bg-emperia-bg border border-emperia-border rounded-lg shadow-2xl p-1.5"
          style={{ top: btnRef.current ? btnRef.current.getBoundingClientRect().bottom + 2 : 0, left: btnRef.current ? Math.min(btnRef.current.getBoundingClientRect().left, window.innerWidth - PAL_COLS * PAL_SW - 30) : 0 }}>
          <div className="grid" style={{ gridTemplateColumns: `repeat(${PAL_COLS}, ${PAL_SW}px)`, gap: '1px' }}>
            {Array.from({ length: PALETTE_SIZE }, (_, i) => (
              <button key={i} onClick={() => { onChange(i); setOpen(false); }}
                className={`cursor-pointer hover:scale-[1.5] hover:z-10 rounded-sm transition-transform ${i === value ? 'ring-1 ring-emperia-accent scale-110 z-10' : ''}`}
                style={{ backgroundColor: paletteToCSS(i), width: PAL_SW, height: PAL_SW }} title={`${i}`} />
            ))}
          </div>
        </div>, document.body)}
    </>
  );
}

// ─── Outfit Thumbnail (list) ─────────────────────────────────────────────────

function OutfitThumb({ outfit, size = 40 }: { outfit: OutfitDefinition; size?: number }) {
  const objectData = useOBStore((s) => s.objectData);
  const spriteData = useOBStore((s) => s.spriteData);
  const spriteOverrides = useOBStore((s) => s.spriteOverrides);
  useOBStore((s) => s.editVersion);

  if (!objectData || !spriteData || outfit.id <= 0) {
    return <div className="checkerboard rounded border border-emperia-border/50 flex items-center justify-center text-emperia-muted/30 text-[8px]" style={{ width: size, height: size }}>—</div>;
  }
  const url = renderComposite(objectData, spriteData, spriteOverrides, outfit, 2);
  return (
    <div className="checkerboard rounded border border-emperia-border/50 overflow-hidden flex items-center justify-center" style={{ width: size, height: size }}>
      {url ? <img src={url} alt="" className="pixelated max-w-full max-h-full" style={{ imageRendering: 'pixelated' }} draggable={false} /> : null}
    </div>
  );
}

// ─── Preview Canvas with 4 directions ────────────────────────────────────────

function PreviewCanvas({ outfit }: { outfit: OutfitDefinition }) {
  const objectData = useOBStore((s) => s.objectData);
  const spriteData = useOBStore((s) => s.spriteData);
  const spriteOverrides = useOBStore((s) => s.spriteOverrides);
  useOBStore((s) => s.editVersion);
  const [zoom, setZoom] = useState(3);

  if (!objectData || !spriteData || outfit.id <= 0) {
    return <div className="text-[10px] text-emperia-muted p-4 text-center">Set a valid outfit ID to preview.</div>;
  }

  const urls = [0, 1, 2, 3].map((d) => renderComposite(objectData, spriteData, spriteOverrides, outfit, d));
  const baseId = objectData.itemCount + outfit.id;
  const fg0 = objectData.things.get(baseId)?.frameGroups[0];
  const nw = (fg0?.width ?? 2) * 32;
  const nh = (fg0?.height ?? 2) * 32;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-center gap-1 flex-wrap">
        {urls.map((url, i) => (
          <div key={i} className="checkerboard rounded border border-emperia-border/50" style={{ padding: 2 }}>
            {url ? <img src={url} style={{ width: nw * zoom, height: nh * zoom, imageRendering: 'pixelated' }} className="pixelated" draggable={false} /> : null}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-center gap-2">
        <span className="text-[9px] text-emperia-muted">Zoom</span>
        <input type="range" min={1} max={6} value={zoom} onChange={(e) => setZoom(+e.target.value)} className="w-20 h-1 accent-emperia-accent" />
        <span className="text-[9px] text-emperia-muted w-4">{zoom}x</span>
      </div>
    </div>
  );
}

// ─── Preset Selector Bar ─────────────────────────────────────────────────────

function PresetBar({ outfit, onUpdate }: { outfit: OutfitDefinition; onUpdate: (d: Partial<OutfitDefinition>) => void }) {
  const objectData = useOBStore((s) => s.objectData);
  const spriteData = useOBStore((s) => s.spriteData);
  const spriteOverrides = useOBStore((s) => s.spriteOverrides);
  const hairDefinitions = useOBStore((s) => s.hairDefinitions);

  // Detect current race/sex from outfit.id
  const detected = useMemo(() => {
    for (let ri = 0; ri < RACE_PRESETS.length; ri++) {
      const r = RACE_PRESETS[ri];
      if ((r.male.baseOutfitIds as readonly number[]).includes(outfit.id)) return { race: ri, sex: 'male' as const };
      if ((r.female.baseOutfitIds as readonly number[]).includes(outfit.id)) return { race: ri, sex: 'female' as const };
    }
    return null;
  }, [outfit.id]);

  const activeRace = detected?.race ?? 0;
  const activeSex = detected?.sex ?? 'male';
  const preset = RACE_PRESETS[activeRace][activeSex];

  const filteredHairs = useMemo(() => {
    const raceBit = RACE_INDEX_TO_BITMASK[activeRace] ?? 0;
    const genderBit = SEX_TO_GENDER[activeSex];
    return hairDefinitions.filter((h) => (h.races & raceBit) !== 0 && (h.genders & genderBit) !== 0);
  }, [hairDefinitions, activeRace, activeSex]);

  const selectRaceSex = (raceIdx: number, sex: 'male' | 'female') => {
    const p = RACE_PRESETS[raceIdx][sex];
    onUpdate({ id: p.defaultOutfitId });
  };

  const selectSkin = (skinId: number) => {
    onUpdate({ id: skinId });
  };

  const selectHair = (outfitId: number) => {
    const newSprites = [...outfit.sprites];
    newSprites[0] = { ...newSprites[0], id: outfitId };
    onUpdate({ sprites: newSprites });
  };

  return (
    <div className="flex flex-col gap-1 px-2 py-1.5 border-b border-emperia-border/50 bg-emperia-surface/20">
      {/* Race + Sex */}
      <div className="flex items-center gap-1">
        <span className="text-[9px] text-emperia-muted w-8 shrink-0">Race</span>
        {RACE_PRESETS.map((r, ri) => (
          <div key={ri} className="flex">
            {(['male', 'female'] as const).map((sex) => (
              <button key={sex} onClick={() => selectRaceSex(ri, sex)}
                className={`px-1.5 py-px text-[9px] border transition-colors first:rounded-l last:rounded-r ${
                  activeRace === ri && activeSex === sex
                    ? 'bg-emperia-accent/20 border-emperia-accent/50 text-emperia-accent font-semibold'
                    : 'bg-emperia-bg border-emperia-border text-emperia-muted/60 hover:text-emperia-muted'
                }`}>
                {r.label} {sex === 'male' ? '♂' : '♀'}
              </button>
            ))}
          </div>
        ))}
      </div>
      {/* Skin tones */}
      <div className="flex items-center gap-1">
        <span className="text-[9px] text-emperia-muted w-8 shrink-0">Skin</span>
        <div className="flex gap-0.5">
          {preset.baseOutfitIds.map((skinId) => {
            const isCurrent = outfit.id === skinId;
            if (!objectData || !spriteData) return null;
            const tmpOutfit = { ...outfit, id: skinId };
            const url = renderComposite(objectData, spriteData, spriteOverrides, tmpOutfit, 2);
            return (
              <button key={skinId} onClick={() => selectSkin(skinId)}
                className={`rounded border transition-all ${isCurrent ? 'border-emperia-accent ring-1 ring-emperia-accent' : 'border-emperia-border/50 hover:border-emperia-accent/40'}`}>
                <div className="checkerboard rounded overflow-hidden" style={{ width: 28, height: 28 }}>
                  {url && <img src={url} className="pixelated w-full h-full" style={{ imageRendering: 'pixelated' }} draggable={false} />}
                </div>
              </button>
            );
          })}
        </div>
        <span className="text-[9px] text-emperia-muted font-mono ml-1">#{outfit.id}</span>
      </div>
      {/* Hair picker */}
      <div className="flex items-center gap-1">
        <span className="text-[9px] text-emperia-muted w-8 shrink-0">Hair</span>
        <div className="flex gap-0.5 flex-wrap">
          {/* None option */}
          <button onClick={() => selectHair(0)}
            className={`rounded border transition-all ${(outfit.sprites[0]?.id ?? 0) === 0 ? 'border-emperia-accent ring-1 ring-emperia-accent' : 'border-emperia-border/50 hover:border-emperia-accent/40'}`}
            title="No hair">
            <div className="checkerboard rounded overflow-hidden flex items-center justify-center text-[7px] text-emperia-muted/40" style={{ width: 24, height: 24 }}>—</div>
          </button>
          {filteredHairs.map((hair) => {
            const isCurrent = outfit.sprites[0]?.id === hair.outfitId;
            if (!objectData || !spriteData) return null;
            const tmpOutfit: OutfitDefinition = {
              ...outfit,
              sprites: outfit.sprites.map((s, i) => i === 0 ? { ...s, id: hair.outfitId } : { id: 0 }),
            };
            const url = renderComposite(objectData, spriteData, spriteOverrides, tmpOutfit, 2);
            return (
              <button key={hair.hairId} onClick={() => selectHair(hair.outfitId)}
                className={`rounded border transition-all ${isCurrent ? 'border-emperia-accent ring-1 ring-emperia-accent' : 'border-emperia-border/50 hover:border-emperia-accent/40'}`}
                title={`${hair.name} (#${hair.outfitId})`}>
                <div className="checkerboard rounded overflow-hidden" style={{ width: 24, height: 24 }}>
                  {url && <img src={url} className="pixelated w-full h-full" style={{ imageRendering: 'pixelated' }} draggable={false} />}
                </div>
              </button>
            );
          })}
          {filteredHairs.length === 0 && <span className="text-[8px] text-emperia-muted/50 italic">No hairs loaded</span>}
        </div>
        <span className="text-[9px] text-emperia-muted font-mono ml-1">#{outfit.sprites[0]?.id ?? 0}</span>
      </div>
    </div>
  );
}

// ─── Slot index → equipment slot filter mapping ─────────────────────────────

const SLOT_TO_EQUIP_FILTER: (EquipSlotFilter | null)[] = [
  null,         // 0 = Hair (use preset bar)
  'head',       // 1 = Head
  'body',       // 2 = Body
  'legs',       // 3 = Legs
  'feet',       // 4 = Feet
  'left-hand',  // 5 = Left Hand
  'right-hand', // 6 = Right Hand
  'backpack',   // 7 = Backpack
  'belt',       // 8 = Belt
];

/** Derive the slot category from server slotType (authoritative) or entry name (fallback). */
function inferEquipSlot(entry: ItemToSpriteEntry, slotType?: string): EquipSlotFilter | null {
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

// ─── Equipment Picker Popover ────────────────────────────────────────────────

function EquipPicker({ slotFilter, onSelect, onClose }: {
  slotFilter: EquipSlotFilter; onSelect: (spriteId: number) => void; onClose: () => void;
}) {
  const spriteMapEntries = useOBStore((s) => s.spriteMapEntries);
  const objectData = useOBStore((s) => s.objectData);
  const spriteData = useOBStore((s) => s.spriteData);
  const spriteOverrides = useOBStore((s) => s.spriteOverrides);
  const itemDefinitions = useOBStore((s) => s.itemDefinitions);
  const clientToServerIds = useOBStore((s) => s.clientToServerIds);
  const popRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');

  const getSlotType = useCallback((itemId: number): string | undefined => {
    const sid = clientToServerIds.get(itemId);
    const def = sid != null ? itemDefinitions.get(sid) : undefined;
    return def?.properties?.slotType;
  }, [clientToServerIds, itemDefinitions]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (popRef.current && !popRef.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return spriteMapEntries.filter((e) => {
      const s = inferEquipSlot(e, getSlotType(e.id));
      if (s !== slotFilter) return false;
      if (q && !e.name.toLowerCase().includes(q) && !e.sprite_id.toString().includes(q)) return false;
      return true;
    });
  }, [spriteMapEntries, slotFilter, search, getSlotType]);

  return createPortal(
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40">
      <div ref={popRef} className="bg-emperia-surface border border-emperia-border rounded-lg shadow-2xl w-[360px] max-h-[60vh] flex flex-col">
        <div className="flex items-center gap-2 px-2 py-1.5 border-b border-emperia-border shrink-0">
          <span className="text-[10px] font-semibold text-emperia-text capitalize">{slotFilter} Equipment</span>
          <div className="relative flex-1">
            <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-emperia-muted" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..."
              className="w-full pl-5 pr-1 py-0.5 bg-emperia-bg border border-emperia-border rounded text-[10px] text-emperia-text" autoFocus />
          </div>
          <button onClick={onClose} className="p-0.5 text-emperia-muted hover:text-emperia-text"><X className="w-3 h-3" /></button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {/* None option */}
          <button onClick={() => onSelect(0)}
            className="w-full flex items-center gap-2 px-2 py-1 text-left hover:bg-emperia-hover/50 border-b border-emperia-border/20 text-[10px] text-emperia-muted">
            <div className="w-6 h-6 rounded bg-emperia-bg/50 flex items-center justify-center text-[8px]">—</div>
            <span>None</span>
          </button>
          {filtered.map((entry, i) => {
            let thumbUrl: string | null = null;
            if (objectData && spriteData && entry.sprite_id > 0) {
              const intId = objectData.itemCount + entry.sprite_id;
              const thing = objectData.things.get(intId);
              if (thing) {
                const key = `equip-pick:${intId}`;
                const cached = thumbCache.get(key);
                if (cached) { thumbUrl = cached; }
                else {
                  const fg = thing.frameGroups[0];
                  if (fg && fg.sprites.length > 0) {
                    const sprId = fg.sprites[Math.min(2, fg.patternX - 1) * fg.layers * fg.height * fg.width] ?? fg.sprites[0];
                    if (sprId > 0) {
                      const raw = spriteOverrides.get(sprId) ?? decodeSprite(spriteData, sprId);
                      if (raw) {
                        const tc = document.createElement('canvas'); tc.width = 32; tc.height = 32;
                        tc.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(raw.data), 32, 32), 0, 0);
                        thumbUrl = tc.toDataURL();
                        thumbCache.set(key, thumbUrl);
                      }
                    }
                  }
                }
              }
            }
            return (
              <button key={`${entry.sprite_id}-${i}`} onClick={() => onSelect(entry.sprite_id)}
                className="w-full flex items-center gap-2 px-2 py-0.5 text-left hover:bg-emperia-hover/50 border-b border-emperia-border/10 transition-colors">
                <div className="w-6 h-6 checkerboard rounded border border-emperia-border/30 overflow-hidden flex items-center justify-center shrink-0">
                  {thumbUrl ? <img src={thumbUrl} className="pixelated w-full h-full" style={{ imageRendering: 'pixelated' }} draggable={false} /> : <span className="text-[7px] text-emperia-muted/30">?</span>}
                </div>
                <span className="text-[9px] text-emperia-text truncate flex-1">{entry.name}</span>
                <span className="text-[8px] text-emperia-muted font-mono shrink-0">{entry.sprite_id}</span>
              </button>
            );
          })}
          {filtered.length === 0 && <p className="text-center text-emperia-muted text-[9px] py-3">No equipment found for this slot.</p>}
        </div>
      </div>
    </div>, document.body);
}

// ─── Rarity tiers (matches server ITEM_RARITY + getRarityColor) ──────────────

const RARITY_OPTIONS: readonly { value: number; label: string; color: string }[] = [
  { value: 0, label: 'Common',    color: '#b0bec5' },
  { value: 1, label: 'Uncommon',  color: '#4caf50' },
  { value: 2, label: 'Rare',      color: '#2196f3' },
  { value: 3, label: 'Epic',      color: '#9c27b0' },
  { value: 4, label: 'Legendary', color: '#ff9800' },
  { value: 5, label: 'Mythic',    color: '#f44336' },
];

// ─── Compact Slot Row ────────────────────────────────────────────────────────

function SlotRow({ slotIndex, slot, onUpdate, hasMask }: {
  slotIndex: number; slot: OutfitSpriteSlot; onUpdate: (d: OutfitSpriteSlot) => void; hasMask: boolean;
}) {
  const [showEquipPicker, setShowEquipPicker] = useState(false);
  const spriteMapLoaded = useOBStore((s) => s.spriteMapLoaded);

  const updateColor = (ch: keyof OutfitSpriteColors, v: number) => {
    const c: OutfitSpriteColors = slot.colors ? { ...slot.colors, [ch]: v } : { yellow: 0, red: 0, green: 0, blue: 0, [ch]: v };
    onUpdate({ ...slot, colors: c });
  };

  const showColors = hasMask && slot.id > 0;
  const equipFilter = SLOT_TO_EQUIP_FILTER[slotIndex];
  const canPickEquip = spriteMapLoaded && equipFilter != null;

  return (
    <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] ${slot.id > 0 ? '' : 'opacity-40'}`}>
      <span className="w-[62px] text-emperia-text font-medium truncate shrink-0">{SLOT_NAMES[slotIndex]}</span>
      <input type="number" value={slot.id} min={0}
        onChange={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v) && v >= 0) onUpdate({ ...slot, id: v }); }}
        className="w-12 bg-emperia-bg border border-emperia-border rounded px-1 py-px text-[10px] text-emperia-text font-mono text-right" />
      {canPickEquip && (
        <button onClick={() => setShowEquipPicker(true)}
          className="px-1 py-px rounded text-[8px] bg-emperia-accent/10 text-emperia-accent/70 hover:text-emperia-accent hover:bg-emperia-accent/20 border border-emperia-accent/20 transition-colors shrink-0"
          title={`Browse ${equipFilter} equipment`}>Pick</button>
      )}
      {showColors && (
        <div className="flex items-center gap-0.5 ml-0.5">
          <ColorSwatch value={slot.colors?.yellow ?? 0} onChange={(v) => updateColor('yellow', v)} title="Yellow" />
          <ColorSwatch value={slot.colors?.red ?? 0} onChange={(v) => updateColor('red', v)} title="Red" />
          <ColorSwatch value={slot.colors?.green ?? 0} onChange={(v) => updateColor('green', v)} title="Green" />
          <ColorSwatch value={slot.colors?.blue ?? 0} onChange={(v) => updateColor('blue', v)} title="Blue" />
        </div>
      )}
      {slot.id > 0 && (
        <div className="flex items-center gap-0.5 ml-0.5">
          <select value={slot.rarity ?? 0}
            onChange={(e) => { const v = parseInt(e.target.value, 10); onUpdate({ ...slot, rarity: v || undefined }); }}
            className="bg-emperia-bg border border-emperia-border rounded px-0.5 py-px text-[9px] font-medium cursor-pointer"
            style={{ color: RARITY_OPTIONS[slot.rarity ?? 0]?.color ?? '#b0bec5' }}
            title="Rarity">
            {RARITY_OPTIONS.map((r) => (
              <option key={r.value} value={r.value} style={{ color: r.color }}>{r.label}</option>
            ))}
          </select>
          <span className="text-[8px] text-emperia-muted" title="Level">Lv</span>
          <input type="number" value={slot.level ?? 0} min={0}
            onChange={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v) && v >= 0) onUpdate({ ...slot, level: v || undefined }); }}
            className="w-8 bg-emperia-bg border border-emperia-border rounded px-0.5 py-px text-[9px] text-emperia-text font-mono text-right" title="Level" />
        </div>
      )}
      {slot.id > 0 && (
        <button onClick={() => onUpdate({ id: 0 })} className="p-0.5 text-red-400/30 hover:text-red-400 ml-auto shrink-0" title="Clear">
          <X className="w-2.5 h-2.5" />
        </button>
      )}
      {showEquipPicker && equipFilter && (
        <EquipPicker slotFilter={equipFilter}
          onSelect={(spriteId) => { onUpdate({ ...slot, id: spriteId }); setShowEquipPicker(false); }}
          onClose={() => setShowEquipPicker(false)} />
      )}
    </div>
  );
}

// ─── Attachment Row ──────────────────────────────────────────────────────────

const ATT_KEYS: (keyof OutfitAttachments)[] = ['healthPotion', 'manaPotion', 'energyPotion', 'bag'];
const ATT_SHORT: Record<keyof OutfitAttachments, string> = { healthPotion: 'HP Pot', manaPotion: 'MP Pot', energyPotion: 'EP Pot', bag: 'Bag' };

// ─── Detail Editor (right side) ──────────────────────────────────────────────

function OutfitDetail({ outfit, index }: { outfit: OutfitDefinition; index: number }) {
  const objectData = useOBStore((s) => s.objectData);
  const update = useOBStore((s) => s.updateOutfitDefinition);
  const remove = useOBStore((s) => s.removeOutfitDefinition);
  const dupe = useOBStore((s) => s.duplicateOutfitDefinition);

  const doUpdate = useCallback((d: Partial<OutfitDefinition>) => update(index, d), [index, update]);

  const updateSlot = useCallback((si: number, sd: OutfitSpriteSlot) => {
    const ss = [...outfit.sprites];
    ss[si] = sd;
    doUpdate({ sprites: ss });
  }, [outfit.sprites, doUpdate]);

  // Check mask for each slot
  const slotMasks = useMemo(() => {
    if (!objectData) return Array(SLOT_COUNT).fill(false);
    return outfit.sprites.map((s) => s.id > 0 ? outfitHasMask(objectData, s.id) : false);
  }, [objectData, outfit.sprites]);

  // Also check if base outfit has mask (for body colors via yellow/red/green/blue)
  const baseMask = objectData ? outfitHasMask(objectData, outfit.id) : false;

  return (
    <div className="flex flex-col h-full">
      {/* Preset bar */}
      <PresetBar outfit={outfit} onUpdate={doUpdate} />

      {/* Preview */}
      <div className="px-2 py-1.5 border-b border-emperia-border/50">
        <PreviewCanvas outfit={outfit} />
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-2 py-1.5 flex flex-col gap-1.5">
        {/* ID + helmet + actions */}
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] text-emperia-muted">ID</span>
          <input type="number" value={outfit.id} min={0}
            onChange={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v) && v >= 0) doUpdate({ id: v }); }}
            className="w-14 bg-emperia-bg border border-emperia-border rounded px-1 py-px text-[10px] text-emperia-text font-mono text-right" />
          <label className="flex items-center gap-1 cursor-pointer select-none">
            <input type="checkbox" checked={outfit.renderHelmet} onChange={(e) => doUpdate({ renderHelmet: e.target.checked })} className="accent-emperia-accent w-2.5 h-2.5" />
            <span className="text-[9px] text-emperia-text">Helmet</span>
          </label>
          {baseMask && <span title="Base outfit has color mask"><Palette className="w-3 h-3 text-emperia-accent/50" /></span>}
          <div className="ml-auto flex items-center gap-0.5">
            <button onClick={() => dupe(index)} className="p-1 rounded text-emperia-muted hover:text-emperia-accent" title="Duplicate"><Copy className="w-3 h-3" /></button>
            <button onClick={() => { if (confirm('Delete?')) remove(index); }} className="p-1 rounded text-red-400/40 hover:text-red-400" title="Delete"><Trash2 className="w-3 h-3" /></button>
          </div>
        </div>

        {/* Slots */}
        <div className="border border-emperia-border/30 rounded divide-y divide-emperia-border/20">
          {outfit.sprites.map((slot, i) => (
            <SlotRow key={i} slotIndex={i} slot={slot}
              onUpdate={(d) => updateSlot(i, d)}
              hasMask={slotMasks[i] || (i === 0 && outfitHasMask(objectData!, slot.id > 0 ? slot.id : 0))} />
          ))}
        </div>

        {/* Attachments */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[9px] text-emperia-muted w-8 shrink-0">Attach</span>
          {ATT_KEYS.map((k) => (
            <div key={k} className="flex items-center gap-0.5">
              <span className="text-[8px] text-emperia-muted">{ATT_SHORT[k]}</span>
              <input type="number" value={outfit.attachments[k]} min={0}
                onChange={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v) && v >= 0) doUpdate({ attachments: { ...outfit.attachments, [k]: v } }); }}
                className="w-10 bg-emperia-bg border border-emperia-border rounded px-1 py-px text-[9px] text-emperia-text font-mono text-right" />
            </div>
          ))}
        </div>

        {/* JSON */}
        <pre className="bg-emperia-bg border border-emperia-border rounded p-1.5 text-[8px] text-emperia-text font-mono overflow-x-auto max-h-48 overflow-y-auto select-all">
          {JSON.stringify({
            id: outfit.id, renderHelmet: outfit.renderHelmet,
            sprites: outfit.sprites.map((s) => {
              const out: Record<string, unknown> = { id: s.id };
              if (s.colors) out.colors = { ...s.colors };
              if (s.rarity != null) out.rarity = s.rarity;
              if (s.level != null) out.level = s.level;
              return out;
            }),
            attachments: { ...outfit.attachments },
          }, null, 2)}
        </pre>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function OutfitEditor() {
  const outfitDefinitions = useOBStore((s) => s.outfitDefinitions);
  const outfitDefsLoaded = useOBStore((s) => s.outfitDefsLoaded);
  const selectedOutfitIndex = useOBStore((s) => s.selectedOutfitIndex);
  const setSelectedOutfitIndex = useOBStore((s) => s.setSelectedOutfitIndex);
  const addOutfitDefinition = useOBStore((s) => s.addOutfitDefinition);
  const loadOutfitDefinitions = useOBStore((s) => s.loadOutfitDefinitions);
  useOBStore((s) => s.editVersion);

  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim();
    if (!q) return outfitDefinitions;
    return outfitDefinitions.filter((o) => o.id.toString().includes(q));
  }, [outfitDefinitions, search]);

  const selected = selectedOutfitIndex != null ? outfitDefinitions[selectedOutfitIndex] ?? null : null;

  const handleAdd = useCallback(() => {
    addOutfitDefinition(createEmptyOutfit());
  }, [addOutfitDefinition]);

  const handleImport = useCallback(async () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const json = JSON.parse(await file.text());
        if (json.id != null && json.sprites) {
          addOutfitDefinition({
            id: json.id ?? 0, renderHelmet: json.renderHelmet ?? false,
            sprites: Array.from({ length: SLOT_COUNT }, (_, i) => {
              const s = json.sprites?.[i];
              return s ? { id: s.id ?? 0, ...(s.colors ? { colors: { ...s.colors } } : {}), ...(s.rarity != null ? { rarity: s.rarity } : {}), ...(s.level != null ? { level: s.level } : {}) } : { id: 0 };
            }),
            attachments: { healthPotion: 0, manaPotion: 0, energyPotion: 0, bag: 0, ...(json.attachments ?? {}) },
          });
        } else {
          loadOutfitDefinitions(json);
        }
      } catch { /* ignore */ }
    };
    input.click();
  }, [addOutfitDefinition, loadOutfitDefinitions]);

  const handleExport = useCallback(() => {
    if (!selected) return;
    const json = JSON.stringify({
      id: selected.id, renderHelmet: selected.renderHelmet,
      sprites: selected.sprites.map((s) => {
        const out: Record<string, unknown> = { id: s.id };
        if (s.colors) out.colors = { ...s.colors };
        if (s.rarity != null) out.rarity = s.rarity;
        if (s.level != null) out.level = s.level;
        return out;
      }),
      attachments: { ...selected.attachments },
    }, null, 2);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = `outfit-${selected.id}.json`; a.click();
  }, [selected]);

  if (!outfitDefsLoaded && outfitDefinitions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-emperia-muted text-sm p-8 gap-3">
        <p>No outfit definitions loaded.</p>
        <div className="flex items-center gap-2">
          <button onClick={handleImport} className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs bg-emperia-accent/10 text-emperia-accent hover:bg-emperia-accent/20 border border-emperia-accent/30">
            <Upload className="w-3 h-3" /> Import JSON
          </button>
          <button onClick={handleAdd} className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs bg-emperia-accent/10 text-emperia-accent hover:bg-emperia-accent/20 border border-emperia-accent/30">
            <Plus className="w-3 h-3" /> Create New
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Left list */}
      <div className="w-52 border-r border-emperia-border flex flex-col shrink-0">
        <div className="flex items-center gap-1 px-1.5 py-1 border-b border-emperia-border shrink-0">
          <div className="relative flex-1">
            <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-emperia-muted" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ID..."
              className="w-full pl-5 pr-1 py-0.5 bg-emperia-bg border border-emperia-border rounded text-[10px] text-emperia-text" />
          </div>
          <button onClick={handleAdd} className="p-1 rounded text-emperia-accent bg-emperia-accent/10 hover:bg-emperia-accent/20" title="New"><Plus className="w-2.5 h-2.5" /></button>
          <button onClick={handleImport} className="p-1 rounded text-emperia-muted hover:text-emperia-accent" title="Import"><Upload className="w-2.5 h-2.5" /></button>
          <button onClick={handleExport} disabled={!selected} className="p-1 rounded text-emperia-muted hover:text-emperia-accent disabled:opacity-30" title="Export"><Download className="w-2.5 h-2.5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.map((o) => {
            const ri = outfitDefinitions.indexOf(o);
            return (
              <button key={`${ri}-${o.id}`} onClick={() => setSelectedOutfitIndex(ri)}
                className={`w-full flex items-center gap-1.5 px-1.5 py-1 text-left border-b border-emperia-border/20 transition-colors ${ri === selectedOutfitIndex ? 'bg-emperia-accent/10' : 'hover:bg-emperia-hover/50'}`}>
                <OutfitThumb outfit={o} size={30} />
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] text-emperia-text font-mono">#{o.id}</div>
                  <div className="text-[8px] text-emperia-muted">{o.sprites.filter((s) => s.id > 0).length} slots</div>
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && <p className="text-center text-emperia-muted text-[10px] py-4">No outfits.</p>}
        </div>
      </div>

      {/* Right editor */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selected && selectedOutfitIndex != null ? (
          <OutfitDetail key={selectedOutfitIndex} outfit={selected} index={selectedOutfitIndex} />
        ) : (
          <div className="flex items-center justify-center h-full text-emperia-muted text-[10px]">Select an outfit.</div>
        )}
      </div>
    </div>
  );
}
