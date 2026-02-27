import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Grid3X3, ImageDown, Upload } from 'lucide-react';
import { useOBStore } from '../store';
import { decodeSprite, clearSpriteCache } from '../lib/sprite-decoder';
import type { FrameGroup } from '../lib/types';

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

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameTimerRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setActiveGroup(0);
    setCurrentFrame(0);
    setPlaying(false);
    setActiveLayer(0);
    setActiveZ(0);
  }, [selectedId]);

  const group: FrameGroup | null = thing?.frameGroups[activeGroup] ?? null;

  const renderFrame = useCallback((frame: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !group || !spriteData) return;

    // Full canvas = all patterns × tile size
    const cellW = group.width * 32;
    const cellH = group.height * 32;
    const totalW = group.patternX * cellW;
    const totalH = group.patternY * cellH;
    canvas.width = totalW;
    canvas.height = totalH;

    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, totalW, totalH);

    // Determine which layers to render
    const layersToRender = blendLayers
      ? Array.from({ length: group.layers }, (_, i) => i)
      : [activeLayer];

    // Render each pattern combination with the selected layer(s) and zPattern
    for (const layer of layersToRender) {
      for (let py = 0; py < group.patternY; py++) {
        for (let px = 0; px < group.patternX; px++) {
          const baseX = px * cellW;
          const baseY = py * cellH;

          for (let ty = 0; ty < group.height; ty++) {
            for (let tx = 0; tx < group.width; tx++) {
              const idx = getSpriteIndex(group, frame, px, py, activeZ, layer, tx, ty);
              if (idx < group.sprites.length) {
                const spriteId = group.sprites[idx];
                if (spriteId > 0) {
                  const imgData = spriteOverrides.get(spriteId) ?? decodeSprite(spriteData, spriteId);
                  if (imgData) {
                    const dx = baseX + (group.width - 1 - tx) * 32;
                    const dy = baseY + (group.height - 1 - ty) * 32;
                    // For blended layers, draw via a temp canvas to preserve alpha compositing
                    if (blendLayers && layer > 0) {
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
        }
      }
    }
  }, [group, spriteData, spriteOverrides, activeLayer, activeZ, blendLayers]);

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

  // Given a pixel position on the displayed canvas, find the sprite ID at that tile
  const getSpriteAtPosition = useCallback((clientX: number, clientY: number): number => {
    if (!group || !canvasRef.current) return 0;
    const rect = canvasRef.current.getBoundingClientRect();
    const canvasPixelX = (clientX - rect.left) / zoom;
    const canvasPixelY = (clientY - rect.top) / zoom;

    // Which 32px tile are we in?
    const tileCol = Math.floor(canvasPixelX / 32);
    const tileRow = Math.floor(canvasPixelY / 32);

    // Total columns/rows in the full rendered grid
    const totalCols = group.patternX * group.width;
    const totalRows = group.patternY * group.height;
    if (tileCol < 0 || tileCol >= totalCols || tileRow < 0 || tileRow >= totalRows) return 0;

    // Which pattern cell? (each cell is width×height tiles)
    const px = Math.floor(tileCol / group.width);
    const py = Math.floor(tileRow / group.height);

    // Which tile within that cell? (sprites stored bottom-right to top-left)
    const tx = group.width - 1 - (tileCol % group.width);
    const ty = group.height - 1 - (tileRow % group.height);

    const idx = getSpriteIndex(group, currentFrame, px, py, activeZ, activeLayer, tx, ty);
    return idx < group.sprites.length ? group.sprites[idx] : 0;
  }, [group, zoom, currentFrame, activeLayer, activeZ]);

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
              const totalCols = group.patternX * group.width;
              const totalRows = group.patternY * group.height;
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
              width: (group ? group.patternX * group.width : 1) * 32 * zoom,
              height: (group ? group.patternY * group.height : 1) * 32 * zoom,
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
      <div className="flex items-center px-4 py-1.5 gap-4 border-t border-emperia-border">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={showCropSize} onChange={() => setShowCropSize(!showCropSize)} className="w-3 h-3 accent-emperia-accent" />
          <span className="text-[10px] text-emperia-muted">Show Crop Size</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={showGrid} onChange={() => setShowGrid(!showGrid)} className="w-3 h-3 accent-emperia-accent" />
          <span className="text-[10px] text-emperia-muted">Show Grid</span>
        </label>
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

      {/* Animation / Layer / Z controls */}
      {group && (group.animationLength > 1 || group.layers > 1 || group.patternZ > 1) && (
        <div className="border-t border-emperia-border">
          <div className="px-4 py-1.5 bg-emperia-surface/50">
            <span className="text-[10px] font-medium text-emperia-text uppercase tracking-wider">Animation</span>
          </div>
          <div className="px-4 py-2">
            <table className="w-full text-[10px]" style={{ borderSpacing: '0 3px', borderCollapse: 'separate' }}>
              <tbody>
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
