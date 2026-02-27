import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Search } from 'lucide-react';
import { useOBStore } from '../store';
import { getSpriteDataUrl, clearSpriteCache } from '../lib/sprite-decoder';

const CELL = 40;
const ATLAS_COLS = 6;

export function ThingSpriteGrid() {
  const selectedId = useOBStore((s) => s.selectedThingId);
  const objectData = useOBStore((s) => s.objectData);
  const spriteData = useOBStore((s) => s.spriteData);
  const spriteOverrides = useOBStore((s) => s.spriteOverrides);

  const [selectedSlot, setSelectedSlot] = useState<{ group: number; index: number } | null>(null);
  const [atlasSearch, setAtlasSearch] = useState('');
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const atlasRef = useRef<HTMLDivElement>(null);

  const thing = selectedId != null ? objectData?.things.get(selectedId) ?? null : null;

  // Reset slot selection when thing changes
  useEffect(() => { setSelectedSlot(null); }, [selectedId]);

  const editVersion = useOBStore((s) => s.editVersion);

  // Collect thing's sprite slots (with duplicates — each slot is editable)
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

  // Atlas: all sprite IDs (filtered by search)
  const atlasIds = useMemo(() => {
    if (!spriteData) return [];
    if (atlasSearch) {
      const num = parseInt(atlasSearch, 10);
      if (!isNaN(num)) {
        // Show range around the searched ID
        const ids: number[] = [];
        for (let i = Math.max(1, num - 50); i <= Math.min(spriteData.spriteCount, num + 200); i++) {
          ids.push(i);
        }
        return ids;
      }
    }
    // Return all IDs (virtualized rendering handles performance)
    const ids: number[] = [];
    for (let i = 1; i <= spriteData.spriteCount; i++) ids.push(i);
    return ids;
  }, [spriteData, atlasSearch]);

  const atlasRows = Math.ceil(atlasIds.length / ATLAS_COLS);
  const atlasTotalHeight = atlasRows * CELL;

  const handleAtlasScroll = useCallback(() => {
    if (atlasRef.current) {
      setScrollTop(atlasRef.current.scrollTop);
      setContainerHeight(atlasRef.current.clientHeight);
    }
  }, []);

  useEffect(() => {
    handleAtlasScroll();
    const el = atlasRef.current;
    if (el) {
      const ro = new ResizeObserver(handleAtlasScroll);
      ro.observe(el);
      return () => ro.disconnect();
    }
  }, [handleAtlasScroll]);

  // Jump to sprite ID on search
  useEffect(() => {
    if (atlasSearch && atlasRef.current) {
      const num = parseInt(atlasSearch, 10);
      if (!isNaN(num)) {
        const idx = atlasIds.indexOf(num);
        if (idx >= 0) {
          const row = Math.floor(idx / ATLAS_COLS);
          atlasRef.current.scrollTop = row * CELL;
        }
      }
    }
  }, [atlasSearch, atlasIds]);

  // Visible atlas range
  const startRow = Math.max(0, Math.floor(scrollTop / CELL) - 2);
  const endRow = Math.min(atlasRows, Math.ceil((scrollTop + containerHeight) / CELL) + 2);
  const visibleAtlas = atlasIds.slice(startRow * ATLAS_COLS, endRow * ATLAS_COLS);

  // Assign atlas sprite to selected slot
  const handleAtlasClick = useCallback((atlasSpriteId: number) => {
    if (!selectedSlot || !thing) return;
    const fg = thing.frameGroups[selectedSlot.group];
    if (!fg) return;

    // Update the sprite ID in the frame group
    fg.sprites[selectedSlot.index] = atlasSpriteId;

    // Clear rawBytes to force re-serialization
    thing.rawBytes = undefined;

    // Clear sprite cache so preview re-renders
    clearSpriteCache();

    // Mark dirty
    const store = useOBStore.getState();
    const newDirtyIds = new Set(store.dirtyIds);
    newDirtyIds.add(thing.id);
    useOBStore.setState({
      dirty: true,
      dirtyIds: newDirtyIds,
      editVersion: store.editVersion + 1,
    });
  }, [selectedSlot, thing]);

  if (!spriteData) {
    return <div className="p-3 text-emperia-muted text-xs">Load files to browse sprites</div>;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Top: Thing's sprite slots */}
      {thing && (
        <div className="shrink-0 border-b border-emperia-border">
          <div className="px-2 py-1.5 flex items-center justify-between">
            <span className="text-[10px] font-medium text-emperia-text uppercase tracking-wider">
              Object Sprites
            </span>
            <span className="text-[10px] text-emperia-muted">{slots.length}</span>
          </div>
          <div className="overflow-y-auto max-h-40 px-1.5 pb-1.5">
            <div className="grid grid-cols-6 gap-0.5">
              {slots.map(({ spriteId, group, index }, i) => {
                const url = spriteId > 0 ? getSpriteDataUrl(spriteData, spriteId, spriteOverrides) : null;
                const isSelected = selectedSlot?.group === group && selectedSlot?.index === index;
                const isModified = spriteOverrides.has(spriteId);

                return (
                  <button
                    key={`${group}-${index}`}
                    onClick={() => setSelectedSlot(isSelected ? null : { group, index })}
                    className={`relative flex items-center justify-center rounded border transition-colors
                      ${isSelected
                        ? 'border-emperia-accent bg-emperia-accent/20'
                        : isModified
                          ? 'border-amber-500/50 bg-amber-500/10'
                          : 'border-emperia-border/40 hover:border-emperia-muted'
                      }
                    `}
                    style={{ width: CELL, height: CELL }}
                    title={`Slot ${i} → Sprite #${spriteId}${isSelected ? ' (selected — click atlas sprite to assign)' : ''}`}
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
          {selectedSlot && (
            <div className="px-2 pb-1.5 text-[10px] text-emperia-accent">
              Click a sprite below to assign it to the selected slot
            </div>
          )}
        </div>
      )}

      {/* Bottom: Full sprite atlas */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-2 py-1.5 border-b border-emperia-border flex items-center gap-1.5">
          <span className="text-[10px] font-medium text-emperia-text uppercase tracking-wider shrink-0">
            Sprite Atlas
          </span>
          <div className="flex-1 relative">
            <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-emperia-muted" />
            <input
              type="text"
              value={atlasSearch}
              onChange={(e) => setAtlasSearch(e.target.value)}
              placeholder="Go to ID..."
              className="w-full pl-6 pr-2 py-0.5 bg-emperia-bg border border-emperia-border rounded text-[10px] text-emperia-text placeholder:text-emperia-muted/50 focus:outline-none focus:border-emperia-accent"
            />
          </div>
        </div>

        <div
          ref={atlasRef}
          onScroll={handleAtlasScroll}
          className="flex-1 overflow-y-auto"
        >
          <div style={{ height: atlasTotalHeight, position: 'relative' }}>
            <div
              style={{
                position: 'absolute',
                top: startRow * CELL,
                left: 0,
                right: 0,
                display: 'grid',
                gridTemplateColumns: `repeat(${ATLAS_COLS}, 1fr)`,
              }}
            >
              {visibleAtlas.map((spriteId) => {
                const url = getSpriteDataUrl(spriteData, spriteId, spriteOverrides);

                return (
                  <button
                    key={spriteId}
                    onClick={() => handleAtlasClick(spriteId)}
                    className={`relative flex items-center justify-center border border-transparent transition-colors
                      ${selectedSlot ? 'hover:bg-emperia-accent/10 hover:border-emperia-accent/30 cursor-pointer' : 'cursor-default'}
                    `}
                    style={{ width: CELL, height: CELL }}
                    title={`#${spriteId}`}
                  >
                    {url ? (
                      <img src={url} alt="" className="w-8 h-8" style={{ imageRendering: 'pixelated' }} />
                    ) : (
                      <div className="w-6 h-6" />
                    )}
                    <span className="absolute bottom-0 right-0.5 text-[6px] text-emperia-muted/40 leading-none">
                      {spriteId}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
