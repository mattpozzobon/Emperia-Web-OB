import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Grid3X3, ImageDown, ImageUp, Download, Upload, Crop, Eye, Copy, ClipboardPaste } from 'lucide-react';
import { useOBStore, getDisplayId } from '../store';
import { decodeSprite, clearSpriteCache } from '../lib/sprite-decoder';
import { applyOutfitMask, paletteToCSS, OUTFIT_PALETTE, PALETTE_SIZE } from '../lib/outfit-colors';
import { encodeOBD, decodeOBD } from '../lib/obd';
import type { OutfitColorIndices } from '../lib/outfit-colors';
import type { FrameGroup } from '../lib/types';

const DIRECTION_LABELS = ['North', 'East', 'South', 'West', 'NE', 'SE', 'SW', 'NW'];
const DIRECTION_ARROWS = ['↑', '→', '↓', '←', '↗', '↘', '↙', '↖'];

export function SpritePreview() {
  const selectedId = useOBStore((s) => s.selectedThingId);
  const objectData = useOBStore((s) => s.objectData);
  const spriteData = useOBStore((s) => s.spriteData);
  const spriteOverrides = useOBStore((s) => s.spriteOverrides);
  const replaceSprite = useOBStore((s) => s.replaceSprite);
  const addSprite = useOBStore((s) => s.addSprite);
  useOBStore((s) => s.editVersion);

  const thing = selectedId != null ? objectData?.things.get(selectedId) ?? null : null;

  const [activeGroup, setActiveGroup] = useState(0);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(4);
  const [showGrid, setShowGrid] = useState(false);
  const [showCropSize, setShowCropSize] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [dragTile, setDragTile] = useState<{ col: number; row: number } | null>(null);
  const [activeLayer, setActiveLayer] = useState(0);
  const [activeZ, setActiveZ] = useState(0);
  const [blendLayers, setBlendLayers] = useState(false);
  const [outfitColors, setOutfitColors] = useState<OutfitColorIndices>({ head: 0, body: 0, legs: 0, feet: 0 });
  const [previewMode, setPreviewMode] = useState(false); // true = single direction/pattern preview
  const [activeDirection, setActiveDirection] = useState(2); // 0=N,1=E,2=S,3=W — default south
  const [activePatternY, setActivePatternY] = useState(0);
  const [showColorPicker, setShowColorPicker] = useState<keyof OutfitColorIndices | null>(null);
  const [copyMenuOpen, setCopyMenuOpen] = useState(false);
  const copyMenuRef = useRef<HTMLDivElement>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameTimerRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const category = useOBStore((s) => s.activeCategory);
  const isOutfit = category === 'outfit';
  const isEffect = category === 'effect';
  const isDistance = category === 'distance';

  useEffect(() => {
    setActiveGroup(0);
    setCurrentFrame(0);
    setPlaying(false);
    setActiveLayer(0);
    setActiveZ(0);
    setActiveDirection(2);
    setActivePatternY(0);
    // Default outfits to preview mode, items to pattern mode
    setPreviewMode(isOutfit || isEffect || isDistance);
    // Default outfits to blend layers
    setBlendLayers(isOutfit);
  }, [selectedId, isOutfit, isEffect, isDistance]);

  // Close copy menu on outside click
  useEffect(() => {
    if (!copyMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (copyMenuRef.current && !copyMenuRef.current.contains(e.target as Node)) {
        setCopyMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [copyMenuOpen]);

  const group: FrameGroup | null = thing?.frameGroups[activeGroup] ?? null;

  const renderFrame = useCallback((frame: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !group || !spriteData) return;

    const cellW = group.width * 32;
    const cellH = group.height * 32;

    // In preview mode, render a single direction/pattern; otherwise render all
    const pxRange = previewMode ? [activeDirection < group.patternX ? activeDirection : 0] : Array.from({ length: group.patternX }, (_, i) => i);
    const pyRange = previewMode ? [activePatternY < group.patternY ? activePatternY : 0] : Array.from({ length: group.patternY }, (_, i) => i);

    const colsRendered = pxRange.length;
    const rowsRendered = pyRange.length;
    const totalW = colsRendered * cellW;
    const totalH = rowsRendered * cellH;
    canvas.width = totalW;
    canvas.height = totalH;

    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, totalW, totalH);

    // Determine which layers to render
    const useOutfitMask = isOutfit && blendLayers && group.layers >= 2;
    const layersToRender = useOutfitMask
      ? [0] // We'll handle mask compositing manually
      : blendLayers
        ? Array.from({ length: group.layers }, (_, i) => i)
        : [activeLayer];

    for (const layer of layersToRender) {
      for (let pyIdx = 0; pyIdx < pyRange.length; pyIdx++) {
        const py = pyRange[pyIdx];
        for (let pxIdx = 0; pxIdx < pxRange.length; pxIdx++) {
          const px = pxRange[pxIdx];
          const baseX = pxIdx * cellW;
          const baseY = pyIdx * cellH;

          for (let ty = 0; ty < group.height; ty++) {
            for (let tx = 0; tx < group.width; tx++) {
              const idx = getSpriteIndex(group, frame, px, py, activeZ, layer, tx, ty);
              if (idx >= group.sprites.length) continue;
              const spriteId = group.sprites[idx];
              if (spriteId <= 0) continue;

              const rawData = spriteOverrides.get(spriteId) ?? decodeSprite(spriteData, spriteId);
              if (!rawData) continue;

              // Clone the ImageData so we don't mutate the cache
              const imgData = new ImageData(new Uint8ClampedArray(rawData.data), 32, 32);

              // Apply outfit color mask if applicable
              if (useOutfitMask) {
                const maskIdx = getSpriteIndex(group, frame, px, py, activeZ, 1, tx, ty);
                if (maskIdx < group.sprites.length) {
                  const maskSpriteId = group.sprites[maskIdx];
                  if (maskSpriteId > 0) {
                    const maskRaw = spriteOverrides.get(maskSpriteId) ?? decodeSprite(spriteData, maskSpriteId);
                    if (maskRaw) {
                      applyOutfitMask(imgData, maskRaw, outfitColors);
                    }
                  }
                }
              }

              const dx = baseX + (group.width - 1 - tx) * 32;
              const dy = baseY + (group.height - 1 - ty) * 32;

              if ((blendLayers && !useOutfitMask && layer > 0)) {
                const tmp = document.createElement('canvas');
                tmp.width = 32; tmp.height = 32;
                tmp.getContext('2d')!.putImageData(imgData, 0, 0);
                ctx.drawImage(tmp, dx, dy);
              } else {
                ctx.putImageData(imgData, dx, dy);
              }
            }
          }
        }
      }
    }
  }, [group, spriteData, spriteOverrides, activeLayer, activeZ, blendLayers, previewMode, activeDirection, activePatternY, isOutfit, outfitColors]);

  useEffect(() => {
    renderFrame(currentFrame);
  }, [currentFrame, renderFrame]);

  useEffect(() => {
    if (!playing || !group || group.animationLength <= 1) return;
    let frame = currentFrame;
    const tick = () => {
      frame = (frame + 1) % group.animationLength;
      setCurrentFrame(frame);
      renderFrame(frame);
      const duration = group.animationLengths[frame]?.min ?? 200;
      frameTimerRef.current = window.setTimeout(tick, duration);
    };
    const duration = group.animationLengths[frame]?.min ?? 200;
    frameTimerRef.current = window.setTimeout(tick, duration);
    return () => { clearTimeout(frameTimerRef.current); };
  }, [playing, group, renderFrame]);

  // How many pattern columns/rows are actually rendered
  const renderedPxCount = group ? (previewMode ? 1 : group.patternX) : 1;
  const renderedPyCount = group ? (previewMode ? 1 : group.patternY) : 1;

  // Given a pixel position on the displayed canvas, find the sprite ID at that tile
  const getSpriteAtPosition = useCallback((clientX: number, clientY: number): number => {
    if (!group || !canvasRef.current) return 0;
    const rect = canvasRef.current.getBoundingClientRect();
    const canvasPixelX = (clientX - rect.left) / zoom;
    const canvasPixelY = (clientY - rect.top) / zoom;

    const tileCol = Math.floor(canvasPixelX / 32);
    const tileRow = Math.floor(canvasPixelY / 32);

    const totalCols = renderedPxCount * group.width;
    const totalRows = renderedPyCount * group.height;
    if (tileCol < 0 || tileCol >= totalCols || tileRow < 0 || tileRow >= totalRows) return 0;

    // In preview mode the rendered pattern is a single cell
    const cellCol = Math.floor(tileCol / group.width);
    const cellRow = Math.floor(tileRow / group.height);
    const px = previewMode ? (activeDirection < group.patternX ? activeDirection : 0) : cellCol;
    const py = previewMode ? (activePatternY < group.patternY ? activePatternY : 0) : cellRow;

    const tx = group.width - 1 - (tileCol % group.width);
    const ty = group.height - 1 - (tileRow % group.height);

    const idx = getSpriteIndex(group, currentFrame, px, py, activeZ, activeLayer, tx, ty);
    return idx < group.sprites.length ? group.sprites[idx] : 0;
  }, [group, zoom, currentFrame, activeLayer, activeZ, previewMode, activeDirection, activePatternY, renderedPxCount, renderedPyCount]);

  // Given a pixel position on the displayed canvas, find the sprite slot index
  const getSlotIndexAtPosition = useCallback((clientX: number, clientY: number): number => {
    if (!group || !canvasRef.current) return -1;
    const rect = canvasRef.current.getBoundingClientRect();
    const canvasPixelX = (clientX - rect.left) / zoom;
    const canvasPixelY = (clientY - rect.top) / zoom;

    const tileCol = Math.floor(canvasPixelX / 32);
    const tileRow = Math.floor(canvasPixelY / 32);

    const totalCols = renderedPxCount * group.width;
    const totalRows = renderedPyCount * group.height;
    if (tileCol < 0 || tileCol >= totalCols || tileRow < 0 || tileRow >= totalRows) return -1;

    const cellCol = Math.floor(tileCol / group.width);
    const cellRow = Math.floor(tileRow / group.height);
    const px = previewMode ? (activeDirection < group.patternX ? activeDirection : 0) : cellCol;
    const py = previewMode ? (activePatternY < group.patternY ? activePatternY : 0) : cellRow;

    const tx = group.width - 1 - (tileCol % group.width);
    const ty = group.height - 1 - (tileRow % group.height);

    const idx = getSpriteIndex(group, currentFrame, px, py, activeZ, activeLayer, tx, ty);
    return idx < group.sprites.length ? idx : -1;
  }, [group, zoom, currentFrame, activeLayer, activeZ, previewMode, activeDirection, activePatternY, renderedPxCount, renderedPyCount]);

  const handleImageFiles = useCallback((files: FileList, dropX?: number, dropY?: number) => {
    if (!group || !spriteData) return;
    const file = files[0];
    if (!file || !file.type.startsWith('image/')) return;
    const img = new Image();
    img.onload = () => {
      const tc = document.createElement('canvas');
      tc.width = 32; tc.height = 32;
      const tctx = tc.getContext('2d')!;

      // Helper: replace an existing sprite or allocate a new one for empty (0) slots
      const assignSprite = (idx: number, imgData: ImageData) => {
        const spriteId = group.sprites[idx];
        if (spriteId > 0) {
          replaceSprite(spriteId, imgData);
        } else {
          // Slot is 0 (empty) — allocate a new sprite and wire it in
          const newId = addSprite(imgData);
          if (newId != null) {
            group.sprites[idx] = newId;
            // Mark thing as dirty so it gets recompiled
            if (thing) {
              const dirtyIds = new Set(useOBStore.getState().dirtyIds);
              dirtyIds.add(thing.id);
              useOBStore.setState({ dirty: true, dirtyIds });
            }
          }
        }
      };

      if (img.width <= 32 && img.height <= 32) {
        // Single tile — replace the sprite at the drop position
        tctx.clearRect(0, 0, 32, 32);
        tctx.drawImage(img, 0, 0, 32, 32);
        const imgData = tctx.getImageData(0, 0, 32, 32);

        let targetIdx = -1;
        if (dropX != null && dropY != null) {
          const sid = getSpriteAtPosition(dropX, dropY);
          if (sid > 0) {
            // Find the index for this sprite ID so we can use assignSprite
            targetIdx = group.sprites.indexOf(sid);
          }
        }
        // Fallback: first sprite slot of the current frame
        if (targetIdx < 0) {
          targetIdx = getSpriteIndex(group, currentFrame, 0, 0, 0, 0, 0, 0);
        }
        if (targetIdx >= 0 && targetIdx < group.sprites.length) {
          assignSprite(targetIdx, imgData);
        }
      } else {
        // Larger image — auto-slice across the full pattern grid
        const totalCols = group.patternX * group.width;
        const totalRows = group.patternY * group.height;
        for (let row = 0; row < totalRows && row * 32 < img.height; row++) {
          for (let col = 0; col < totalCols && col * 32 < img.width; col++) {
            const px = Math.floor(col / group.width);
            const py = Math.floor(row / group.height);
            const tx = group.width - 1 - (col % group.width);
            const ty = group.height - 1 - (row % group.height);
            const idx = getSpriteIndex(group, currentFrame, px, py, 0, 0, tx, ty);
            if (idx >= group.sprites.length) continue;
            tctx.clearRect(0, 0, 32, 32);
            tctx.drawImage(img, col * 32, row * 32, 32, 32, 0, 0, 32, 32);
            const imgData = tctx.getImageData(0, 0, 32, 32);
            assignSprite(idx, imgData);
          }
        }
      }
    };
    img.src = URL.createObjectURL(file);
  }, [group, thing, spriteData, currentFrame, replaceSprite, addSprite, getSpriteAtPosition]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    setDragTile(null);

    // Handle atlas sprite drag-and-drop
    const spriteIdStr = e.dataTransfer.getData('application/x-sprite-id');
    if (spriteIdStr && thing && group) {
      const spriteId = parseInt(spriteIdStr, 10);
      if (!isNaN(spriteId) && spriteId > 0) {
        const slotIdx = getSlotIndexAtPosition(e.clientX, e.clientY);
        if (slotIdx >= 0) {
          group.sprites[slotIdx] = spriteId;
          thing.rawBytes = undefined;
          clearSpriteCache();
          const store = useOBStore.getState();
          const newDirtyIds = new Set(store.dirtyIds);
          newDirtyIds.add(thing.id);
          useOBStore.setState({ dirty: true, dirtyIds: newDirtyIds, editVersion: store.editVersion + 1 });
        }
        return;
      }
    }

    // Handle PNG file drops
    if (e.dataTransfer.files.length > 0) {
      handleImageFiles(e.dataTransfer.files, e.clientX, e.clientY);
    }
  }, [handleImageFiles, thing, group, getSlotIndexAtPosition]);

  const handleExport = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `sprite_${thing?.id ?? 0}_frame${currentFrame}.png`;
    a.click();
  };

  const handleExportOBD = () => {
    if (!thing || !spriteData) return;
    try {
      const compressed = encodeOBD({
        thing,
        clientVersion: 1098,
        spriteData,
        spriteOverrides,
      });
      const blob = new Blob([new Uint8Array(compressed) as BlobPart], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dId = objectData ? getDisplayId(objectData, thing.id) : thing.id;
      a.download = `${category}_${dId}.obd`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(`Export failed: ${e instanceof Error ? e.message : e}`);
    }
  };

  const obdImportRef = useRef<HTMLInputElement>(null);

  const handleImportOBD = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const buf = new Uint8Array(reader.result as ArrayBuffer);
        const result = decodeOBD(buf);
        const state = useOBStore.getState();
        const selectedId = state.selectedThingId;
        const existingThing = selectedId != null ? state.objectData?.things.get(selectedId) : null;

        if (selectedId != null && existingThing && existingThing.category === result.category) {
          // Replace the currently selected thing in-place
          const ok = state.replaceThing(selectedId, result.flags, result.frameGroups, result.spritePixels);
          if (ok) {
            const od = useOBStore.getState().objectData;
            const dId = od ? getDisplayId(od, selectedId) : selectedId;
            alert(`Replaced ${result.category} #${dId} with ${result.spritePixels.size} sprites.`);
          } else {
            alert('Replace failed — could not overwrite selected thing.');
          }
        } else {
          // No selection or category mismatch — append as new
          const newId = state.importThing(result.category, result.flags, result.frameGroups, result.spritePixels);
          if (newId != null) {
            const od = useOBStore.getState().objectData;
            const dId = od ? getDisplayId(od, newId) : newId;
            alert(`Imported ${result.category} #${dId} with ${result.spritePixels.size} sprites.`);
          }
        }
      } catch (err) {
        alert(`Import failed: ${err instanceof Error ? err.message : err}`);
      }
    };
    reader.readAsArrayBuffer(file);
    // Reset the input so the same file can be re-imported
    e.target.value = '';
  };

  // Update a frame group property and mark dirty
  const updateFrameGroupProp = useCallback((key: string, value: number) => {
    if (!thing || !group) return;
    (group as unknown as Record<string, unknown>)[key] = value;

    // Resize sprites array to match new total count
    const total = group.width * group.height * group.layers * group.patternX * group.patternY * group.patternZ * group.animationLength;
    if (group.sprites.length < total) {
      while (group.sprites.length < total) group.sprites.push(0);
    } else if (group.sprites.length > total) {
      group.sprites.length = total;
    }

    // Resize animationLengths array if animation count changed
    while (group.animationLengths.length < group.animationLength) {
      group.animationLengths.push({ min: 100, max: 100 });
    }
    if (group.animationLengths.length > group.animationLength) {
      group.animationLengths.length = group.animationLength;
    }

    thing.rawBytes = undefined;
    clearSpriteCache();
    const store = useOBStore.getState();
    const newDirtyIds = new Set(store.dirtyIds);
    newDirtyIds.add(thing.id);
    useOBStore.setState({ dirty: true, dirtyIds: newDirtyIds, editVersion: store.editVersion + 1 });
  }, [thing, group]);

  if (!thing) {
    return (
      <div className="flex items-center justify-center h-full text-emperia-muted text-sm">
        Select an object to preview
      </div>
    );
  }

  const isAnimated = group ? group.animationLength > 1 : false;

  return (
    <div className="flex flex-col h-full">
      {/* Zoom slider bar */}
      <div className="flex items-center px-4 py-2 border-b border-emperia-border gap-3">
        <span className="text-[10px] text-emperia-muted">Zoom:</span>
        <input
          type="range"
          min={1}
          max={8}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="flex-1 h-1 accent-emperia-accent"
        />
        <span className="text-[10px] text-emperia-muted w-6 text-right">{zoom}x</span>
      </div>

      {/* Sprite preview area */}
      <div className="flex-1 flex items-center justify-center overflow-auto min-h-0">
        {(() => {
          // Determine if we should show spatial direction buttons
          // Outfits: patternX=4, patternY=1 → 4 cardinal dirs (N/E/S/W)
          // Distance effects: patternX=3, patternY=3 → 8 dirs (cardinals + diagonals)
          const px = group?.patternX ?? 0;
          const py = group?.patternY ?? 0;
          const isDistanceGrid = isDistance && px >= 3 && py >= 3;
          const isOutfitDirs = (isOutfit || isEffect) && px > 1 && px <= 4;
          const showDirButtons = previewMode && group && (isDistanceGrid || isOutfitDirs);

          // Grid cell definition: { px, py, label, arrow } or 'canvas' or null
          type DirCell = { px: number; py: number; label: string; arrow: string } | 'canvas' | null;

          // Distance: 3×3 patternX×patternY grid
          // Outfit: 4-dir patternX only (py always 0)
          const gridCells: DirCell[] = showDirButtons
            ? isDistanceGrid
              ? [
                  { px: 0, py: 0, label: 'NW', arrow: '↖' }, { px: 1, py: 0, label: 'N', arrow: '↑' },  { px: 2, py: 0, label: 'NE', arrow: '↗' },
                  { px: 0, py: 1, label: 'W', arrow: '←' },  'canvas' as const,                           { px: 2, py: 1, label: 'E', arrow: '→' },
                  { px: 0, py: 2, label: 'SW', arrow: '↙' }, { px: 1, py: 2, label: 'S', arrow: '↓' },  { px: 2, py: 2, label: 'SE', arrow: '↘' },
                ]
              : [
                  null,                                         { px: 0, py: 0, label: 'N', arrow: '↑' },  null,
                  { px: 3, py: 0, label: 'W', arrow: '←' },   'canvas' as const,                          { px: 1, py: 0, label: 'E', arrow: '→' },
                  null,                                         { px: 2, py: 0, label: 'S', arrow: '↓' },  null,
                ]
            : [];

          const dirBtn = (cell: { px: number; py: number; label: string; arrow: string }, i: number) => (
            <button
              key={`dir-${i}`}
              onClick={() => { setActiveDirection(cell.px); setActivePatternY(cell.py); }}
              className={`w-9 h-9 flex items-center justify-center rounded-lg text-sm font-bold transition-colors ${
                activeDirection === cell.px && activePatternY === cell.py
                  ? 'bg-emperia-accent text-white shadow-lg shadow-emperia-accent/30'
                  : 'bg-emperia-surface border border-emperia-border text-emperia-muted hover:text-emperia-text hover:bg-emperia-hover'
              }`}
              title={cell.label}
            >{cell.arrow}</button>
          );

          const canvasEl = (
            <div
              className={`checkerboard rounded-lg border relative transition-colors
                ${dragOver ? 'border-emperia-accent border-2' : 'border-emperia-border'}`}
              style={{ padding: 8 }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
                if (canvasRef.current && group) {
                  const rect = canvasRef.current.getBoundingClientRect();
                  const col = Math.floor((e.clientX - rect.left) / (32 * zoom));
                  const row = Math.floor((e.clientY - rect.top) / (32 * zoom));
                  const totalCols = renderedPxCount * group.width;
                  const totalRows = renderedPyCount * group.height;
                  if (col >= 0 && col < totalCols && row >= 0 && row < totalRows) {
                    setDragTile({ col, row });
                  } else {
                    setDragTile(null);
                  }
                }
              }}
              onDragLeave={() => { setDragOver(false); setDragTile(null); }}
              onDrop={(e) => { setDragTile(null); handleDrop(e); }}
            >
              <canvas
                ref={canvasRef}
                className="cursor-pointer"
                onClick={(e) => {
                  const spriteId = getSpriteAtPosition(e.clientX, e.clientY);
                  if (spriteId > 0) {
                    useOBStore.setState({ focusSpriteId: spriteId });
                  }
                }}
                style={{
                  width: (group ? renderedPxCount * group.width : 1) * 32 * zoom,
                  height: (group ? renderedPyCount * group.height : 1) * 32 * zoom,
                  imageRendering: 'pixelated',
                }}
              />
              {showGrid && group && (
                <div
                  className="absolute inset-2 pointer-events-none"
                  style={{
                    backgroundImage: `
                      repeating-linear-gradient(0deg, rgba(255,255,255,0.15), rgba(255,255,255,0.15) 1px, transparent 1px, transparent ${32 * zoom}px),
                      repeating-linear-gradient(90deg, rgba(255,255,255,0.15), rgba(255,255,255,0.15) 1px, transparent 1px, transparent ${32 * zoom}px)
                    `,
                    backgroundSize: `${32 * zoom}px ${32 * zoom}px`,
                  }}
                />
              )}
              {showCropSize && group && (
                <div
                  className="absolute pointer-events-none border border-yellow-400/60"
                  style={{
                    bottom: 8,
                    left: 8,
                    width: group.width * 32 * zoom,
                    height: group.height * 32 * zoom,
                  }}
                />
              )}
              {dragOver && !dragTile && (
                <div className="absolute inset-0 flex items-center justify-center bg-emperia-accent/10 rounded-lg pointer-events-none">
                  <span className="text-emperia-accent text-xs font-medium">Drop PNG to replace</span>
                </div>
              )}
              {dragTile && (
                <div
                  className="absolute pointer-events-none border-2 border-emperia-accent bg-emperia-accent/15 rounded-sm"
                  style={{
                    left: 8 + dragTile.col * 32 * zoom,
                    top: 8 + dragTile.row * 32 * zoom,
                    width: 32 * zoom,
                    height: 32 * zoom,
                  }}
                />
              )}
            </div>
          );

          return showDirButtons ? (
          <div className="grid gap-1" style={{ gridTemplateColumns: 'auto auto auto', gridTemplateRows: 'auto auto auto', justifyItems: 'center', alignItems: 'center' }}>
            {gridCells.map((cell, i) =>
              cell === 'canvas' ? <div key="canvas">{canvasEl}</div>
              : cell != null ? dirBtn(cell, i)
              : <div key={`empty-${i}`} className="w-9 h-9" />
            )}
          </div>
        ) : (
        <div
          className={`checkerboard rounded-lg border relative transition-colors
            ${dragOver ? 'border-emperia-accent border-2' : 'border-emperia-border'}`}
          style={{ padding: 8 }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
            if (canvasRef.current && group) {
              const rect = canvasRef.current.getBoundingClientRect();
              const col = Math.floor((e.clientX - rect.left) / (32 * zoom));
              const row = Math.floor((e.clientY - rect.top) / (32 * zoom));
              const totalCols = renderedPxCount * group.width;
              const totalRows = renderedPyCount * group.height;
              if (col >= 0 && col < totalCols && row >= 0 && row < totalRows) {
                setDragTile({ col, row });
              } else {
                setDragTile(null);
              }
            }
          }}
          onDragLeave={() => { setDragOver(false); setDragTile(null); }}
          onDrop={(e) => { setDragTile(null); handleDrop(e); }}
        >
          <canvas
            ref={canvasRef}
            className="cursor-pointer"
            onClick={(e) => {
              const spriteId = getSpriteAtPosition(e.clientX, e.clientY);
              if (spriteId > 0) {
                useOBStore.setState({ focusSpriteId: spriteId });
              }
            }}
            style={{
              width: (group ? renderedPxCount * group.width : 1) * 32 * zoom,
              height: (group ? renderedPyCount * group.height : 1) * 32 * zoom,
              imageRendering: 'pixelated',
            }}
          />
          {showGrid && group && (
            <div
              className="absolute inset-2 pointer-events-none"
              style={{
                backgroundImage: `
                  repeating-linear-gradient(0deg, rgba(255,255,255,0.15), rgba(255,255,255,0.15) 1px, transparent 1px, transparent ${32 * zoom}px),
                  repeating-linear-gradient(90deg, rgba(255,255,255,0.15), rgba(255,255,255,0.15) 1px, transparent 1px, transparent ${32 * zoom}px)
                `,
                backgroundSize: `${32 * zoom}px ${32 * zoom}px`,
              }}
            />
          )}
          {showCropSize && group && (
            <div
              className="absolute pointer-events-none border border-yellow-400/60"
              style={{
                bottom: 8,
                left: 8,
                width: group.width * 32 * zoom,
                height: group.height * 32 * zoom,
              }}
            />
          )}
          {dragOver && !dragTile && (
            <div className="absolute inset-0 flex items-center justify-center bg-emperia-accent/10 rounded-lg pointer-events-none">
              <span className="text-emperia-accent text-xs font-medium">Drop PNG to replace</span>
            </div>
          )}
          {dragTile && (
            <div
              className="absolute pointer-events-none border-2 border-emperia-accent bg-emperia-accent/15 rounded-sm"
              style={{
                left: 8 + dragTile.col * 32 * zoom,
                top: 8 + dragTile.row * 32 * zoom,
                width: 32 * zoom,
                height: 32 * zoom,
              }}
            />
          )}
        </div>
        )})()}
      </div>

      {/* Toolbar */}
      <div className="flex items-center px-3 py-1.5 gap-1 border-t border-emperia-border flex-wrap">
        {/* Zoom */}
        <button onClick={() => setZoom(Math.max(1, zoom - 1))} className="p-1 rounded hover:bg-emperia-hover text-emperia-muted hover:text-emperia-text" title="Zoom out">
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <span className="text-[10px] text-emperia-muted w-6 text-center">{zoom}x</span>
        <button onClick={() => setZoom(Math.min(8, zoom + 1))} className="p-1 rounded hover:bg-emperia-hover text-emperia-muted hover:text-emperia-text" title="Zoom in">
          <ZoomIn className="w-3.5 h-3.5" />
        </button>

        <div className="w-px h-4 bg-emperia-border mx-0.5" />

        {/* View toggles */}
        <button onClick={() => setShowGrid(!showGrid)} className={`p-1 rounded transition-colors ${showGrid ? 'bg-emperia-accent/20 text-emperia-accent' : 'text-emperia-muted hover:text-emperia-text hover:bg-emperia-hover'}`} title="Toggle Grid">
          <Grid3X3 className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => setShowCropSize(!showCropSize)} className={`p-1 rounded transition-colors ${showCropSize ? 'bg-emperia-accent/20 text-emperia-accent' : 'text-emperia-muted hover:text-emperia-text hover:bg-emperia-hover'}`} title="Toggle Crop Outline">
          <Crop className="w-3.5 h-3.5" />
        </button>
        {group && (group.patternX > 1 || group.patternY > 1) && (
          <button onClick={() => setPreviewMode(!previewMode)} className={`p-1 rounded transition-colors ${previewMode ? 'bg-emperia-accent/20 text-emperia-accent' : 'text-emperia-muted hover:text-emperia-text hover:bg-emperia-hover'}`} title="Toggle Preview Mode">
            <Eye className="w-3.5 h-3.5" />
          </button>
        )}

        <div className="w-px h-4 bg-emperia-border mx-0.5" />

        {/* Import / Export PNG */}
        <input ref={fileInputRef} type="file" accept="image/png,image/gif,image/bmp" className="hidden" onChange={(e) => e.target.files && handleImageFiles(e.target.files)} />
        <button onClick={() => fileInputRef.current?.click()} className="p-1 rounded hover:bg-emperia-hover text-emperia-muted hover:text-emperia-text" title="Import PNG">
          <ImageUp className="w-3.5 h-3.5" />
        </button>
        <button onClick={handleExport} className="p-1 rounded hover:bg-emperia-hover text-emperia-muted hover:text-emperia-text" title="Export PNG">
          <ImageDown className="w-3.5 h-3.5" />
        </button>

        <div className="w-px h-4 bg-emperia-border mx-0.5" />

        {/* Import / Export OBD */}
        <input ref={obdImportRef} type="file" accept=".obd" className="hidden" onChange={handleImportOBD} />
        <button onClick={() => obdImportRef.current?.click()} className="p-1 rounded hover:bg-emperia-hover text-emperia-muted hover:text-emperia-text" title="Import OBD">
          <Upload className="w-3.5 h-3.5" />
        </button>
        <button onClick={handleExportOBD} className="p-1 rounded hover:bg-emperia-hover text-emperia-muted hover:text-emperia-text" title="Export OBD">
          <Download className="w-3.5 h-3.5" />
        </button>

        <div className="w-px h-4 bg-emperia-border mx-0.5" />

        {/* Copy / Paste item properties */}
        <div className="relative" ref={copyMenuRef}>
          <button
            onClick={() => setCopyMenuOpen(!copyMenuOpen)}
            className="p-1 rounded hover:bg-emperia-hover text-emperia-muted hover:text-emperia-text"
            title="Copy properties"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          {copyMenuOpen && thing && (
            <div
              className="absolute bottom-full mb-1 left-0 bg-emperia-surface border border-emperia-border rounded shadow-lg py-1 z-50 min-w-[160px]"
              onClick={() => setCopyMenuOpen(false)}
            >
              {[
                { label: 'Everything', key: 'all' },
                { label: 'Flags Only', key: 'flags' },
                { label: 'Server Properties', key: 'server' },
                { label: 'Sprites Only', key: 'sprites' },
              ].map(({ label, key }) => (
                <button
                  key={key}
                  className="w-full text-left px-3 py-1.5 text-[11px] text-emperia-text hover:bg-emperia-hover transition-colors"
                  onClick={() => {
                    if (!thing) return;
                    const { clientToServerIds, itemDefinitions } = useOBStore.getState();
                    const serverId = clientToServerIds.get(thing.id);
                    const serverDef = serverId != null ? itemDefinitions.get(serverId) ?? null : null;
                    const copied: NonNullable<typeof useOBStore extends { getState: () => infer S } ? S extends { copiedThing: infer C } ? C : never : never> = { label };
                    if (key === 'all' || key === 'flags') {
                      copied.flags = { ...thing.flags };
                    }
                    if (key === 'all' || key === 'sprites') {
                      copied.frameGroups = thing.frameGroups.map(fg => ({ ...fg, sprites: [...fg.sprites], animationLengths: fg.animationLengths.map(a => ({ ...a })) }));
                    }
                    if (key === 'all' || key === 'server') {
                      copied.serverDef = serverDef ? { ...serverDef, properties: serverDef.properties ? { ...serverDef.properties } : null } : null;
                    }
                    useOBStore.setState({ copiedThing: copied });
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={() => {
            const { copiedThing } = useOBStore.getState();
            if (!copiedThing || !thing) return;
            const store = useOBStore.getState();
            const newDirtyIds = new Set(store.dirtyIds);
            newDirtyIds.add(thing.id);
            // Paste frame groups if copied
            if (copiedThing.frameGroups) {
              thing.frameGroups = copiedThing.frameGroups.map(fg => ({ ...fg, sprites: [...fg.sprites], animationLengths: fg.animationLengths.map(a => ({ ...a })) }));
            }
            thing.rawBytes = undefined;
            clearSpriteCache();
            // Paste server definition if copied (before flags so updateThingFlags can layer on top)
            if (copiedThing.serverDef && thing.category === 'item') {
              const { clientToServerIds, itemDefinitions } = store;
              const serverId = clientToServerIds.get(thing.id);
              if (serverId != null) {
                const newDefs = new Map(itemDefinitions);
                newDefs.set(serverId, {
                  ...copiedThing.serverDef,
                  serverId,
                  id: thing.id,
                });
                useOBStore.setState({ dirty: true, dirtyIds: newDirtyIds, editVersion: store.editVersion + 1, itemDefinitions: newDefs });
              }
            }
            // Paste flags via updateThingFlags so OTB flags & group sync correctly
            if (copiedThing.flags) {
              store.updateThingFlags(thing.id, { ...copiedThing.flags });
            } else {
              useOBStore.setState({ dirty: true, dirtyIds: newDirtyIds, editVersion: store.editVersion + 1 });
            }
          }}
          disabled={!useOBStore.getState().copiedThing}
          className={`p-1 rounded transition-colors ${
            useOBStore.getState().copiedThing
              ? 'hover:bg-emperia-hover text-emperia-muted hover:text-emperia-text'
              : 'text-emperia-muted/30 cursor-not-allowed'
          }`}
          title={useOBStore.getState().copiedThing?.label ? `Paste: ${useOBStore.getState().copiedThing!.label}` : 'Paste properties'}
        >
          <ClipboardPaste className="w-3.5 h-3.5" />
        </button>

        {/* Animation controls */}
        {isAnimated && (
          <>
            <div className="w-px h-4 bg-emperia-border mx-0.5" />
            <button onClick={() => { setCurrentFrame((currentFrame - 1 + (group?.animationLength ?? 1)) % (group?.animationLength ?? 1)); setPlaying(false); }} className="p-1 rounded hover:bg-emperia-hover text-emperia-muted hover:text-emperia-text" title="Previous frame">
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setPlaying(!playing)} className={`p-1 rounded transition-colors ${playing ? 'bg-emperia-accent/20 text-emperia-accent' : 'text-emperia-muted hover:text-emperia-text hover:bg-emperia-hover'}`} title={playing ? 'Pause' : 'Play'}>
              {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </button>
            <button onClick={() => { setCurrentFrame((currentFrame + 1) % (group?.animationLength ?? 1)); setPlaying(false); }} className="p-1 rounded hover:bg-emperia-hover text-emperia-muted hover:text-emperia-text" title="Next frame">
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] text-emperia-muted">{currentFrame + 1}/{group?.animationLength}</span>
          </>
        )}
      </div>

      {/* Frame group selector — always shown for outfits, or when multiple groups exist */}
      {(thing.frameGroups.length > 1 || isOutfit) && (
        <div className="flex items-center justify-center px-4 py-1.5 gap-1 border-t border-emperia-border">
          {thing.frameGroups.map((_, i) => (
            <button
              key={i}
              onClick={() => { setActiveGroup(i); setCurrentFrame(0); setPlaying(false); setActiveLayer(0); setActiveZ(0); }}
              className={`px-3 py-1 rounded text-[11px] font-medium transition-colors
                ${activeGroup === i ? 'bg-emperia-accent text-white' : 'bg-emperia-surface text-emperia-muted hover:bg-emperia-hover border border-emperia-border'}
              `}
            >
              {i === 0 ? 'Idle' : i === 1 ? 'Moving' : `Group ${i}`}
            </button>
          ))}
          <span className="text-[9px] text-emperia-muted/50 ml-2">{thing.frameGroups.length} group{thing.frameGroups.length !== 1 ? 's' : ''}</span>
        </div>
      )}

      {/* ═══ Unified Controls Panel ═══ */}
      {group && (
        <div className="border-t border-emperia-border">
          <div className="px-4 py-2">
            <div className="grid grid-cols-3 gap-x-3 gap-y-1 text-[10px]">

              {/* ── Dimensions ──────────────────────────────── */}
              <div className="col-span-3 text-[9px] font-medium text-emperia-muted uppercase tracking-wider">Dimensions</div>
              <ParamField label="Width" value={group.width} onChange={(v) => updateFrameGroupProp('width', v)} min={1} max={4} />
              <ParamField label="Height" value={group.height} onChange={(v) => updateFrameGroupProp('height', v)} min={1} max={4} />
              <ParamField label="Layers" value={group.layers} onChange={(v) => updateFrameGroupProp('layers', v)} min={1} max={4} />
              <ParamField label="Pat X" value={group.patternX} onChange={(v) => updateFrameGroupProp('patternX', v)} min={1} max={8} />
              <ParamField label="Pat Y" value={group.patternY} onChange={(v) => updateFrameGroupProp('patternY', v)} min={1} max={8} />
              <ParamField label="Pat Z" value={group.patternZ} onChange={(v) => updateFrameGroupProp('patternZ', v)} min={1} max={8} />
              <ParamField label="Frames" value={group.animationLength} onChange={(v) => updateFrameGroupProp('animationLength', v)} min={1} max={255} />
              <ParamField label="Crop" value={32} readOnly />
              <div />

              {/* ── Preview Controls ────────────────────────── */}
              {previewMode && (group.patternX > 1 || group.patternY > 1 || group.patternZ > 1 || group.layers > 1) && (
                <>
                  <div className="col-span-3 text-[9px] font-medium text-emperia-muted uppercase tracking-wider mt-1 pt-1 border-t border-emperia-border/30">Preview</div>

                  {/* Direction (Pattern X) — stepper fallback for non-outfit/distance with >4 patternX */}
                  {group.patternX > 4 && !isDistance && (
                    <div className="col-span-3 flex items-center gap-1">
                      <span className="text-emperia-muted shrink-0">Direction:</span>
                      <StepperBtn onClick={() => setActiveDirection(Math.max(0, activeDirection - 1))}>‹</StepperBtn>
                      <span className="text-emperia-text font-mono w-10 text-center">{activeDirection + 1}/{group.patternX}</span>
                      <StepperBtn onClick={() => setActiveDirection(Math.min(group.patternX - 1, activeDirection + 1))}>›</StepperBtn>
                    </div>
                  )}

                  {/* Pattern Y — addons for outfits, or generic pattern Y */}
                  {group.patternY > 1 && !isDistance && (
                    <div className="col-span-1 flex items-center gap-1">
                      <span className="text-emperia-muted shrink-0">{isOutfit ? 'Addon:' : 'Pat Y:'}</span>
                      <StepperBtn onClick={() => setActivePatternY(Math.max(0, activePatternY - 1))}>‹</StepperBtn>
                      <span className="text-emperia-text font-mono w-8 text-center text-[9px]">
                        {isOutfit ? (activePatternY === 0 ? 'None' : `#${activePatternY}`) : `${activePatternY + 1}/${group.patternY}`}
                      </span>
                      <StepperBtn onClick={() => setActivePatternY(Math.min(group.patternY - 1, activePatternY + 1))}>›</StepperBtn>
                    </div>
                  )}

                  {/* Pattern Z */}
                  {group.patternZ > 1 && (
                    <div className="col-span-1 flex items-center gap-1">
                      <span className="text-emperia-muted shrink-0">{isOutfit ? 'Mount:' : 'Pat Z:'}</span>
                      <StepperBtn onClick={() => setActiveZ(Math.max(0, activeZ - 1))}>‹</StepperBtn>
                      <span className="text-emperia-text font-mono w-8 text-center text-[9px]">{activeZ + 1}/{group.patternZ}</span>
                      <StepperBtn onClick={() => setActiveZ(Math.min(group.patternZ - 1, activeZ + 1))}>›</StepperBtn>
                    </div>
                  )}

                  {/* Layer */}
                  {group.layers > 1 && (
                    <div className="col-span-1 flex items-center gap-1">
                      <span className="text-emperia-muted shrink-0">Layer:</span>
                      <StepperBtn onClick={() => setActiveLayer(Math.max(0, activeLayer - 1))} disabled={blendLayers}>‹</StepperBtn>
                      <span className={`font-mono w-8 text-center text-[9px] ${blendLayers ? 'text-emperia-muted' : 'text-emperia-text'}`}>
                        {blendLayers ? 'All' : `${activeLayer + 1}/${group.layers}`}
                      </span>
                      <StepperBtn onClick={() => setActiveLayer(Math.min(group.layers - 1, activeLayer + 1))} disabled={blendLayers}>›</StepperBtn>
                      <label className="flex items-center gap-0.5 cursor-pointer ml-0.5">
                        <input type="checkbox" checked={blendLayers} onChange={() => setBlendLayers(!blendLayers)} className="w-2.5 h-2.5 accent-emperia-accent" />
                        <span className="text-emperia-muted text-[9px]">Blend</span>
                      </label>
                    </div>
                  )}
                </>
              )}

              {/* ── Animation ───────────────────────────────── */}
              {group.animationLength > 1 && (
                <>
                  <div className="col-span-3 text-[9px] font-medium text-emperia-muted uppercase tracking-wider mt-1 pt-1 border-t border-emperia-border/30">Animation</div>
                  <div className="col-span-2 flex items-center gap-1">
                    <span className="text-emperia-muted shrink-0">Frame:</span>
                    <StepperBtn onClick={() => { setCurrentFrame((currentFrame - 1 + group.animationLength) % group.animationLength); setPlaying(false); }}>‹</StepperBtn>
                    <span className="text-emperia-text font-mono w-8 text-center text-[9px]">{currentFrame + 1}/{group.animationLength}</span>
                    <StepperBtn onClick={() => { setCurrentFrame((currentFrame + 1) % group.animationLength); setPlaying(false); }}>›</StepperBtn>
                    <button
                      onClick={() => setPlaying(!playing)}
                      className={`ml-0.5 px-1.5 py-0.5 rounded text-[9px] transition-colors ${playing ? 'bg-emperia-accent text-white' : 'bg-emperia-surface border border-emperia-border text-emperia-muted hover:text-emperia-text'}`}
                    >{playing ? 'Stop' : 'Play'}</button>
                  </div>
                  <div className="col-span-1 flex items-center gap-1">
                    <span className="text-emperia-muted shrink-0">Mode:</span>
                    <select
                      value={group.asynchronous}
                      onChange={(e) => updateFrameGroupProp('asynchronous', Number(e.target.value))}
                      className="flex-1 px-1 py-0 bg-emperia-surface border border-emperia-border rounded text-[9px] text-emperia-text outline-none focus:border-emperia-accent"
                    >
                      <option value={0}>Sync</option>
                      <option value={1}>Async</option>
                    </select>
                  </div>
                  <div className="col-span-1">
                    <ParamField label="Loops" value={group.nLoop} min={0} max={255} onChange={(v) => updateFrameGroupProp('nLoop', v)} />
                  </div>
                  <div className="col-span-1">
                    <ParamField label="Start" value={group.start} min={0} max={group.animationLength - 1} onChange={(v) => updateFrameGroupProp('start', v)} />
                  </div>
                  <div className="col-span-1" />

                  {/* Per-frame durations */}
                  {group.animationLengths[currentFrame] && (
                    <>
                      <div className="col-span-3 text-[8px] text-emperia-muted mt-0.5">Frame {currentFrame + 1} duration (ms)</div>
                      <div className="col-span-1">
                        <ParamField label="Min" value={group.animationLengths[currentFrame].min} min={0} max={65535}
                          onChange={(v) => {
                            group.animationLengths[currentFrame].min = v;
                            thing!.rawBytes = undefined;
                            const store = useOBStore.getState();
                            const ids = new Set(store.dirtyIds); ids.add(thing!.id);
                            useOBStore.setState({ dirty: true, dirtyIds: ids, editVersion: store.editVersion + 1 });
                          }}
                        />
                      </div>
                      <div className="col-span-1">
                        <ParamField label="Max" value={group.animationLengths[currentFrame].max} min={0} max={65535}
                          onChange={(v) => {
                            group.animationLengths[currentFrame].max = v;
                            thing!.rawBytes = undefined;
                            const store = useOBStore.getState();
                            const ids = new Set(store.dirtyIds); ids.add(thing!.id);
                            useOBStore.setState({ dirty: true, dirtyIds: ids, editVersion: store.editVersion + 1 });
                          }}
                        />
                      </div>
                      <div className="col-span-1" />
                    </>
                  )}
                </>
              )}

              {/* ── Offset ──────────────────────────────────── */}
              {(isOutfit || thing.flags.hasDisplacement) && (
                <>
                  <div className="col-span-3 text-[9px] font-medium text-emperia-muted uppercase tracking-wider mt-1 pt-1 border-t border-emperia-border/30">Offset</div>
                  <div className="col-span-1">
                    <ParamField label="X" value={thing.flags.displacementX ?? 0} min={0} max={512}
                      onChange={(v) => {
                        useOBStore.getState().updateThingFlags(thing.id, { ...thing.flags, hasDisplacement: true, displacementX: v });
                      }}
                    />
                  </div>
                  <div className="col-span-1">
                    <ParamField label="Y" value={thing.flags.displacementY ?? 0} min={0} max={512}
                      onChange={(v) => {
                        useOBStore.getState().updateThingFlags(thing.id, { ...thing.flags, hasDisplacement: true, displacementY: v });
                      }}
                    />
                  </div>
                  <div className="col-span-1" />
                </>
              )}

              {/* ── Outfit Colors ──────────────────────────── */}
              {isOutfit && blendLayers && group.layers >= 2 && (
                <>
                  <div className="col-span-3 text-[9px] font-medium text-emperia-muted uppercase tracking-wider mt-1 pt-1 border-t border-emperia-border/30">Colors</div>
                  {(['head', 'body', 'legs', 'feet'] as const).map((channel) => (
                    <div key={channel} className="col-span-1 flex items-center gap-1">
                      <button
                        onClick={() => setShowColorPicker(showColorPicker === channel ? null : channel)}
                        className="w-4 h-4 rounded border border-emperia-border shrink-0"
                        style={{ backgroundColor: paletteToCSS(outfitColors[channel]) }}
                        title={`${channel}: ${outfitColors[channel]}`}
                      />
                      <span className="text-emperia-muted capitalize text-[9px]">{channel}</span>
                      <StepperBtn onClick={() => setOutfitColors({ ...outfitColors, [channel]: Math.max(0, outfitColors[channel] - 1) })}>‹</StepperBtn>
                      <span className="text-emperia-text font-mono w-5 text-center text-[9px]">{outfitColors[channel]}</span>
                      <StepperBtn onClick={() => setOutfitColors({ ...outfitColors, [channel]: Math.min(PALETTE_SIZE - 1, outfitColors[channel] + 1) })}>›</StepperBtn>
                    </div>
                  ))}
                  {showColorPicker && (
                    <div className="col-span-3 p-1 bg-emperia-surface border border-emperia-border rounded grid gap-px" style={{ gridTemplateColumns: 'repeat(19, 14px)' }}>
                      {OUTFIT_PALETTE.map((_, idx) => (
                        <button
                          key={idx}
                          onClick={() => { setOutfitColors({ ...outfitColors, [showColorPicker]: idx }); setShowColorPicker(null); }}
                          className={`w-3.5 h-3.5 rounded-sm border ${outfitColors[showColorPicker] === idx ? 'border-white' : 'border-transparent'}`}
                          style={{ backgroundColor: paletteToCSS(idx) }}
                          title={`${idx}`}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}

            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ParamField({
  label,
  value,
  onChange,
  min,
  max,
  readOnly,
}: {
  label: string;
  value: number;
  onChange?: (v: number) => void;
  min?: number;
  max?: number;
  readOnly?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-emperia-muted">{label}:</span>
      {readOnly ? (
        <span className="text-[10px] text-emperia-text font-mono w-14 text-right">{value}</span>
      ) : (
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => onChange?.(Math.max(min ?? 0, value - 1))}
            className="w-4 h-4 flex items-center justify-center rounded bg-emperia-surface border border-emperia-border text-emperia-muted hover:text-emperia-text text-[10px]"
          >
            -
          </button>
          <input
            type="number"
            value={value}
            min={min}
            max={max}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v)) onChange?.(Math.max(min ?? 0, Math.min(max ?? 9999, v)));
            }}
            className="w-10 px-1 py-0 bg-emperia-surface border border-emperia-border rounded text-[10px] text-emperia-text font-mono text-center outline-none focus:border-emperia-accent"
          />
          <button
            onClick={() => onChange?.(Math.min(max ?? 9999, value + 1))}
            className="w-4 h-4 flex items-center justify-center rounded bg-emperia-surface border border-emperia-border text-emperia-muted hover:text-emperia-text text-[10px]"
          >
            +
          </button>
        </div>
      )}
    </div>
  );
}

function StepperBtn({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-5 h-5 flex items-center justify-center rounded bg-emperia-surface border border-emperia-border text-emperia-muted hover:text-emperia-text text-[10px] disabled:opacity-30"
    >{children}</button>
  );
}

function NumInput({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      onChange={(e) => {
        const v = parseInt(e.target.value, 10);
        if (!isNaN(v)) onChange(Math.max(min, Math.min(max, v)));
      }}
      className="w-16 px-1.5 py-0.5 bg-emperia-surface border border-emperia-border rounded text-[10px] text-emperia-text font-mono text-right outline-none focus:border-emperia-accent"
    />
  );
}

function getSpriteIndex(
  group: FrameGroup,
  frame: number,
  xPattern: number,
  yPattern: number,
  zPattern: number,
  layer: number,
  x: number,
  y: number,
): number {
  return ((((((frame * group.patternZ + zPattern) * group.patternY + yPattern) *
    group.patternX + xPattern) * group.layers + layer) *
    group.height + y) *
    group.width + x);
}
