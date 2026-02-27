import { useCallback, useRef, useEffect, useState, useMemo } from 'react';
import { useOBStore, getThingsForCategory, getDisplayId } from '../store';
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
  const spriteOverrides = useOBStore((s) => s.spriteOverrides);
  const editVersion = useOBStore((s) => s.editVersion); // re-render on sprite replacement

  const things = useMemo(
    () => getThingsForCategory(objectData, activeCategory, searchQuery, getCategoryRange),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [objectData, activeCategory, searchQuery, getCategoryRange, editVersion],
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
    const top = row * CELL_SIZE;
    const el = containerRef.current;
    if (top < el.scrollTop || top + CELL_SIZE > el.scrollTop + el.clientHeight) {
      el.scrollTop = Math.max(0, top - el.clientHeight / 2 + CELL_SIZE / 2);
    }
  }, [selectedId, things]);

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
            const url = spriteData ? getSpriteDataUrl(spriteData, firstSprite, spriteOverrides) : null;
            const isSelected = thing.id === selectedId;
            const displayId = objectData ? getDisplayId(objectData, thing.id) : thing.id;

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
                title={`#${displayId}`}
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
                  {displayId}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
