import { useCallback, useRef, useEffect, useState, useMemo } from 'react';
import { useOBStore, getThingsForCategory, getDisplayId } from '../store';
import { compositeThingDataUrl } from '../lib/sprite-decoder';
import { useSpriteTooltip } from './SpriteTooltip';

const VISIBLE_BUFFER = 20; // extra items to render above/below viewport

export function ThingGrid() {
  const objectData = useOBStore((s) => s.objectData);
  const activeCategory = useOBStore((s) => s.activeCategory);
  const activeLibrary = useOBStore((s) => s.activeLibrary);
  const searchQuery = useOBStore((s) => s.searchQuery);
  const getCategoryRange = useOBStore((s) => s.getCategoryRange);
  const selectedId = useOBStore((s) => s.selectedThingId);
  const setSelectedId = useOBStore((s) => s.setSelectedThingId);
  const selectedIds = useOBStore((s) => s.selectedThingIds);
  const toggleSelection = useOBStore((s) => s.toggleThingSelection);
  const spriteData = useOBStore((s) => s.spriteData);
  const spriteOverrides = useOBStore((s) => s.spriteOverrides);
  const editVersion = useOBStore((s) => s.editVersion); // re-render on sprite replacement
  const filterGroup = useOBStore((s) => s.filterGroup);
  const cols = useOBStore((s) => s.libraryColumns);
  const itemDefinitions = useOBStore((s) => s.itemDefinitions);
  const appearanceToItemIds = useOBStore((s) => s.appearanceToItemIds);
  const hairDefinitions = useMemo(
    () => Array.from(objectData?.hairDefinitions.values() ?? []),
    [objectData, editVersion],
  );
  const setSelectedHairId = useOBStore((s) => s.setSelectedHairId);

  const tooltip = useSpriteTooltip(spriteData, spriteOverrides);

  const things = useMemo(
    () => getThingsForCategory(objectData, activeCategory, searchQuery, filterGroup, getCategoryRange, itemDefinitions, appearanceToItemIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [objectData, activeCategory, activeLibrary, searchQuery, filterGroup, getCategoryRange, itemDefinitions, appearanceToItemIds, editVersion],
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [containerWidth, setContainerWidth] = useState(240);

  // Compute grid layout
  const cellSize = Math.max(40, Math.floor(containerWidth / cols));
  const totalRows = Math.ceil(things.length / cols);
  const totalHeight = totalRows * cellSize;

  // Visible range
  const startRow = Math.max(0, Math.floor(scrollTop / cellSize) - VISIBLE_BUFFER);
  const endRow = Math.min(totalRows, Math.ceil((scrollTop + containerHeight) / cellSize) + VISIBLE_BUFFER);
  const startIdx = startRow * cols;
  const endIdx = Math.min(things.length, endRow * cols);
  const visibleThings = things.slice(startIdx, endIdx);

  const handleScroll = useCallback(() => {
    if (containerRef.current) {
      setScrollTop(containerRef.current.scrollTop);
    }
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateSize = () => {
      setContainerHeight(el.clientHeight);
      setContainerWidth(el.clientWidth);
    };
    const obs = new ResizeObserver(updateSize);
    obs.observe(el);
    updateSize();
    return () => obs.disconnect();
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!things.length || selectedId == null) return;
      // Don't capture when an input/textarea/select is focused
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const idx = things.findIndex((t) => t.id === selectedId);
      if (idx < 0) return;
      let next = idx;
      switch (e.key) {
        case 'ArrowRight': next = Math.min(things.length - 1, idx + 1); break;
        case 'ArrowLeft': next = Math.max(0, idx - 1); break;
        case 'ArrowDown': next = Math.min(things.length - 1, idx + cols); break;
        case 'ArrowUp': next = Math.max(0, idx - cols); break;
        default: return;
      }
      if (next !== idx) {
        e.preventDefault();
        setSelectedId(things[next].id);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [things, selectedId, setSelectedId]);

  // Auto-scroll to selected thing when it changes
  useEffect(() => {
    if (selectedId == null || !containerRef.current) return;
    const idx = things.findIndex((t) => t.id === selectedId);
    if (idx < 0) return;
    const row = Math.floor(idx / cols);
    const top = row * cellSize;
    const el = containerRef.current;
    if (top < el.scrollTop || top + cellSize > el.scrollTop + el.clientHeight) {
      el.scrollTop = Math.max(0, top - el.clientHeight / 2 + cellSize / 2);
    }
  }, [selectedId, things, cols, cellSize]);

  return (<>
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto"
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div
          style={{
            position: 'absolute',
            top: startRow * cellSize,
            left: 0,
            right: 0,
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
          }}
        >
          {visibleThings.map((thing) => {
            const previewGroup = thing.frameGroups[0];
            const previewWidth = previewGroup?.width || 1;
            const previewHeight = previewGroup?.height || 1;
            const previewTileCount = previewWidth * previewHeight;
            const facesSouth = (
              thing.category === 'outfit'
              || thing.category === 'equipment'
              || thing.category === 'hair'
            ) && (previewGroup?.patternX ?? 0) > 2;
            const previewDirection = facesSouth ? 2 : 0;
            const previewOffset = previewGroup
              ? previewDirection * Math.max(1, previewGroup.layers) * previewTileCount
              : 0;
            const previewSprites = previewGroup?.sprites.slice(
              previewOffset,
              previewOffset + previewTileCount,
            ) ?? [];
            const url = spriteData && previewGroup
              ? compositeThingDataUrl(
                  spriteData,
                  thing.id,
                  previewWidth,
                  previewHeight,
                  previewSprites,
                  spriteOverrides,
                )
              : null;
            const isSelected = thing.id === selectedId;
            const displayId = objectData ? getDisplayId(objectData, thing.id) : thing.id;
            const itemId = appearanceToItemIds?.get(thing.id);
            const def = itemId != null ? itemDefinitions?.get(itemId) : undefined;
            const itemName = def?.properties?.name;
            const publicId = activeCategory === 'item' ? (itemId ?? displayId) : displayId;
            const tipText = itemName ? `#${publicId} — ${itemName}` : `#${publicId}`;

            const isMultiSelected = selectedIds.has(thing.id);
            return (
              <button
                key={thing.id}
                onClick={(e) => {
                  if (e.ctrlKey || e.metaKey) {
                    toggleSelection(thing.id);
                  } else if (e.shiftKey && selectedId != null) {
                    const startIdx = things.findIndex((t) => t.id === selectedId);
                    const endIdx = things.findIndex((t) => t.id === thing.id);
                    if (startIdx >= 0 && endIdx >= 0) {
                      const lo = Math.min(startIdx, endIdx);
                      const hi = Math.max(startIdx, endIdx);
                      const rangeIds = things.slice(lo, hi + 1).map((t) => t.id);
                      toggleSelection(thing.id, rangeIds);
                    }
                  } else {
                    setSelectedId(thing.id);
                    if (activeLibrary === 'hair' && objectData) {
                      const hair = hairDefinitions.find((entry) => entry.appearanceId === getDisplayId(objectData, thing.id));
                      if (hair) setSelectedHairId(hair.hairId);
                    }
                  }
                }}
                className={`
                  relative flex items-center justify-center
                  border transition-colors
                  ${isSelected
                    ? 'bg-emperia-accent/20 border-emperia-accent'
                    : isMultiSelected
                      ? 'bg-emperia-accent/10 border-emperia-accent/50'
                      : 'border-transparent hover:bg-emperia-hover'
                  }
                `}
                style={{ width: cellSize, height: cellSize }}
                title={tipText}
                onMouseEnter={(e) => {
                  if (previewGroup && (previewWidth > 1 || previewHeight > 1)) {
                    tooltip.showThing(
                      thing.id,
                      { ...previewGroup, patternX: 1, sprites: previewSprites },
                      tipText,
                      e,
                    );
                  } else {
                    tooltip.show(previewSprites.find((spriteId) => spriteId > 0) ?? 0, tipText, e);
                  }
                }}
                onMouseMove={tooltip.move}
                onMouseLeave={tooltip.hide}
              >
                {url ? (
                  <img
                    src={url}
                    alt=""
                    className="pixelated"
                    style={{
                      imageRendering: 'pixelated',
                      width: Math.max(32, cellSize - 8),
                      height: Math.max(32, cellSize - 8),
                      objectFit: 'contain',
                    }}
                  />
                ) : (
                  <div
                    className="rounded-sm bg-emperia-border/30"
                    style={{
                      width: Math.max(32, cellSize - 8),
                      height: Math.max(32, cellSize - 8),
                    }}
                  />
                )}
                <span className="absolute bottom-0 right-0.5 text-[8px] text-emperia-muted/60 leading-none">
                  {publicId}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
    {tooltip.portal}
  </>);
}
