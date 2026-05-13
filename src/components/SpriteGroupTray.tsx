import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, ArrowDownToLine, GripHorizontal } from 'lucide-react';
import { useOBStore } from '../store';
import { getSpriteDataUrl, clearSpriteCache } from '../lib/sprite-decoder';
import { getSpriteIndex } from './ui-primitives';
import type { SpriteGroup } from '../store/store-types';
import type { FrameGroup } from '../lib/types';

const TILE = 32;
const MIN_TRAY_HEIGHT = 120;
const DEFAULT_TRAY_HEIGHT = 260;
const MAX_TRAY_HEIGHT_RATIO = 0.75;

function GroupRow({ group, index, placed }: { group: SpriteGroup; index: number; placed: boolean }) {
  const spriteData = useOBStore((s) => s.spriteData);
  const spriteOverrides = useOBStore((s) => s.spriteOverrides);
  const removeSpriteGroup = useOBStore((s) => s.removeSpriteGroup);

  if (!spriteData) return null;

  const handleDragStart = (e: React.DragEvent) => {
    useOBStore.setState({ draggingSpriteGroupId: group.id });
    e.dataTransfer.setData('application/x-sprite-group', JSON.stringify(group));
    e.dataTransfer.setData('text/plain', `sprite-group:${group.id}`);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleDragEnd = () => {
    useOBStore.setState({ draggingSpriteGroupId: null });
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      className={`group flex items-center gap-1.5 px-1.5 py-1 rounded border transition-colors cursor-grab active:cursor-grabbing
        ${placed
          ? 'border-green-500/40 bg-green-500/10'
          : 'border-emperia-border bg-emperia-surface hover:border-emperia-accent/50'
        }`}
      title={`${group.label} (${group.cols}×${group.rows}) — drag onto canvas to place`}
    >
      <span className={`text-[10px] font-mono w-4 text-right shrink-0 ${placed ? 'text-green-400' : 'text-emperia-muted'}`}>
        {index}
      </span>

      <div
        className="grid shrink-0 checkerboard rounded"
        style={{
          gridTemplateColumns: `repeat(${group.cols}, ${TILE}px)`,
          gap: 1,
        }}
      >
        {group.spriteIds.map((sid, i) => {
          const url = sid > 0 ? getSpriteDataUrl(spriteData, sid, spriteOverrides) : null;
          return (
            <div key={i} className="flex items-center justify-center" style={{ width: TILE, height: TILE }}>
              {url ? (
                <img src={url} alt="" draggable={false} className="w-8 h-8 pointer-events-none" style={{ imageRendering: 'pixelated' }} />
              ) : (
                <div className="w-8 h-8 bg-emperia-border/20 rounded-sm" />
              )}
            </div>
          );
        })}
      </div>

      <div className="flex-1 min-w-0 flex flex-col">
        <span className={`text-[9px] truncate ${placed ? 'text-green-300' : 'text-emperia-muted'}`}>
          {group.label}
        </span>
        <span className="text-[8px] text-emperia-muted/50">{group.cols}×{group.rows}</span>
      </div>

      {placed && (
        <span className="text-[8px] text-green-400 shrink-0">✓</span>
      )}

      <button
        onClick={(e) => { e.stopPropagation(); removeSpriteGroup(group.id); }}
        className="p-0.5 rounded text-emperia-muted/30 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all shrink-0"
        title="Remove group"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

/**
 * Place a sprite group's tiles into the correct frame group sprite slots.
 * Group spriteIds are row-major (top-left to bottom-right).
 * OTB tile coords are flipped: tx=width-1 is left, ty=height-1 is top.
 */
function placeGroupOnFrame(
  fg: FrameGroup,
  sg: SpriteGroup,
  frame: number,
  px: number,
  py: number,
): boolean {
  let placed = false;
  for (let row = 0; row < sg.rows; row++) {
    for (let col = 0; col < sg.cols; col++) {
      const sid = sg.spriteIds[row * sg.cols + col];
      if (sid <= 0) continue;

      const cellOffsetX = Math.floor(col / fg.width);
      const cellOffsetY = Math.floor(row / fg.height);
      const tileInCellCol = col % fg.width;
      const tileInCellRow = row % fg.height;

      const targetPx = px + cellOffsetX;
      const targetPy = py + cellOffsetY;
      if (targetPx >= fg.patternX || targetPy >= fg.patternY) continue;

      const tx = fg.width - 1 - tileInCellCol;
      const ty = fg.height - 1 - tileInCellRow;
      const idx = getSpriteIndex(fg, frame, targetPx, targetPy, 0, 0, tx, ty);
      if (idx >= 0 && idx < fg.sprites.length) {
        fg.sprites[idx] = sid;
        placed = true;
      }
    }
  }
  return placed;
}

export function SpriteGroupTray() {
  const spriteGroups = useOBStore((s) => s.spriteGroups);
  const clearSpriteGroups = useOBStore((s) => s.clearSpriteGroups);
  const selectedId = useOBStore((s) => s.selectedThingId);
  const objectData = useOBStore((s) => s.objectData);
  const editVersion = useOBStore((s) => s.editVersion);
  const [trayHeight, setTrayHeight] = useState(DEFAULT_TRAY_HEIGHT);
  const resizeStartRef = useRef<{ y: number; height: number } | null>(null);

  const thing = selectedId != null ? objectData?.things.get(selectedId) ?? null : null;

  // Collect all sprite IDs used by the currently selected thing
  const usedSpriteIds = useMemo(() => {
    const used = new Set<number>();
    if (!thing) return used;
    for (const fg of thing.frameGroups) {
      for (const sid of fg.sprites) {
        if (sid > 0) used.add(sid);
      }
    }
    return used;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thing, editVersion]);

  // Determine which groups have ALL their non-zero sprites placed on the current thing
  const placedSet = useMemo(() => {
    const set = new Set<number>();
    for (const g of spriteGroups) {
      const nonZero = g.spriteIds.filter(s => s > 0);
      if (nonZero.length > 0 && nonZero.every(s => usedSpriteIds.has(s))) {
        set.add(g.id);
      }
    }
    return set;
  }, [spriteGroups, usedSpriteIds]);

  // Fill all unplaced groups into sequential animation frames
  const handleFillFrames = useCallback(() => {
    if (!thing) return;
    // Use the active frame group (idle = 0 for items, may differ for outfits)
    const fgIndex = 0;
    const fg = thing.frameGroups[fgIndex];
    if (!fg) return;

    const unplaced = spriteGroups.filter(g => !placedSet.has(g.id));
    if (unplaced.length === 0) return;

    const maxFrames = fg.animationLength;
    let anyPlaced = false;

    // Find the first empty frame (frame where all tiles in the pattern cell are 0)
    let startFrame = 0;
    for (let f = 0; f < maxFrames; f++) {
      // Check if this frame already has sprites
      const idx = getSpriteIndex(fg, f, 0, 0, 0, 0, 0, 0);
      if (idx < fg.sprites.length && fg.sprites[idx] > 0) {
        startFrame = f + 1;
      } else {
        break;
      }
    }

    for (let i = 0; i < unplaced.length; i++) {
      const frame = startFrame + i;
      if (frame >= maxFrames) break;
      if (placeGroupOnFrame(fg, unplaced[i], frame, 0, 0)) {
        anyPlaced = true;
      }
    }

    if (anyPlaced) {
      thing.rawBytes = undefined;
      clearSpriteCache();
      const store = useOBStore.getState();
      const newDirtyIds = new Set(store.dirtyIds);
      newDirtyIds.add(thing.id);
      useOBStore.setState({ dirty: true, dirtyIds: newDirtyIds, editVersion: store.editVersion + 1 });
    }
  }, [thing, spriteGroups, placedSet]);

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      const start = resizeStartRef.current;
      if (!start) return;
      const maxHeight = Math.max(MIN_TRAY_HEIGHT, Math.floor(window.innerHeight * MAX_TRAY_HEIGHT_RATIO));
      const nextHeight = start.height + (start.y - e.clientY);
      setTrayHeight(Math.min(maxHeight, Math.max(MIN_TRAY_HEIGHT, nextHeight)));
    };
    const handlePointerUp = () => {
      resizeStartRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, []);

  if (spriteGroups.length === 0) return null;

  const unplacedCount = spriteGroups.length - placedSet.size;

  return (
    <div className="border-t border-emperia-border shrink-0 flex flex-col" style={{ height: trayHeight }}>
      <div
        className="h-2 -mt-px flex items-center justify-center cursor-ns-resize text-emperia-muted/40 hover:text-emperia-accent hover:bg-emperia-hover/60 transition-colors"
        onPointerDown={(e) => {
          resizeStartRef.current = { y: e.clientY, height: trayHeight };
          document.body.style.cursor = 'ns-resize';
          document.body.style.userSelect = 'none';
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        title="Drag to resize sprite groups"
      >
        <GripHorizontal className="w-4 h-4" />
      </div>
      <div className="px-2 py-1 flex items-center justify-between">
        <span className="text-[10px] font-medium text-emperia-text uppercase tracking-wider">
          Sprite Groups
        </span>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-emperia-muted">
            {placedSet.size}/{spriteGroups.length}
          </span>
          {unplacedCount > 0 && thing && (
            <button
              onClick={handleFillFrames}
              className="flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-medium bg-emperia-accent/10 text-emperia-accent hover:bg-emperia-accent/20 transition-colors"
              title={`Place ${unplacedCount} unplaced group(s) into sequential animation frames`}
            >
              <ArrowDownToLine className="w-3 h-3" />
              Fill Frames
            </button>
          )}
          <button
            onClick={clearSpriteGroups}
            className="text-[10px] text-red-400 hover:text-red-300 transition-colors"
            title="Clear all sprite groups"
          >
            Clear
          </button>
        </div>
      </div>
      <div className="px-1.5 pb-1.5 overflow-y-auto min-h-0 flex-1 flex flex-col gap-1">
        {spriteGroups.map((group, i) => (
          <GroupRow key={group.id} group={group} index={i + 1} placed={placedSet.has(group.id)} />
        ))}
      </div>
    </div>
  );
}
