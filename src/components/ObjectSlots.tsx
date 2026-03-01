import { useCallback, useMemo, useRef } from 'react';
import { getSpriteDataUrl } from '../lib/sprite-decoder';
import { useOBStore } from '../store';
import type { SpriteData } from '../lib/types';

const CELL = 40;

export function ObjectSlots() {
  const selectedId = useOBStore((s) => s.selectedThingId);
  const objectData = useOBStore((s) => s.objectData);
  const spriteData = useOBStore((s) => s.spriteData);
  const spriteOverrides = useOBStore((s) => s.spriteOverrides);
  const selectedSlots = useOBStore((s) => s.selectedSlots);
  const editVersion = useOBStore((s) => s.editVersion);

  const thing = selectedId != null ? objectData?.things.get(selectedId) ?? null : null;
  const lastClickedRef = useRef<number>(-1);

  const slots = useMemo(() => {
    if (!thing) return [];
    const result: { spriteId: number; group: number; index: number }[] = [];
    thing.frameGroups.forEach((fg, gi) => {
      fg.sprites.forEach((spriteId, si) => {
        result.push({ spriteId, group: gi, index: si });
      });
    });
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thing, editVersion]);

  const isSlotSelected = useCallback((group: number, index: number) => {
    return selectedSlots.some(s => s.group === group && s.index === index);
  }, [selectedSlots]);

  const handleSlotClick = useCallback((e: React.MouseEvent, group: number, index: number, flatIdx: number) => {
    const slot = { group, index };
    if (e.ctrlKey || e.metaKey) {
      // Toggle single slot
      const already = isSlotSelected(group, index);
      const next = already
        ? selectedSlots.filter(s => !(s.group === group && s.index === index))
        : [...selectedSlots, slot];
      useOBStore.setState({ selectedSlots: next });
      lastClickedRef.current = flatIdx;
    } else if (e.shiftKey && lastClickedRef.current >= 0) {
      // Range select
      const lo = Math.min(lastClickedRef.current, flatIdx);
      const hi = Math.max(lastClickedRef.current, flatIdx);
      const rangeSlots = slots.slice(lo, hi + 1).map(s => ({ group: s.group, index: s.index }));
      // Merge with existing (union)
      const merged = [...selectedSlots];
      for (const rs of rangeSlots) {
        if (!merged.some(s => s.group === rs.group && s.index === rs.index)) {
          merged.push(rs);
        }
      }
      useOBStore.setState({ selectedSlots: merged });
    } else {
      // Plain click: toggle single or select only this
      const already = isSlotSelected(group, index);
      if (already && selectedSlots.length === 1) {
        useOBStore.setState({ selectedSlots: [] });
      } else {
        useOBStore.setState({ selectedSlots: [slot] });
      }
      lastClickedRef.current = flatIdx;
    }
  }, [selectedSlots, isSlotSelected, slots]);

  if (!thing || !spriteData || slots.length === 0) return null;

  return (
    <div className="shrink-0 border-b border-emperia-border">
      <div className="px-2 py-1.5 flex items-center justify-between">
        <span className="text-[10px] font-medium text-emperia-text uppercase tracking-wider">
          Object Sprites
        </span>
        <span className="text-[10px] text-emperia-muted">
          {selectedSlots.length > 0 ? `${selectedSlots.length} selected` : slots.length}
        </span>
      </div>
      <div className="overflow-y-auto max-h-48 px-1.5 pb-1.5">
        <div className="grid grid-cols-6 gap-0.5">
          {slots.map(({ spriteId, group, index }, i) => {
            const url = spriteId > 0 ? getSpriteDataUrl(spriteData, spriteId, spriteOverrides) : null;
            const selected = isSlotSelected(group, index);
            const isModified = spriteOverrides.has(spriteId);

            return (
              <button
                key={`${group}-${index}`}
                onClick={(e) => handleSlotClick(e, group, index, i)}
                className={`relative flex items-center justify-center rounded border transition-colors
                  ${selected
                    ? 'border-emperia-accent bg-emperia-accent/20'
                    : isModified
                      ? 'border-amber-500/50 bg-amber-500/10'
                      : 'border-emperia-border/40 hover:border-emperia-muted'
                  }
                `}
                style={{ width: CELL, height: CELL }}
                title={`Slot ${i} → Sprite #${spriteId}${selected ? ' (selected — click atlas sprite to assign)' : '\nClick to select, Ctrl+click multi-select, Shift+click range'}`}
              >
                {url ? (
                  <img src={url} alt="" className="w-8 h-8" style={{ imageRendering: 'pixelated' }} />
                ) : (
                  <div className="w-8 h-8 bg-emperia-border/20 rounded-sm" />
                )}
                <span className="absolute bottom-0 right-0.5 text-[6px] text-emperia-muted/50 leading-none">
                  {spriteId}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {selectedSlots.length > 0 && (
        <div className="px-2 pb-1.5 flex items-center gap-2">
          <span className="text-[10px] text-emperia-accent">
            Click an atlas sprite to assign to {selectedSlots.length > 1 ? `${selectedSlots.length} slots` : 'slot'}
          </span>
          <button
            onClick={() => useOBStore.setState({ selectedSlots: [] })}
            className="text-[10px] text-emperia-muted hover:text-emperia-text ml-auto"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
