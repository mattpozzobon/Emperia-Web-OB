/**
 * Hair Definitions editor panel.
 *
 * Mirrors the Equipment tab pattern: left list of entries with filtering,
 * right-side fields editor, and outfit sprite preview.
 */
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Search, Plus, Trash2, Copy, ChevronDown } from 'lucide-react';
import { useOBStore, getDisplayId } from '../store';
import { decodeSprite } from '../lib/sprite-decoder';
import { applyOutfitMask } from '../lib/outfit-colors';
import type { HairDefinition, ObjectData, SpriteData, FrameGroup } from '../lib/types';
import { HairRace, HairGender, HairTier, HAIR_RACE_ALL, HAIR_GENDER_ALL, HAIR_TIER_ALL } from '../lib/types';

// ─── Constants ───────────────────────────────────────────────────────────────

const RACE_OPTIONS = [
  { flag: HairRace.Human as number, label: 'Human' },
  { flag: HairRace.Demon as number, label: 'Demon' },
  { flag: HairRace.Orc as number, label: 'Orc' },
] as const;

const GENDER_OPTIONS = [
  { flag: HairGender.Male as number, label: 'Male' },
  { flag: HairGender.Female as number, label: 'Female' },
] as const;

const TIER_OPTIONS = [
  { flag: HairTier.Free as number, label: 'Free' },
  { flag: HairTier.Noble as number, label: 'Noble' },
] as const;

type RaceFilter = 'all' | 'human' | 'demon' | 'orc';
type GenderFilter = 'all' | 'male' | 'female';
type TierFilter = 'all' | 'free' | 'noble';

const RACE_FILTER_FLAG: Record<RaceFilter, number> = {
  all: 0, human: HairRace.Human as number, demon: HairRace.Demon as number, orc: HairRace.Orc as number,
};
const GENDER_FILTER_FLAG: Record<GenderFilter, number> = {
  all: 0, male: HairGender.Male as number, female: HairGender.Female as number,
};
const TIER_FILTER_FLAG: Record<TierFilter, number> = {
  all: 0, free: HairTier.Free as number, noble: HairTier.Noble as number,
};

// ─── Outfit Thumbnail (reusable, renders outfit composite) ──────────────────

function fgSpriteIndex(
  fg: FrameGroup, frame: number, px: number, py: number, pz: number, layer: number, tx: number, ty: number,
): number {
  return ((((((frame * fg.patternZ + pz) * fg.patternY + py) * fg.patternX + px) * fg.layers + layer) * fg.height + ty) * fg.width + tx);
}

const hairThumbCache = new Map<string, string>();

// Base outfit display ID used as the mannequin for hair preview
const BASE_OUTFIT_DISPLAY_ID = 134;

/** Render a single outfit sprite onto the given canvas context. */
function drawOutfitLayer(
  ctx: CanvasRenderingContext2D,
  objectData: ObjectData, spriteData: SpriteData, spriteOverrides: Map<number, ImageData>,
  internalId: number, direction: number, colors: { head: number; body: number; legs: number; feet: number },
): void {
  const thing = objectData.things.get(internalId);
  if (!thing) return;
  const fg = thing.frameGroups[0];
  if (!fg || fg.sprites.length === 0) return;

  const px = Math.min(direction, fg.patternX - 1);
  const hasOutfitMask = fg.layers >= 2;

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
            if (maskRaw) applyOutfitMask(imgData, maskRaw, colors);
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

/** Render base outfit + hair overlay as a composite thumbnail. */
function renderCompositeThumb(
  objectData: ObjectData, spriteData: SpriteData, spriteOverrides: Map<number, ImageData>,
  hairDisplayId: number, baseDisplayId: number, direction: number = 2,
): string | null {
  const cacheKey = `hair-comp:${hairDisplayId}:${baseDisplayId}:${direction}`;
  const cached = hairThumbCache.get(cacheKey);
  if (cached) return cached;

  // Determine canvas size from the base outfit
  const baseInternal = objectData.itemCount + baseDisplayId;
  const baseThing = objectData.things.get(baseInternal);
  const baseFg = baseThing?.frameGroups[0];
  const cellW = baseFg ? baseFg.width * 32 : 64;
  const cellH = baseFg ? baseFg.height * 32 : 64;

  const canvas = document.createElement('canvas');
  canvas.width = cellW;
  canvas.height = cellH;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, cellW, cellH);

  const defaultColors = { head: 0, body: 0, legs: 0, feet: 0 };

  // Draw base outfit first
  drawOutfitLayer(ctx, objectData, spriteData, spriteOverrides, baseInternal, direction, defaultColors);

  // Draw hair on top
  if (hairDisplayId > 0) {
    const hairInternal = objectData.itemCount + hairDisplayId;
    drawOutfitLayer(ctx, objectData, spriteData, spriteOverrides, hairInternal, direction, defaultColors);
  }

  const url = canvas.toDataURL();
  hairThumbCache.set(cacheKey, url);
  return url;
}

function HairOutfitThumb({ outfitDisplayId, size = 40, showBase = false }: { outfitDisplayId: number; size?: number; showBase?: boolean }) {
  const objectData = useOBStore((s) => s.objectData);
  const spriteData = useOBStore((s) => s.spriteData);
  const spriteOverrides = useOBStore((s) => s.spriteOverrides);
  const editVersion = useOBStore((s) => s.editVersion);

  useEffect(() => { hairThumbCache.clear(); }, [editVersion]);

  if (!objectData || !spriteData || outfitDisplayId <= 0) {
    return (
      <div className="checkerboard rounded border border-emperia-border/50 flex items-center justify-center text-emperia-muted/30 text-[9px]"
        style={{ width: size, height: size }}>—</div>
    );
  }

  const url = showBase
    ? renderCompositeThumb(objectData, spriteData, spriteOverrides, outfitDisplayId, BASE_OUTFIT_DISPLAY_ID, 2)
    : renderCompositeThumb(objectData, spriteData, spriteOverrides, outfitDisplayId, 0, 2);

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

// ─── Bitmask Checkbox Group ─────────────────────────────────────────────────

function BitmaskCheckboxes({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { flag: number; label: string }[];
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="text-[10px] text-emperia-muted block mb-1">{label}</label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const checked = (value & opt.flag) !== 0;
          return (
            <button
              key={opt.flag}
              onClick={() => onChange(checked ? value & ~opt.flag : value | opt.flag)}
              className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${
                checked
                  ? 'bg-emperia-accent/20 border-emperia-accent/40 text-emperia-accent'
                  : 'bg-emperia-bg border-emperia-border text-emperia-muted/60 hover:text-emperia-muted'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Constraint Badges ──────────────────────────────────────────────────────

function ConstraintBadges({ hair }: { hair: HairDefinition }) {
  const raceBadges: string[] = [];
  const genderBadges: string[] = [];
  const tierBadges: string[] = [];

  for (const r of RACE_OPTIONS) {
    if (hair.races & r.flag) raceBadges.push(r.label);
  }
  for (const g of GENDER_OPTIONS) {
    if (hair.genders & g.flag) genderBadges.push(g.label);
  }
  if (hair.tiers !== HAIR_TIER_ALL) {
    for (const t of TIER_OPTIONS) {
      if (hair.tiers & t.flag) tierBadges.push(t.label);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-0.5">
      {genderBadges.map((label) => (
        <span key={`g-${label}`} className="px-1 py-px rounded text-[8px] font-medium text-pink-400/80 bg-pink-400/10">{label}</span>
      ))}
      {raceBadges.length > 0 && genderBadges.length > 0 && (
        <span className="w-px h-2.5 bg-emperia-border/50 mx-0.5" />
      )}
      {raceBadges.map((label) => (
        <span key={`r-${label}`} className="px-1 py-px rounded text-[8px] font-medium text-cyan-400/80 bg-cyan-400/10">{label}</span>
      ))}
      {tierBadges.length > 0 && (
        <>
          <span className="w-px h-2.5 bg-emperia-border/50 mx-0.5" />
          {tierBadges.map((label) => (
            <span key={`t-${label}`} className="px-1 py-px rounded text-[8px] font-medium text-amber-400/80 bg-amber-400/10">{label}</span>
          ))}
        </>
      )}
    </div>
  );
}

// ─── Outfit Sprite Picker (inline grid) ─────────────────────────────────────

function OutfitPicker({ onSelect, onClose }: { onSelect: (displayId: number) => void; onClose: () => void }) {
  const objectData = useOBStore((s) => s.objectData);
  const spriteData = useOBStore((s) => s.spriteData);
  const spriteOverrides = useOBStore((s) => s.spriteOverrides);
  const getCategoryRange = useOBStore((s) => s.getCategoryRange);
  const [search, setSearch] = useState('');
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

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div ref={containerRef} className="bg-emperia-surface border border-emperia-border rounded-lg shadow-2xl w-[520px] max-h-[80vh] flex flex-col">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-emperia-border shrink-0">
          <h3 className="text-sm font-semibold text-emperia-text flex-1">Select Hair Outfit Sprite</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-emperia-hover text-emperia-muted hover:text-emperia-text text-xs">Close</button>
        </div>
        <div className="px-3 py-1.5 border-b border-emperia-border shrink-0">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-emperia-muted" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search outfit ID..." className="w-full pl-7 pr-2 py-1 bg-emperia-bg border border-emperia-border rounded text-xs text-emperia-text" autoFocus />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <div className="grid grid-cols-8 gap-1">
            {outfits.map(({ id, displayId }) => {
              if (!objectData || !spriteData) return null;
              const url = renderCompositeThumb(objectData, spriteData, spriteOverrides, displayId, 0, 2);
              return (
                <button key={id} onClick={() => onSelect(displayId)}
                  className="flex flex-col items-center gap-0.5 p-1 rounded hover:bg-emperia-hover border border-transparent hover:border-emperia-accent/40 transition-colors"
                  title={`Outfit #${displayId}`}>
                  <div className="w-10 h-10 checkerboard rounded flex items-center justify-center overflow-hidden">
                    {url ? <img src={url} alt="" className="pixelated max-w-full max-h-full" style={{ imageRendering: 'pixelated' }} draggable={false} />
                      : <div className="w-10 h-10 bg-emperia-bg/50 rounded" />}
                  </div>
                  <span className="text-[9px] text-emperia-muted">{displayId}</span>
                </button>
              );
            })}
          </div>
          {outfits.length === 0 && <p className="text-center text-emperia-muted text-xs py-8">No outfits found.</p>}
        </div>
      </div>
    </div>
  );
}

// ─── Hair Detail Editor (right side) ────────────────────────────────────────

function HairPreviewCanvas({ outfitDisplayId }: { outfitDisplayId: number }) {
  const objectData = useOBStore((s) => s.objectData);
  const spriteData = useOBStore((s) => s.spriteData);
  const spriteOverrides = useOBStore((s) => s.spriteOverrides);
  const editVersion = useOBStore((s) => s.editVersion);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(4);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !objectData || !spriteData) return;

    // Determine canvas size from the base outfit
    const baseInternal = objectData.itemCount + BASE_OUTFIT_DISPLAY_ID;
    const baseThing = objectData.things.get(baseInternal);
    const baseFg = baseThing?.frameGroups[0];
    const cellW = baseFg ? baseFg.width * 32 : 64;
    const cellH = baseFg ? baseFg.height * 32 : 64;

    canvas.width = cellW;
    canvas.height = cellH;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, cellW, cellH);

    const defaultColors = { head: 0, body: 0, legs: 0, feet: 0 };

    // Draw base outfit
    drawOutfitLayer(ctx, objectData, spriteData, spriteOverrides, baseInternal, 2, defaultColors);

    // Draw hair on top
    if (outfitDisplayId > 0) {
      const hairInternal = objectData.itemCount + outfitDisplayId;
      drawOutfitLayer(ctx, objectData, spriteData, spriteOverrides, hairInternal, 2, defaultColors);
    }
  }, [outfitDisplayId, objectData, spriteData, spriteOverrides, editVersion]);

  const canvas = canvasRef.current;
  const nativeW = canvas?.width ?? 64;
  const nativeH = canvas?.height ?? 64;

  return (
    <div className="flex flex-col gap-2">
      {/* Zoom slider */}
      <div className="flex items-center gap-3 px-1">
        <span className="text-[10px] text-emperia-muted">Zoom:</span>
        <input type="range" min={1} max={8} value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="flex-1 h-1 accent-emperia-accent" />
        <span className="text-[10px] text-emperia-muted w-6 text-right">{zoom}x</span>
      </div>
      {/* Canvas preview */}
      <div className="flex items-center justify-center overflow-auto">
        <div className="checkerboard rounded-lg border border-emperia-border" style={{ padding: 8 }}>
          <canvas
            ref={canvasRef}
            style={{
              width: nativeW * zoom,
              height: nativeH * zoom,
              imageRendering: 'pixelated',
            }}
          />
        </div>
      </div>
    </div>
  );
}

function HairDetail({ hair }: { hair: HairDefinition }) {
  const updateHairDefinition = useOBStore((s) => s.updateHairDefinition);
  const removeHairDefinition = useOBStore((s) => s.removeHairDefinition);
  const duplicateHairDefinition = useOBStore((s) => s.duplicateHairDefinition);
  const [showPicker, setShowPicker] = useState(false);

  const update = useCallback((data: Partial<HairDefinition>) => {
    updateHairDefinition(hair.hairId, data);
  }, [hair.hairId, updateHairDefinition]);

  return (
    <div className="p-3 flex flex-col gap-3">
      {/* Preview */}
      <HairPreviewCanvas outfitDisplayId={hair.outfitId} />
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-emperia-text">{hair.name}</div>
          <div className="text-[10px] text-emperia-muted">Hair #{hair.hairId} · Outfit #{hair.outfitId}</div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => duplicateHairDefinition(hair.hairId)}
            className="p-1.5 rounded text-emperia-muted hover:text-emperia-accent hover:bg-emperia-hover" title="Duplicate">
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => removeHairDefinition(hair.hairId)}
            className="p-1.5 rounded text-red-400/50 hover:text-red-400 hover:bg-red-400/10" title="Delete">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Name */}
      <div>
        <label className="text-[10px] text-emperia-muted block mb-1">Name</label>
        <input type="text" value={hair.name} onChange={(e) => update({ name: e.target.value })}
          className="w-full bg-emperia-bg border border-emperia-border rounded px-2 py-1 text-xs text-emperia-text" />
      </div>

      {/* Hair ID + Outfit ID */}
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-[10px] text-emperia-muted block mb-1">Hair ID</label>
          <input type="number" value={hair.hairId} readOnly
            className="w-full bg-emperia-bg/50 border border-emperia-border/50 rounded px-2 py-1 text-xs text-emperia-muted cursor-not-allowed"
            title="Hair ID is immutable after creation" />
        </div>
        <div className="flex-1">
          <label className="text-[10px] text-emperia-muted block mb-1">Outfit ID</label>
          <div className="flex gap-1">
            <input type="number" value={hair.outfitId}
              onChange={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v) && v >= 0) update({ outfitId: v }); }}
              className="flex-1 bg-emperia-bg border border-emperia-border rounded px-2 py-1 text-xs text-emperia-text" />
            <button onClick={() => setShowPicker(true)}
              className="px-2 py-1 rounded text-[10px] bg-emperia-accent/10 text-emperia-accent hover:bg-emperia-accent/20 border border-emperia-border whitespace-nowrap">
              Pick
            </button>
          </div>
        </div>
      </div>

      {/* Sort Order */}
      <div>
        <label className="text-[10px] text-emperia-muted block mb-1">Sort Order</label>
        <input type="number" value={hair.sortOrder}
          onChange={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v)) update({ sortOrder: v }); }}
          className="w-24 bg-emperia-bg border border-emperia-border rounded px-2 py-1 text-xs text-emperia-text" />
      </div>

      <div className="w-full h-px bg-emperia-border" />

      {/* Constraints */}
      <BitmaskCheckboxes label="Races" options={RACE_OPTIONS} value={hair.races} onChange={(v) => update({ races: v || 1 })} />
      <BitmaskCheckboxes label="Gender" options={GENDER_OPTIONS} value={hair.genders} onChange={(v) => update({ genders: v || 1 })} />
      <BitmaskCheckboxes label="Account Tier" options={TIER_OPTIONS} value={hair.tiers} onChange={(v) => update({ tiers: v || 1 })} />

      {/* Validation warnings */}
      {hair.outfitId <= 0 && (
        <p className="text-[10px] text-amber-400 bg-amber-400/10 rounded px-2 py-1">Outfit ID must be a positive number.</p>
      )}
      {!hair.name.trim() && (
        <p className="text-[10px] text-amber-400 bg-amber-400/10 rounded px-2 py-1">Name is required.</p>
      )}

      {showPicker && (
        <OutfitPicker onSelect={(id) => { update({ outfitId: id }); setShowPicker(false); }} onClose={() => setShowPicker(false)} />
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function HairEditor() {
  const hairDefinitions = useOBStore((s) => s.hairDefinitions);
  const hairDefsLoaded = useOBStore((s) => s.hairDefsLoaded);
  const selectedHairId = useOBStore((s) => s.selectedHairId);
  const setSelectedHairId = useOBStore((s) => s.setSelectedHairId);
  const addHairDefinition = useOBStore((s) => s.addHairDefinition);
  useOBStore((s) => s.editVersion);

  const [search, setSearch] = useState('');
  const [raceFilter, setRaceFilter] = useState<RaceFilter>('all');
  const [genderFilter, setGenderFilter] = useState<GenderFilter>('all');
  const [tierFilter, setTierFilter] = useState<TierFilter>('all');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rf = RACE_FILTER_FLAG[raceFilter];
    const gf = GENDER_FILTER_FLAG[genderFilter];
    const tf = TIER_FILTER_FLAG[tierFilter];
    return hairDefinitions.filter((h) => {
      if (q && !h.name.toLowerCase().includes(q) && !h.hairId.toString().includes(q) && !h.outfitId.toString().includes(q)) return false;
      if (rf && !(h.races & rf)) return false;
      if (gf && !(h.genders & gf)) return false;
      if (tf && !(h.tiers & tf)) return false;
      return true;
    });
  }, [hairDefinitions, search, raceFilter, genderFilter, tierFilter]);

  const selected = useMemo(() => hairDefinitions.find((h) => h.hairId === selectedHairId) ?? null, [hairDefinitions, selectedHairId]);

  const handleAdd = useCallback(() => {
    const existingIds = new Set(hairDefinitions.map((h) => h.hairId));
    let newId = 1;
    while (existingIds.has(newId)) newId++;
    addHairDefinition({
      hairId: newId,
      name: `New Hair ${newId}`,
      outfitId: 0,
      races: HAIR_RACE_ALL,
      genders: HAIR_GENDER_ALL,
      tiers: HAIR_TIER_ALL,
      sortOrder: hairDefinitions.length,
    });
  }, [hairDefinitions, addHairDefinition]);

  if (!hairDefsLoaded) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-emperia-muted text-sm p-8 gap-3">
        <p>No hair definitions loaded.</p>
        <p className="text-[10px] text-emperia-muted/50">
          Drop a <code className="text-emperia-accent">hair-definitions.json</code> file or open a folder containing one.
        </p>
        <button onClick={handleAdd}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs bg-emperia-accent/10 text-emperia-accent hover:bg-emperia-accent/20 border border-emperia-accent/30">
          <Plus className="w-3 h-3" />
          Create First Hair
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Left: Hair list */}
      <div className="w-72 border-r border-emperia-border flex flex-col shrink-0">
        {/* Toolbar */}
        <div className="flex flex-col gap-1.5 px-2 py-1.5 border-b border-emperia-border shrink-0">
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-emperia-muted" />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..." className="w-full pl-7 pr-2 py-1 bg-emperia-bg border border-emperia-border rounded text-xs text-emperia-text" />
            </div>
            <button onClick={handleAdd}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-emperia-accent/10 text-emperia-accent hover:bg-emperia-accent/20 shrink-0">
              <Plus className="w-3 h-3" /> Add
            </button>
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            <FilterDropdown label="Race" value={raceFilter} onChange={(v) => setRaceFilter(v as RaceFilter)}
              options={[{ value: 'all', label: 'All Races' }, { value: 'human', label: 'Human' }, { value: 'demon', label: 'Demon' }, { value: 'orc', label: 'Orc' }]} />
            <FilterDropdown label="Gender" value={genderFilter} onChange={(v) => setGenderFilter(v as GenderFilter)}
              options={[{ value: 'all', label: 'All' }, { value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]} />
            <FilterDropdown label="Tier" value={tierFilter} onChange={(v) => setTierFilter(v as TierFilter)}
              options={[{ value: 'all', label: 'All' }, { value: 'free', label: 'Free' }, { value: 'noble', label: 'Noble' }]} />
            <span className="text-[10px] text-emperia-muted ml-auto shrink-0">{filtered.length}/{hairDefinitions.length}</span>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-center text-emperia-muted text-xs py-8">No entries match filters.</p>
          ) : (
            filtered.map((h) => (
              <button
                key={h.hairId}
                onClick={() => setSelectedHairId(h.hairId)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 text-left border-b border-emperia-border/30 transition-colors ${
                  h.hairId === selectedHairId ? 'bg-emperia-accent/10' : 'hover:bg-emperia-hover/50'
                }`}
              >
                <HairOutfitThumb outfitDisplayId={h.outfitId} size={32} showBase />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-emperia-text truncate">{h.name}</div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] text-emperia-muted font-mono">#{h.hairId}</span>
                    <ConstraintBadges hair={h} />
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right: Detail editor */}
      <div className="flex-1 overflow-y-auto">
        {selected ? (
          <HairDetail key={selected.hairId} hair={selected} />
        ) : (
          <div className="flex items-center justify-center h-full text-emperia-muted text-xs">
            Select a hair entry from the list.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Filter Dropdown ────────────────────────────────────────────────────────

function FilterDropdown({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="appearance-none bg-emperia-bg border border-emperia-border rounded pl-1.5 pr-5 py-0.5 text-[10px] text-emperia-text cursor-pointer">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-emperia-muted pointer-events-none" />
    </div>
  );
}
