import { useCallback, useRef, useEffect, useState, useMemo } from 'react';
import { useOBStore, getThingsForCategory } from '../store';
import { getSpriteDataUrl } from '../lib/sprite-decoder';

const CELL_SIZE = 40;
const VISIBLE_BUFFER = 20; // extra items to render above/below viewport

export function ThingGrid() {
  const objectData = useOBStore((s) => s.objectData);
  const activeCategory = useOBStore((s) => s.activeCategory);
  const searchQuery = useOBStore((s) => s.searchQuery);
  const getCategoryRange = useOBStore((s) => s.getCategoryRange);
  const selectedId = useOBStore((s) => s.selectedThingId);
  const setSelectedId = useOBStore((s) => s.setSelectedThingId);
  const spriteData = useOBStore((s) => s.spriteData);

  const things = useMemo(
    () => getThingsForCategory(objectData, activeCategory, searchQuery, getCategoryRange),
    [objectData, activeCategory, searchQuery, getCategoryRange],
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  // Compute grid layout
  const cols = 6;
  const totalRows = Math.ceil(things.length / cols);
  const totalHeight = totalRows * CELL_SIZE;

  // Visible range
  const startRow = Math.max(0, Math.floor(scrollTop / CELL_SIZE) - VISIBLE_BUFFER);
  const endRow = Math.min(totalRows, Math.ceil((scrollTop + containerHeight) / CELL_SIZE) + VISIBLE_BUFFER);
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
    const obs = new ResizeObserver(() => setContainerHeight(el.clientHeight));
    obs.observe(el);
    setContainerHeight(el.clientHeight);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto"
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div
          style={{
            position: 'absolute',
            top: startRow * CELL_SIZE,
            left: 0,
            right: 0,
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
          }}
        >
          {visibleThings.map((thing) => {
            const firstSprite = thing.frameGroups[0]?.sprites[0] ?? 0;
            const url = spriteData ? getSpriteDataUrl(spriteData, firstSprite) : null;
            const isSelected = thing.id === selectedId;

            return (
              <button
                key={thing.id}
                onClick={() => setSelectedId(thing.id)}
                className={`
                  relative flex items-center justify-center
                  border border-transparent transition-colors
                  ${isSelected
                    ? 'bg-emperia-accent/20 border-emperia-accent'
                    : 'hover:bg-emperia-hover'
                  }
                `}
                style={{ width: CELL_SIZE, height: CELL_SIZE }}
                title={`#${thing.id}`}
              >
                {url ? (
                  <img
                    src={url}
                    alt=""
                    className="w-8 h-8 pixelated"
                    style={{ imageRendering: 'pixelated' }}
                  />
                ) : (
                  <div className="w-8 h-8 bg-emperia-border/30 rounded-sm" />
                )}
                <span className="absolute bottom-0 right-0.5 text-[8px] text-emperia-muted/60 leading-none">
                  {thing.id}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
