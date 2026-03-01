import { useState, useEffect, useRef, useCallback } from 'react';
import { useOBStore } from '../store';
import { decodeSprite, clearSpriteCache } from '../lib/sprite-decoder';
import { applyOutfitMask } from '../lib/outfit-colors';
import type { OutfitColorIndices } from '../lib/outfit-colors';
import type { FrameGroup } from '../lib/types';
import { getSpriteIndex } from './ui-primitives';
import { PreviewToolbar } from './PreviewToolbar';
import { ControlsPanel } from './ControlsPanel';
import { FrameScrubber } from './FrameScrubber';
import { LayerScrubber } from './LayerScrubber';


export function SpritePreview() {
  const selectedId = useOBStore((s) => s.selectedThingId);
  const objectData = useOBStore((s) => s.objectData);
  const spriteData = useOBStore((s) => s.spriteData);
  const spriteOverrides = useOBStore((s) => s.spriteOverrides);
  const replaceSprite = useOBStore((s) => s.replaceSprite);
  const addSprite = useOBStore((s) => s.addSprite);
  const editVersion = useOBStore((s) => s.editVersion);

  const thing = selectedId != null ? objectData?.things.get(selectedId) ?? null : null;

  const [activeGroup, setActiveGroup] = useState(0);
  const currentFrame = useOBStore((s) => s.currentFrame);
  const setCurrentFrame = (f: number | ((prev: number) => number)) => {
    if (typeof f === 'function') {
      useOBStore.setState((s) => ({ currentFrame: f(s.currentFrame) }));
    } else {
      useOBStore.setState({ currentFrame: f });
    }
  };
  const playing = useOBStore((s) => s.playing);
  const setPlaying = (p: boolean) => useOBStore.setState({ playing: p });
  const [zoom, setZoom] = useState(4);
  const [showGrid, setShowGrid] = useState(false);
  const [showCropSize, setShowCropSize] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [dragTile, setDragTile] = useState<{ col: number; row: number } | null>(null);
  const [hoverTile, setHoverTile] = useState<{ col: number; row: number } | null>(null);
  const activeLayer = useOBStore((s) => s.activeLayer);
  const setActiveLayer = (l: number) => useOBStore.setState({ activeLayer: l });
  const [activeZ, setActiveZ] = useState(0);
  const blendLayers = useOBStore((s) => s.blendLayers);
  const setBlendLayers = (b: boolean) => useOBStore.setState({ blendLayers: b });
  const outfitColors = useOBStore((s) => s.outfitColors);
  const setOutfitColors = (c: OutfitColorIndices) => useOBStore.setState({ outfitColors: c });
  const [previewMode, setPreviewMode] = useState(false); // true = single direction/pattern preview
  const [activeDirection, setActiveDirection] = useState(2); // 0=N,1=E,2=S,3=W — default south
  const [activePatternY, setActivePatternY] = useState(0);
  const showColorPicker = useOBStore((s) => s.showColorPicker);
  const setShowColorPicker = (c: keyof OutfitColorIndices | null) => useOBStore.setState({ showColorPicker: c });
  const [copyMenuOpen, setCopyMenuOpen] = useState(false);
  const copyMenuRef = useRef<HTMLDivElement>(null);
  const [baseOutfitId, setBaseOutfitId] = useState<number | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameTimerRef = useRef<number>(0);
  const latestRenderKeyRef = useRef('');

  const category = useOBStore((s) => s.activeCategory);
  const isOutfit = category === 'outfit';
  const isEffect = category === 'effect';
  const isDistance = category === 'distance';

  useEffect(() => {
    setActiveGroup(0);
    useOBStore.setState({ currentFrame: 0, playing: false, activeLayer: 0, blendLayers: false, showColorPicker: null });
    setActiveZ(0);
    setActiveDirection(2);
    setActivePatternY(0);
    // Default outfits to preview mode, items to pattern mode
    setPreviewMode(isOutfit || isEffect || isDistance);
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

  // Helper: render a single thing's frame group onto a canvas context using drawImage (alpha-composites)
  const renderThingLayer = useCallback((
    ctx: CanvasRenderingContext2D,
    fg: FrameGroup,
    frame: number,
    pxRange: number[],
    pyRange: number[],
    cellW: number,
    cellH: number,
    useAlpha: boolean,
    useMask: boolean,
    colors: OutfitColorIndices,
    offsetX = 0,
    offsetY = 0,
  ) => {
    if (!spriteData) return;
    const layers = useMask ? [0] : [0];
    for (const layer of layers) {
      for (let pyIdx = 0; pyIdx < pyRange.length; pyIdx++) {
        const py = pyRange[pyIdx];
        for (let pxIdx = 0; pxIdx < pxRange.length; pxIdx++) {
          const px = pxRange[pxIdx];
          const bx = pxIdx * cellW;
          const by = pyIdx * cellH;
          for (let ty = 0; ty < fg.height; ty++) {
            for (let tx = 0; tx < fg.width; tx++) {
              const idx = getSpriteIndex(fg, frame, px, py, 0, layer, tx, ty);
              if (idx >= fg.sprites.length) continue;
              const sprId = fg.sprites[idx];
              if (sprId <= 0) continue;
              const rawData = spriteOverrides.get(sprId) ?? decodeSprite(spriteData, sprId);
              if (!rawData) continue;
              const imgData = new ImageData(new Uint8ClampedArray(rawData.data), 32, 32);
              if (useMask) {
                const maskIdx = getSpriteIndex(fg, frame, px, py, 0, 1, tx, ty);
                if (maskIdx < fg.sprites.length) {
                  const maskSprId = fg.sprites[maskIdx];
                  if (maskSprId > 0) {
                    const maskRaw = spriteOverrides.get(maskSprId) ?? decodeSprite(spriteData, maskSprId);
                    if (maskRaw) applyOutfitMask(imgData, maskRaw, colors);
                  }
                }
              }
              const dx = offsetX + bx + (fg.width - 1 - tx) * 32;
              const dy = offsetY + by + (fg.height - 1 - ty) * 32;
              // Use drawImage for alpha compositing (base + overlay, or outfit mask applied)
              if (useAlpha || useMask) {
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
  }, [spriteData, spriteOverrides]);

  // Stamp a key that uniquely identifies the current render context.
  // Stale renderFrame closures (from before an import/replace) will see their
  // captured key no longer matches and bail out before painting.
  const renderKey = `${editVersion}:${activeGroup}:${selectedId}`;
  latestRenderKeyRef.current = renderKey;

  const walkingDiagRef = useRef(false);
  const renderFrame = useCallback((frame: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !group || !spriteData) return;

    // Skip if this closure is stale (a newer renderFrame has been created)
    if (latestRenderKeyRef.current !== renderKey) return;

    // One-shot render diagnostic for walking groups
    if (isOutfit && activeGroup > 0 && !walkingDiagRef.current) {
      walkingDiagRef.current = true;
      console.group('[RENDER DIAG] Walking group post-remap');
      console.log(`layers=${group.layers} frames=${group.animationLength} sprites=${group.sprites.length} pX=${group.patternX}`);
      const dirNames = ['N', 'E', 'S', 'W'];
      for (let f = 0; f < group.animationLength; f++) {
        for (let dir = 0; dir < group.patternX; dir++) {
          for (let l = 0; l < group.layers; l++) {
            const idx = getSpriteIndex(group, f, dir, 0, 0, l, 0, 0);
            const sid = idx < group.sprites.length ? group.sprites[idx] : -1;
            const hasPixels = sid > 0 && (spriteOverrides.has(sid) || !!decodeSprite(spriteData, sid));
            console.log(`  f=${f} ${dirNames[dir]} L${l}: idx=${idx} sid=${sid} hasPixels=${hasPixels}`);
          }
        }
      }
      console.groupEnd();
    }

    const cellW = group.width * 32;
    const cellH = group.height * 32;

    // In preview mode, render a single direction/pattern; otherwise render all
    const pxRange = previewMode ? [activeDirection < group.patternX ? activeDirection : 0] : Array.from({ length: group.patternX }, (_, i) => i);
    const pyRange = previewMode ? [activePatternY < group.patternY ? activePatternY : 0] : Array.from({ length: group.patternY }, (_, i) => i);

    const colsRendered = pxRange.length;
    const rowsRendered = pyRange.length;

    const hasBase = baseOutfitId != null && baseOutfitId !== selectedId;

    // Displacement offsets for overlay sprite relative to the base outfit.
    // Positive = overlay shifts up-left, Negative = overlay shifts down-right.
    // Applied uniformly in all directions so the user can tune the offset visually.
    const dispX = (hasBase && thing?.flags.hasDisplacement) ? (thing.flags.displacementX ?? 0) : 0;
    const dispY = (hasBase && thing?.flags.hasDisplacement) ? (thing.flags.displacementY ?? 0) : 0;
    const hasDisp = hasBase && (dispX !== 0 || dispY !== 0);

    // Canvas padding = absolute displacement so both sprites fit regardless of sign
    const padX = Math.abs(dispX);
    const padY = Math.abs(dispY);
    const cellTotalW = cellW + padX;
    const cellTotalH = cellH + padY;
    const canvasW = colsRendered * cellTotalW;
    const canvasH = rowsRendered * cellTotalH;
    canvas.width = canvasW;
    canvas.height = canvasH;

    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvasW, canvasH);

    // ── Render each direction/pattern cell ──
    for (let pyIdx = 0; pyIdx < pyRange.length; pyIdx++) {
      const py = pyRange[pyIdx];
      for (let pxIdx = 0; pxIdx < pxRange.length; pxIdx++) {
        const px = pxRange[pxIdx];

        const cellOriginX = pxIdx * cellTotalW;
        const cellOriginY = pyIdx * cellTotalH;

        // Position base and overlay within the expanded cell.
        // Positive disp: overlay at (0,0), base shifted right-down by disp.
        // Negative disp: base at (0,0), overlay shifted right-down by |disp|.
        const baseAnchorX = cellOriginX + Math.max(0, dispX);
        const baseAnchorY = cellOriginY + Math.max(0, dispY);
        const overlayX = cellOriginX + Math.max(0, -dispX);
        const overlayY = cellOriginY + Math.max(0, -dispY);

        // ── Draw base outfit for this direction ──
        if (hasBase && objectData) {
          const baseThing = objectData.things.get(baseOutfitId!);
          const baseFg = baseThing?.frameGroups[0];
          if (baseFg) {
            const bPx = px < baseFg.patternX ? px : 0;
            const bPy = py < baseFg.patternY ? py : 0;
            const baseHasMask = baseFg.layers >= 2;
            renderThingLayer(ctx, baseFg, 0, [bPx], [bPy], baseFg.width * 32, baseFg.height * 32, false, baseHasMask, outfitColors, baseAnchorX, baseAnchorY);
          }
        }

        const useOutfitMask = isOutfit && blendLayers && group.layers >= 2;
        const layersToRender = useOutfitMask
          ? [0]
          : blendLayers
            ? Array.from({ length: group.layers }, (_, i) => i)
            : [activeLayer];

        for (const layer of layersToRender) {
          for (let ty = 0; ty < group.height; ty++) {
            for (let tx = 0; tx < group.width; tx++) {
              const idx = getSpriteIndex(group, frame, px, py, activeZ, layer, tx, ty);
              if (idx >= group.sprites.length) continue;
              const spriteId = group.sprites[idx];
              if (spriteId <= 0) continue;

              const rawData = spriteOverrides.get(spriteId) ?? decodeSprite(spriteData, spriteId);
              if (!rawData) continue;

              const imgData = new ImageData(new Uint8ClampedArray(rawData.data), 32, 32);

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

              const dx = overlayX + (group.width - 1 - tx) * 32;
              const dy = overlayY + (group.height - 1 - ty) * 32;

              // Use drawImage for alpha compositing whenever we have a base outfit,
              // blending multiple layers, or applying outfit masks (putImageData replaces
              // pixels instead of compositing, which breaks multi-tile/multi-frame outfits).
              if (hasBase || useOutfitMask || (blendLayers && layer > 0)) {
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

        // ── Draw visible-tile border for this cell when displacement is active ──
        if (hasDisp) {
          ctx.save();
          ctx.strokeStyle = 'rgba(250, 204, 21, 0.7)'; // yellow-400
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 3]);
          // The "tile" is the bottom-right 32×32 of the base outfit area
          const tileX = baseAnchorX + cellW - 32;
          const tileY = baseAnchorY + cellH - 32;
          ctx.strokeRect(tileX + 0.5, tileY + 0.5, 31, 31);
          ctx.restore();
        }
      }
    }
  }, [group, spriteData, spriteOverrides, activeLayer, activeZ, blendLayers, previewMode, activeDirection, activePatternY, isOutfit, outfitColors, baseOutfitId, selectedId, objectData, renderThingLayer, thing, editVersion]);

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

  // Compute expected canvas pixel dimensions from current group data so CSS sizing
  // never reads stale values from canvasRef when switching between items of different sizes.
  const hasBase = baseOutfitId != null && baseOutfitId !== selectedId;
  const dispXAbs = (hasBase && thing?.flags.hasDisplacement) ? Math.abs(thing.flags.displacementX ?? 0) : 0;
  const dispYAbs = (hasBase && thing?.flags.hasDisplacement) ? Math.abs(thing.flags.displacementY ?? 0) : 0;
  const expectedCanvasW = group ? renderedPxCount * (group.width * 32 + dispXAbs) : 32;
  const expectedCanvasH = group ? renderedPyCount * (group.height * 32 + dispYAbs) : 32;

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
      <div
        className="flex-1 flex items-center justify-center overflow-auto min-h-0"
        onWheel={(e) => {
          if (!isAnimated || !group) return;
          e.preventDefault();
          setPlaying(false);
          setCurrentFrame((prev) => {
            const delta = e.deltaY > 0 ? 1 : -1;
            return (prev + delta + group.animationLength) % group.animationLength;
          });
        }}
      >
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
              onMouseMove={(e) => {
                if (!canvasRef.current || !group) { setHoverTile(null); return; }
                const totalCols = renderedPxCount * group.width;
                const totalRows = renderedPyCount * group.height;
                if (totalCols <= 1 && totalRows <= 1) { setHoverTile(null); return; }
                const rect = canvasRef.current.getBoundingClientRect();
                const col = Math.floor((e.clientX - rect.left) / (32 * zoom));
                const row = Math.floor((e.clientY - rect.top) / (32 * zoom));
                if (col >= 0 && col < totalCols && row >= 0 && row < totalRows) {
                  setHoverTile((prev) => (prev?.col === col && prev?.row === row) ? prev : { col, row });
                } else {
                  setHoverTile(null);
                }
              }}
              onMouseLeave={() => setHoverTile(null)}
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
                  width: expectedCanvasW * zoom,
                  height: expectedCanvasH * zoom,
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
              {hoverTile && !dragOver && (
                <div
                  className="absolute pointer-events-none border border-white/40 bg-white/5 rounded-sm"
                  style={{
                    left: 8 + hoverTile.col * 32 * zoom,
                    top: 8 + hoverTile.row * 32 * zoom,
                    width: 32 * zoom,
                    height: 32 * zoom,
                  }}
                />
              )}
            </div>
          );

          const frameScrubber = isAnimated && group ? (
            <FrameScrubber
              animationLength={group.animationLength}
              currentFrame={currentFrame}
              setCurrentFrame={setCurrentFrame}
              setPlaying={setPlaying}
              height={expectedCanvasH * zoom + 16}
            />
          ) : null;

          const hasMultipleLayers = group ? group.layers > 1 : false;
          const layerScrubber = hasMultipleLayers && group ? (
            <LayerScrubber
              layers={group.layers}
              activeLayer={activeLayer}
              setActiveLayer={setActiveLayer}
              blendLayers={blendLayers}
              setBlendLayers={setBlendLayers}
              height={expectedCanvasH * zoom + 16}
            />
          ) : null;

          return showDirButtons ? (
          <div className="flex items-center">
            <div className="grid gap-1" style={{ gridTemplateColumns: 'auto auto auto', gridTemplateRows: 'auto auto auto', justifyItems: 'center', alignItems: 'center' }}>
              {gridCells.map((cell, i) =>
                cell === 'canvas' ? <div key="canvas">{canvasEl}</div>
                : cell != null ? dirBtn(cell, i)
                : <div key={`empty-${i}`} className="w-9 h-9" />
              )}
            </div>
            {frameScrubber}
            {layerScrubber}
          </div>
        ) : (
        <div className="flex items-center">
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
          onMouseMove={(e) => {
            if (!canvasRef.current || !group) { setHoverTile(null); return; }
            const totalCols = renderedPxCount * group.width;
            const totalRows = renderedPyCount * group.height;
            if (totalCols <= 1 && totalRows <= 1) { setHoverTile(null); return; }
            const rect = canvasRef.current.getBoundingClientRect();
            const col = Math.floor((e.clientX - rect.left) / (32 * zoom));
            const row = Math.floor((e.clientY - rect.top) / (32 * zoom));
            if (col >= 0 && col < totalCols && row >= 0 && row < totalRows) {
              setHoverTile((prev) => (prev?.col === col && prev?.row === row) ? prev : { col, row });
            } else {
              setHoverTile(null);
            }
          }}
          onMouseLeave={() => setHoverTile(null)}
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
              width: expectedCanvasW * zoom,
              height: expectedCanvasH * zoom,
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
          {hoverTile && !dragOver && (
            <div
              className="absolute pointer-events-none border border-white/40 bg-white/5 rounded-sm"
              style={{
                left: 8 + hoverTile.col * 32 * zoom,
                top: 8 + hoverTile.row * 32 * zoom,
                width: 32 * zoom,
                height: 32 * zoom,
              }}
            />
          )}
        </div>
        {frameScrubber}
        {layerScrubber}
        </div>
        )})()}
      </div>

      {/* Toolbar */}
      <PreviewToolbar
        thing={thing}
        group={group}
        objectData={objectData}
        spriteData={spriteData}
        spriteOverrides={spriteOverrides}
        category={category}
        zoom={zoom}
        setZoom={setZoom}
        showGrid={showGrid}
        setShowGrid={setShowGrid}
        showCropSize={showCropSize}
        setShowCropSize={setShowCropSize}
        previewMode={previewMode}
        setPreviewMode={setPreviewMode}
        playing={playing}
        setPlaying={setPlaying}
        currentFrame={currentFrame}
        setCurrentFrame={setCurrentFrame}
        canvasRef={canvasRef}
        handleImageFiles={handleImageFiles}
        copyMenuOpen={copyMenuOpen}
        setCopyMenuOpen={setCopyMenuOpen}
        copyMenuRef={copyMenuRef}
        baseOutfitId={baseOutfitId}
        setBaseOutfitId={setBaseOutfitId}
      />

      {/* Frame group selector */}
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
          <span className="text-[9px] text-emperia-muted/50 ml-1">{thing.frameGroups.length} grp</span>
        </div>
      )}

      {/* ═══ Unified Controls Panel ═══ */}
      {group && (
        <ControlsPanel
          thing={thing}
          group={group}
          isOutfit={isOutfit}
          isDistance={isDistance}
          previewMode={previewMode}
          activeDirection={activeDirection}
          setActiveDirection={setActiveDirection}
          activePatternY={activePatternY}
          setActivePatternY={setActivePatternY}
          activeZ={activeZ}
          setActiveZ={setActiveZ}
          updateFrameGroupProp={updateFrameGroupProp}
        />
      )}
    </div>
  );
}

