import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Grid3X3, ImageDown, Upload, Download, FolderOpen } from 'lucide-react';
import { useOBStore } from '../store';
import { decodeSprite, clearSpriteCache } from '../lib/sprite-decoder';
import { applyOutfitMask, paletteToCSS, OUTFIT_PALETTE, PALETTE_SIZE } from '../lib/outfit-colors';
import { encodeOBD, decodeOBD } from '../lib/obd';
import type { OutfitColorIndices } from '../lib/outfit-colors';
import type { FrameGroup } from '../lib/types';

const DIRECTION_LABELS = ['North', 'East', 'South', 'West'];
const DIRECTION_ARROWS = ['↑', '→', '↓', '←'];

export function SpritePreview() {
  const selectedId = useOBStore((s) => s.selectedThingId);
  const objectData = useOBStore((s) => s.objectData);
  const spriteData = useOBStore((s) => s.spriteData);
  const spriteOverrides = useOBStore((s) => s.spriteOverrides);
  const replaceSprite = useOBStore((s) => s.replaceSprite);
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

  const handleImageFiles = useCallback((files: FileList, dropX?: number, dropY?: number) => {
    if (!group || !spriteData) return;
    const file = files[0];
    if (!file || !file.type.startsWith('image/')) return;
    const img = new Image();
    img.onload = () => {
      const tc = document.createElement('canvas');
      tc.width = 32; tc.height = 32;
      const tctx = tc.getContext('2d')!;

      if (img.width <= 32 && img.height <= 32) {
        // Single tile — replace the sprite at the drop position
        tctx.clearRect(0, 0, 32, 32);
        tctx.drawImage(img, 0, 0, 32, 32);
        const imgData = tctx.getImageData(0, 0, 32, 32);

        let spriteId = 0;
        if (dropX != null && dropY != null) {
          spriteId = getSpriteAtPosition(dropX, dropY);
        }
        // Fallback: first sprite of the frame
        if (spriteId === 0) {
          const idx = getSpriteIndex(group, currentFrame, 0, 0, 0, 0, 0, 0);
          spriteId = idx < group.sprites.length ? group.sprites[idx] : 0;
        }
        if (spriteId > 0) replaceSprite(spriteId, imgData);
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
            const spriteId = group.sprites[idx];
            if (spriteId === 0) continue;
            tctx.clearRect(0, 0, 32, 32);
            tctx.drawImage(img, col * 32, row * 32, 32, 32, 0, 0, 32, 32);
            const imgData = tctx.getImageData(0, 0, 32, 32);
            replaceSprite(spriteId, imgData);
          }
        }
      }
    };
    img.src = URL.createObjectURL(file);
  }, [group, spriteData, currentFrame, replaceSprite, getSpriteAtPosition]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleImageFiles(e.dataTransfer.files, e.clientX, e.clientY);
    }
  }, [handleImageFiles]);

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
      a.download = `${category}_${thing.id}.obd`;
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
        const importThing = useOBStore.getState().importThing;
        const newId = importThing(result.category, result.flags, result.frameGroups, result.spritePixels);
        if (newId != null) {
          alert(`Imported ${result.category} as ID ${newId} with ${result.spritePixels.size} sprites.`);
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
      </div>

      {/* Controls row */}
      <div className="flex items-center justify-center px-4 py-2 gap-2 border-t border-emperia-border">
        <button onClick={() => setZoom(Math.max(1, zoom - 1))} className="p-1 rounded hover:bg-emperia-hover text-emperia-muted hover:text-emperia-text" title="Zoom out">
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <span className="text-[10px] text-emperia-muted w-6 text-center">{zoom}x</span>
        <button onClick={() => setZoom(Math.min(8, zoom + 1))} className="p-1 rounded hover:bg-emperia-hover text-emperia-muted hover:text-emperia-text" title="Zoom in">
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <div className="w-px h-4 bg-emperia-border mx-0.5" />
        <button onClick={() => setShowGrid(!showGrid)} className={`p-1 rounded transition-colors ${showGrid ? 'bg-emperia-accent/20 text-emperia-accent' : 'text-emperia-muted hover:text-emperia-text hover:bg-emperia-hover'}`} title="Show Grid">
          <Grid3X3 className="w-3.5 h-3.5" />
        </button>
        <div className="w-px h-4 bg-emperia-border mx-0.5" />
        <input ref={fileInputRef} type="file" accept="image/png,image/gif,image/bmp" className="hidden" onChange={(e) => e.target.files && handleImageFiles(e.target.files)} />
        <button onClick={() => fileInputRef.current?.click()} className="p-1 rounded hover:bg-emperia-hover text-emperia-muted hover:text-emperia-text" title="Import PNG">
          <Upload className="w-3.5 h-3.5" />
        </button>
        <button onClick={handleExport} className="p-1 rounded hover:bg-emperia-hover text-emperia-muted hover:text-emperia-text" title="Export PNG">
          <ImageDown className="w-3.5 h-3.5" />
        </button>
        <div className="w-px h-4 bg-emperia-border mx-0.5" />
        <button onClick={handleExportOBD} className="p-1 rounded hover:bg-emperia-hover text-emperia-muted hover:text-emperia-text" title="Export OBD">
          <Download className="w-3.5 h-3.5" />
        </button>
        <input ref={obdImportRef} type="file" accept=".obd" className="hidden" onChange={handleImportOBD} />
        <button onClick={() => obdImportRef.current?.click()} className="p-1 rounded hover:bg-emperia-hover text-emperia-muted hover:text-emperia-text" title="Import OBD">
          <FolderOpen className="w-3.5 h-3.5" />
        </button>
        {isAnimated && (
          <>
            <div className="w-px h-4 bg-emperia-border mx-0.5" />
            <button onClick={() => { setCurrentFrame((currentFrame - 1 + (group?.animationLength ?? 1)) % (group?.animationLength ?? 1)); setPlaying(false); }} className="p-1 rounded hover:bg-emperia-hover text-emperia-muted hover:text-emperia-text">
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setPlaying(!playing)} className={`p-1 rounded transition-colors ${playing ? 'bg-emperia-accent/20 text-emperia-accent' : 'text-emperia-muted hover:text-emperia-text hover:bg-emperia-hover'}`}>
              {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </button>
            <button onClick={() => { setCurrentFrame((currentFrame + 1) % (group?.animationLength ?? 1)); setPlaying(false); }} className="p-1 rounded hover:bg-emperia-hover text-emperia-muted hover:text-emperia-text">
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] text-emperia-muted">{currentFrame + 1}/{group?.animationLength}</span>
          </>
        )}
      </div>

      {/* Toggles */}
      <div className="flex items-center px-4 py-1.5 gap-4 border-t border-emperia-border flex-wrap">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={showCropSize} onChange={() => setShowCropSize(!showCropSize)} className="w-3 h-3 accent-emperia-accent" />
          <span className="text-[10px] text-emperia-muted">Crop</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={showGrid} onChange={() => setShowGrid(!showGrid)} className="w-3 h-3 accent-emperia-accent" />
          <span className="text-[10px] text-emperia-muted">Grid</span>
        </label>
        {group && (group.patternX > 1 || group.patternY > 1) && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={previewMode} onChange={() => setPreviewMode(!previewMode)} className="w-3 h-3 accent-emperia-accent" />
            <span className="text-[10px] text-emperia-muted">Preview</span>
          </label>
        )}
      </div>

      {/* Offset section */}
      {group && thing.flags.hasDisplacement && (
        <div className="flex items-center justify-end px-4 py-1.5 gap-4 border-t border-emperia-border">
          <ParamField label="Offset X" value={thing.flags.displacementX ?? 0} readOnly />
          <ParamField label="Offset Y" value={thing.flags.displacementY ?? 0} readOnly />
        </div>
      )}

      {/* Frame group selector */}
      {thing.frameGroups.length > 1 && (
        <div className="flex items-center justify-center px-4 py-1.5 gap-1 border-t border-emperia-border">
          {thing.frameGroups.map((_, i) => (
            <button
              key={i}
              onClick={() => { setActiveGroup(i); setCurrentFrame(0); setPlaying(false); setActiveLayer(0); setActiveZ(0); }}
              className={`px-2 py-0.5 rounded text-[10px] transition-colors
                ${activeGroup === i ? 'bg-emperia-accent text-white' : 'bg-emperia-surface text-emperia-muted hover:bg-emperia-hover'}
              `}
            >
              {i === 0 ? 'Idle' : i === 1 ? 'Moving' : `Group ${i}`}
            </button>
          ))}
        </div>
      )}

      {/* Animation / Layer / Z / Direction / Color controls */}
      {group && (group.animationLength > 1 || group.layers > 1 || group.patternZ > 1 || (previewMode && (group.patternX > 1 || group.patternY > 1)) || isOutfit) && (
        <div className="border-t border-emperia-border">
          <div className="px-4 py-1.5 bg-emperia-surface/50">
            <span className="text-[10px] font-medium text-emperia-text uppercase tracking-wider">
              {isOutfit ? 'Outfit' : isEffect ? 'Effect' : isDistance ? 'Distance' : 'Animation'}
            </span>
          </div>
          <div className="px-4 py-2">
            <table className="w-full text-[10px]" style={{ borderSpacing: '0 3px', borderCollapse: 'separate' }}>
              <tbody>
                {/* Direction (Pattern X) — in preview mode for outfits/creatures */}
                {previewMode && group.patternX > 1 && (
                  <tr>
                    <td className="text-emperia-muted text-right pr-2 w-24">Direction:</td>
                    <td>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: Math.min(group.patternX, 4) }, (_, i) => (
                          <button
                            key={i}
                            onClick={() => setActiveDirection(i)}
                            className={`w-6 h-5 flex items-center justify-center rounded text-[10px] transition-colors ${
                              activeDirection === i
                                ? 'bg-emperia-accent text-white'
                                : 'bg-emperia-surface border border-emperia-border text-emperia-muted hover:text-emperia-text'
                            }`}
                            title={DIRECTION_LABELS[i] ?? `Dir ${i}`}
                          >{DIRECTION_ARROWS[i] ?? i}</button>
                        ))}
                        {group.patternX > 4 && (
                          <>
                            <StepperBtn onClick={() => setActiveDirection(Math.max(0, activeDirection - 1))}>‹</StepperBtn>
                            <span className="text-emperia-text font-mono w-10 text-center">{activeDirection + 1}/{group.patternX}</span>
                            <StepperBtn onClick={() => setActiveDirection(Math.min(group.patternX - 1, activeDirection + 1))}>›</StepperBtn>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )}

                {/* Pattern Y — addons for outfits, or generic pattern Y */}
                {previewMode && group.patternY > 1 && (
                  <tr>
                    <td className="text-emperia-muted text-right pr-2">{isOutfit ? 'Addon:' : 'Pattern Y:'}</td>
                    <td>
                      <div className="flex items-center gap-1">
                        <StepperBtn onClick={() => setActivePatternY(Math.max(0, activePatternY - 1))}>‹</StepperBtn>
                        <span className="text-emperia-text font-mono w-10 text-center">
                          {isOutfit ? (activePatternY === 0 ? 'None' : `#${activePatternY}`) : `${activePatternY + 1}/${group.patternY}`}
                        </span>
                        <StepperBtn onClick={() => setActivePatternY(Math.min(group.patternY - 1, activePatternY + 1))}>›</StepperBtn>
                      </div>
                    </td>
                  </tr>
                )}

                {/* Frame stepper */}
                {group.animationLength > 1 && (
                  <tr>
                    <td className="text-emperia-muted text-right pr-2 w-24">Frame:</td>
                    <td>
                      <div className="flex items-center gap-1">
                        <StepperBtn onClick={() => { setCurrentFrame((currentFrame - 1 + group.animationLength) % group.animationLength); setPlaying(false); }}>‹</StepperBtn>
                        <span className="text-emperia-text font-mono w-10 text-center">{currentFrame + 1}/{group.animationLength}</span>
                        <StepperBtn onClick={() => { setCurrentFrame((currentFrame + 1) % group.animationLength); setPlaying(false); }}>›</StepperBtn>
                        <button
                          onClick={() => setPlaying(!playing)}
                          className={`ml-1 px-2 py-0.5 rounded text-[10px] transition-colors ${playing ? 'bg-emperia-accent text-white' : 'bg-emperia-surface border border-emperia-border text-emperia-muted hover:text-emperia-text'}`}
                        >{playing ? 'Stop' : 'Play'}</button>
                      </div>
                    </td>
                  </tr>
                )}

                {/* Layer stepper */}
                {group.layers > 1 && (
                  <tr>
                    <td className="text-emperia-muted text-right pr-2">Layer:</td>
                    <td>
                      <div className="flex items-center gap-1">
                        <StepperBtn onClick={() => setActiveLayer(Math.max(0, activeLayer - 1))} disabled={blendLayers}>‹</StepperBtn>
                        <span className={`font-mono w-10 text-center ${blendLayers ? 'text-emperia-muted' : 'text-emperia-text'}`}>
                          {blendLayers ? 'All' : `${activeLayer + 1}/${group.layers}`}
                        </span>
                        <StepperBtn onClick={() => setActiveLayer(Math.min(group.layers - 1, activeLayer + 1))} disabled={blendLayers}>›</StepperBtn>
                        <label className="flex items-center gap-1 cursor-pointer ml-1">
                          <input type="checkbox" checked={blendLayers} onChange={() => setBlendLayers(!blendLayers)} className="w-3 h-3 accent-emperia-accent" />
                          <span className="text-emperia-muted">Blend</span>
                        </label>
                      </div>
                    </td>
                  </tr>
                )}

                {/* Pattern Z stepper */}
                {group.patternZ > 1 && (
                  <tr>
                    <td className="text-emperia-muted text-right pr-2">Pattern Z:</td>
                    <td>
                      <div className="flex items-center gap-1">
                        <StepperBtn onClick={() => setActiveZ(Math.max(0, activeZ - 1))}>‹</StepperBtn>
                        <span className="text-emperia-text font-mono w-10 text-center">{activeZ + 1}/{group.patternZ}</span>
                        <StepperBtn onClick={() => setActiveZ(Math.min(group.patternZ - 1, activeZ + 1))}>›</StepperBtn>
                      </div>
                    </td>
                  </tr>
                )}

                {/* Outfit color pickers */}
                {isOutfit && blendLayers && group.layers >= 2 && (
                  <>
                    <tr><td colSpan={2}><div className="border-t border-emperia-border/40 my-0.5" /></td></tr>
                    {(['head', 'body', 'legs', 'feet'] as const).map((channel) => (
                      <tr key={channel}>
                        <td className="text-emperia-muted text-right pr-2 capitalize">{channel}:</td>
                        <td>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setShowColorPicker(showColorPicker === channel ? null : channel)}
                              className="w-5 h-5 rounded border border-emperia-border"
                              style={{ backgroundColor: paletteToCSS(outfitColors[channel]) }}
                              title={`Color ${outfitColors[channel]}`}
                            />
                            <span className="text-emperia-text font-mono w-8 text-center">{outfitColors[channel]}</span>
                            <StepperBtn onClick={() => setOutfitColors({ ...outfitColors, [channel]: Math.max(0, outfitColors[channel] - 1) })}>‹</StepperBtn>
                            <StepperBtn onClick={() => setOutfitColors({ ...outfitColors, [channel]: Math.min(PALETTE_SIZE - 1, outfitColors[channel] + 1) })}>›</StepperBtn>
                          </div>
                          {showColorPicker === channel && (
                            <div className="mt-1 p-1 bg-emperia-surface border border-emperia-border rounded grid gap-px" style={{ gridTemplateColumns: 'repeat(19, 14px)' }}>
                              {OUTFIT_PALETTE.map((_, idx) => (
                                <button
                                  key={idx}
                                  onClick={() => { setOutfitColors({ ...outfitColors, [channel]: idx }); setShowColorPicker(null); }}
                                  className={`w-3.5 h-3.5 rounded-sm border ${outfitColors[channel] === idx ? 'border-white' : 'border-transparent'}`}
                                  style={{ backgroundColor: paletteToCSS(idx) }}
                                  title={`${idx}`}
                                />
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </>
                )}

                {/* Animation config */}
                {group.animationLength > 1 && (
                  <>
                    <tr><td colSpan={2}><div className="border-t border-emperia-border/40 my-0.5" /></td></tr>

                    <tr>
                      <td className="text-emperia-muted text-right pr-2">Anim mode:</td>
                      <td>
                        <select
                          value={group.asynchronous}
                          onChange={(e) => updateFrameGroupProp('asynchronous', Number(e.target.value))}
                          className="w-full px-1.5 py-0.5 bg-emperia-surface border border-emperia-border rounded text-[10px] text-emperia-text outline-none focus:border-emperia-accent"
                        >
                          <option value={0}>Synchronous</option>
                          <option value={1}>Asynchronous</option>
                        </select>
                      </td>
                    </tr>
                    <tr>
                      <td className="text-emperia-muted text-right pr-2">Loop count:</td>
                      <td>
                        <NumInput value={group.nLoop} min={0} max={255} onChange={(v) => updateFrameGroupProp('nLoop', v)} />
                      </td>
                    </tr>
                    <tr>
                      <td className="text-emperia-muted text-right pr-2">Start frame:</td>
                      <td>
                        <NumInput value={group.start} min={0} max={group.animationLength - 1} onChange={(v) => updateFrameGroupProp('start', v)} />
                      </td>
                    </tr>

                    {/* Per-frame durations */}
                    {group.animationLengths[currentFrame] && (
                      <>
                        <tr><td colSpan={2}><div className="border-t border-emperia-border/40 my-0.5" /></td></tr>
                        <tr>
                          <td className="text-emperia-muted text-right pr-2">Min (ms):</td>
                          <td>
                            <NumInput
                              value={group.animationLengths[currentFrame].min}
                              min={0} max={65535}
                              onChange={(v) => {
                                group.animationLengths[currentFrame].min = v;
                                thing!.rawBytes = undefined;
                                const store = useOBStore.getState();
                                const ids = new Set(store.dirtyIds); ids.add(thing!.id);
                                useOBStore.setState({ dirty: true, dirtyIds: ids, editVersion: store.editVersion + 1 });
                              }}
                            />
                          </td>
                        </tr>
                        <tr>
                          <td className="text-emperia-muted text-right pr-2">Max (ms):</td>
                          <td>
                            <NumInput
                              value={group.animationLengths[currentFrame].max}
                              min={0} max={65535}
                              onChange={(v) => {
                                group.animationLengths[currentFrame].max = v;
                                thing!.rawBytes = undefined;
                                const store = useOBStore.getState();
                                const ids = new Set(store.dirtyIds); ids.add(thing!.id);
                                useOBStore.setState({ dirty: true, dirtyIds: ids, editVersion: store.editVersion + 1 });
                              }}
                            />
                          </td>
                        </tr>
                        <tr>
                          <td colSpan={2} className="text-emperia-muted/60 text-right pt-0.5">
                            Frame {currentFrame + 1} of {group.animationLength}
                          </td>
                        </tr>
                      </>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Patterns section — editable frame group parameters */}
      {group && (
        <div className="border-t border-emperia-border">
          <div className="px-4 py-1.5 bg-emperia-surface/50">
            <span className="text-[10px] font-medium text-emperia-text uppercase tracking-wider">Patterns</span>
          </div>
          <div className="px-4 py-2 grid grid-cols-2 gap-x-6 gap-y-1">
            <ParamField label="Width" value={group.width} onChange={(v) => updateFrameGroupProp('width', v)} min={1} max={4} />
            <ParamField label="Height" value={group.height} onChange={(v) => updateFrameGroupProp('height', v)} min={1} max={4} />
            <ParamField label="Crop Size" value={32} readOnly />
            <ParamField label="Layers" value={group.layers} onChange={(v) => updateFrameGroupProp('layers', v)} min={1} max={4} />
            <ParamField label="Pattern X" value={group.patternX} onChange={(v) => updateFrameGroupProp('patternX', v)} min={1} max={8} />
            <ParamField label="Pattern Y" value={group.patternY} onChange={(v) => updateFrameGroupProp('patternY', v)} min={1} max={8} />
            <ParamField label="Pattern Z" value={group.patternZ} onChange={(v) => updateFrameGroupProp('patternZ', v)} min={1} max={8} />
            <ParamField label="Animations" value={group.animationLength} onChange={(v) => updateFrameGroupProp('animationLength', v)} min={1} max={255} />
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
