import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Search, Plus, Trash2, X, Minimize2 } from 'lucide-react';
import { useOBStore } from '../store';
import { clearSpriteCache } from '../lib/sprite-decoder';
import { ObjectSlots } from './ObjectSlots';
import { AtlasCell } from './AtlasCell';

const CELL = 40;
const ATLAS_COLS = 6;

export function ThingSpriteGrid() {
  const selectedId = useOBStore((s) => s.selectedThingId);
  const objectData = useOBStore((s) => s.objectData);
  const spriteData = useOBStore((s) => s.spriteData);
  const spriteOverrides = useOBStore((s) => s.spriteOverrides);
  const focusSpriteId = useOBStore((s) => s.focusSpriteId);

  const [selectedSlot, setSelectedSlot] = useState<{ group: number; index: number } | null>(null);
  const [atlasSearch, setAtlasSearch] = useState('');
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [highlightedSpriteId, setHighlightedSpriteId] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<{ group: number; index: number } | null>(null);
  const [selectedAtlasIds, setSelectedAtlasIds] = useState<Set<number>>(new Set());
  const [lastClickedAtlasId, setLastClickedAtlasId] = useState<number | null>(null);
  const atlasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const thing = selectedId != null ? objectData?.things.get(selectedId) ?? null : null;

  // Import PNG(s) as new atlas sprites (splits into 32×32 tiles)
  const handleImportPNG = useCallback((files: FileList) => {
    const addSprite = useOBStore.getState().addSprite;
    Array.from(files).forEach((file) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;
        const tilesX = Math.max(1, Math.floor(img.width / 32));
        const tilesY = Math.max(1, Math.floor(img.height / 32));
        canvas.width = 32;
        canvas.height = 32;
        const added: number[] = [];
        for (let ty = 0; ty < tilesY; ty++) {
          for (let tx = 0; tx < tilesX; tx++) {
            ctx.clearRect(0, 0, 32, 32);
            ctx.drawImage(img, tx * 32, ty * 32, 32, 32, 0, 0, 32, 32);
            const imgData = ctx.getImageData(0, 0, 32, 32);
            // Skip fully transparent tiles
            let hasPixel = false;
            for (let i = 3; i < imgData.data.length; i += 4) {
              if (imgData.data[i] > 0) { hasPixel = true; break; }
            }
            if (!hasPixel) continue;
            const id = addSprite(imgData);
            if (id != null) added.push(id);
          }
        }
        if (added.length > 0) {
          // Scroll to the first newly added sprite
          setAtlasSearch('');
          setHighlightedSpriteId(added[0]);
          setTimeout(() => setHighlightedSpriteId(null), 2000);
          // Scroll atlas to the new sprite
          if (atlasRef.current && spriteData) {
            const idx = added[0] - 1;
            const row = Math.floor(idx / ATLAS_COLS);
            atlasRef.current.scrollTop = row * CELL;
          }
        }
      };
      img.src = URL.createObjectURL(file);
    });
  }, [spriteData]);

  // Delete a single sprite (right-click context or delete button)
  const handleDeleteSprite = useCallback((spriteId: number) => {
    if (spriteId <= 0) return;
    if (!confirm(`Delete sprite #${spriteId}? It will be replaced with a blank sprite.`)) return;
    useOBStore.getState().deleteSprite(spriteId);
  }, []);

  // Reset slot selection when thing changes
  useEffect(() => { setSelectedSlot(null); }, [selectedId]);

  // Scroll atlas to focusSpriteId when preview is clicked
  useEffect(() => {
    if (focusSpriteId != null && focusSpriteId > 0 && atlasRef.current && spriteData) {
      // Clear search so atlas shows all sprites
      setAtlasSearch('');
      // Scroll to the sprite (it's at index focusSpriteId-1 in the full list)
      const idx = focusSpriteId - 1;
      const row = Math.floor(idx / ATLAS_COLS);
      atlasRef.current.scrollTop = row * CELL;
      setHighlightedSpriteId(focusSpriteId);
      // Clear the focus so it can be triggered again
      useOBStore.setState({ focusSpriteId: null });
      // Clear highlight after a moment
      setTimeout(() => setHighlightedSpriteId(null), 2000);
    }
  }, [focusSpriteId, spriteData]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spriteData, atlasSearch, editVersion]);

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

  // Assign a sprite to a specific slot (shared by click and drag-drop)
  const assignSpriteToSlot = useCallback((slot: { group: number; index: number }, atlasSpriteId: number) => {
    if (!thing) return;
    const fg = thing.frameGroups[slot.group];
    if (!fg) return;

    // Update the sprite ID in the frame group
    fg.sprites[slot.index] = atlasSpriteId;

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
  }, [thing]);

  // Collect all sprite IDs referenced by any thing (for safety checks)
  const usedSpriteIds = useMemo(() => {
    const used = new Set<number>();
    if (!objectData) return used;
    for (const t of objectData.things.values()) {
      for (const fg of t.frameGroups) {
        for (const sid of fg.sprites) {
          if (sid > 0) used.add(sid);
        }
      }
    }
    return used;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objectData, editVersion]);

  // Bulk delete selected atlas sprites with safety warning
  const handleDeleteSelected = useCallback(() => {
    if (selectedAtlasIds.size === 0) return;
    const ids = Array.from(selectedAtlasIds).filter(id => id > 0);
    if (ids.length === 0) return;

    const inUse = ids.filter(id => usedSpriteIds.has(id));
    let msg = `Delete ${ids.length} selected sprite(s)? They will be replaced with blank sprites.`;
    if (inUse.length > 0) {
      msg += `\n\nWARNING: ${inUse.length} of these sprites are referenced by objects and will appear blank in-game!`;
    }
    if (!confirm(msg)) return;

    useOBStore.getState().deleteSprites(ids);
    setSelectedAtlasIds(new Set());
  }, [selectedAtlasIds, usedSpriteIds]);

  // Atlas click handler — supports multi-select with Ctrl/Shift
  const handleAtlasCellClick = useCallback((e: React.MouseEvent, spriteId: number) => {
    // If a slot is selected, assign the sprite to it (original behavior)
    if (selectedSlot && thing) {
      assignSpriteToSlot(selectedSlot, spriteId);
      return;
    }

    if (e.ctrlKey || e.metaKey) {
      // Ctrl+click: toggle single sprite in selection
      setSelectedAtlasIds(prev => {
        const next = new Set(prev);
        if (next.has(spriteId)) next.delete(spriteId); else next.add(spriteId);
        return next;
      });
      setLastClickedAtlasId(spriteId);
    } else if (e.shiftKey && lastClickedAtlasId != null) {
      // Shift+click: select range between last clicked and current
      const startIdx = atlasIds.indexOf(lastClickedAtlasId);
      const endIdx = atlasIds.indexOf(spriteId);
      if (startIdx >= 0 && endIdx >= 0) {
        const lo = Math.min(startIdx, endIdx);
        const hi = Math.max(startIdx, endIdx);
        setSelectedAtlasIds(prev => {
          const next = new Set(prev);
          for (let i = lo; i <= hi; i++) next.add(atlasIds[i]);
          return next;
        });
      }
    } else {
      // Plain click: select single (or deselect if already only selection)
      setSelectedAtlasIds(prev => {
        if (prev.size === 1 && prev.has(spriteId)) return new Set();
        return new Set([spriteId]);
      });
      setLastClickedAtlasId(spriteId);
    }
  }, [selectedSlot, thing, assignSpriteToSlot, lastClickedAtlasId, atlasIds]);

  // Drag-and-drop handlers
  const handleAtlasDragStart = useCallback((e: React.DragEvent, spriteId: number) => {
    e.dataTransfer.setData('application/x-sprite-id', String(spriteId));
    e.dataTransfer.effectAllowed = 'copy';
  }, []);

  const handleSlotDragOver = useCallback((e: React.DragEvent, group: number, index: number) => {
    if (e.dataTransfer.types.includes('application/x-sprite-id')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setDropTarget({ group, index });
    }
  }, []);

  const handleSlotDragLeave = useCallback(() => {
    setDropTarget(null);
  }, []);

  const handleSlotDrop = useCallback((e: React.DragEvent, group: number, index: number) => {
    e.preventDefault();
    setDropTarget(null);
    const raw = e.dataTransfer.getData('application/x-sprite-id');
    const spriteId = parseInt(raw, 10);
    if (!isNaN(spriteId) && spriteId > 0) {
      assignSpriteToSlot({ group, index }, spriteId);
    }
  }, [assignSpriteToSlot]);

  if (!spriteData) {
    return <div className="p-3 text-emperia-muted text-xs">Load files to browse sprites</div>;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Top: Thing's sprite slots */}
      {thing && (
        <ObjectSlots
          thing={thing}
          spriteData={spriteData}
          spriteOverrides={spriteOverrides}
          slots={slots}
          selectedSlot={selectedSlot}
          setSelectedSlot={setSelectedSlot}
          dropTarget={dropTarget}
          onSlotDragOver={handleSlotDragOver}
          onSlotDragLeave={handleSlotDragLeave}
          onSlotDrop={handleSlotDrop}
        />
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
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/gif,image/bmp"
            multiple
            className="hidden"
            onChange={(e) => { if (e.target.files) handleImportPNG(e.target.files); e.target.value = ''; }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-1 rounded hover:bg-emperia-hover text-emperia-muted hover:text-green-400 transition-colors shrink-0"
            title="Add new sprites from PNG (auto-splits into 32×32 tiles)"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              const result = useOBStore.getState().compactSpriteAtlas();
              if (!result) return;
              if (result.removed === 0) {
                alert('Atlas is already compact — no blank or unreferenced sprites found.');
              } else {
                setSelectedAtlasIds(new Set());
                alert(`Compacted atlas: removed ${result.removed} blank/unreferenced sprites.\n${result.oldCount} → ${result.newCount} sprites.\n\nAll references have been remapped.`);
              }
            }}
            className="p-1 rounded hover:bg-emperia-hover text-emperia-muted hover:text-amber-400 transition-colors shrink-0"
            title="Compact atlas — remove blank/unreferenced sprites and remap all references"
          >
            <Minimize2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Selection toolbar */}
        {selectedAtlasIds.size > 0 && (
          <div className="px-2 py-1 border-b border-emperia-border bg-emperia-accent/5 flex items-center gap-2">
            <span className="text-[10px] text-emperia-accent font-medium">
              {selectedAtlasIds.size} selected
            </span>
            <button
              onClick={handleDeleteSelected}
              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
              title="Delete selected sprites (replaces with blank)"
            >
              <Trash2 className="w-3 h-3" />
              Delete
            </button>
            <button
              onClick={() => setSelectedAtlasIds(new Set())}
              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] text-emperia-muted hover:text-emperia-text hover:bg-emperia-hover transition-colors ml-auto"
              title="Clear selection"
            >
              <X className="w-3 h-3" />
              Clear
            </button>
          </div>
        )}

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
              {visibleAtlas.map((spriteId) => (
                <AtlasCell
                  key={spriteId}
                  spriteId={spriteId}
                  spriteData={spriteData}
                  spriteOverrides={spriteOverrides}
                  isHighlighted={spriteId === highlightedSpriteId}
                  isAtlasSelected={selectedAtlasIds.has(spriteId)}
                  hasSelectedSlot={!!selectedSlot}
                  onClick={(e) => handleAtlasCellClick(e, spriteId)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (selectedAtlasIds.size > 1 && selectedAtlasIds.has(spriteId)) {
                      handleDeleteSelected();
                    } else {
                      handleDeleteSprite(spriteId);
                    }
                  }}
                  onDragStart={(e) => handleAtlasDragStart(e, spriteId)}
                  onDelete={() => handleDeleteSprite(spriteId)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
