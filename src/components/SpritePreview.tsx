import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Grid3X3 } from 'lucide-react';
import { useOBStore } from '../store';
import { decodeSprite } from '../lib/sprite-decoder';
import type { FrameGroup, ThingType } from '../lib/types';

export function SpritePreview() {
  const selectedId = useOBStore((s) => s.selectedThingId);
  const objectData = useOBStore((s) => s.objectData);
  const spriteData = useOBStore((s) => s.spriteData);

  const thing = selectedId != null ? objectData?.things.get(selectedId) ?? null : null;

  const [activeGroup, setActiveGroup] = useState(0);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(4);
  const [showGrid, setShowGrid] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const frameTimerRef = useRef<number>(0);

  // Reset when thing changes
  useEffect(() => {
    setActiveGroup(0);
    setCurrentFrame(0);
    setPlaying(false);
  }, [selectedId]);

  const group: FrameGroup | null = thing?.frameGroups[activeGroup] ?? null;

  // Render the current frame onto the canvas
  const renderFrame = useCallback((frame: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !group || !spriteData) return;

    const w = group.width * 32;
    const h = group.height * 32;
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, w, h);

    // Render all sprite tiles for this frame (layer 0, pattern 0,0,0)
    for (let y = 0; y < group.height; y++) {
      for (let x = 0; x < group.width; x++) {
        const idx = getSpriteIndex(group, frame, 0, 0, 0, 0, x, y);
        if (idx < group.sprites.length) {
          const spriteId = group.sprites[idx];
          if (spriteId > 0) {
            const imgData = decodeSprite(spriteData, spriteId);
            if (imgData) {
              // Sprites are stored bottom-right to top-left
              const dx = (group.width - 1 - x) * 32;
              const dy = (group.height - 1 - y) * 32;
              ctx.putImageData(imgData, dx, dy);
            }
          }
        }
      }
    }
  }, [group, spriteData]);

  // Render on frame/group change
  useEffect(() => {
    renderFrame(currentFrame);
  }, [currentFrame, renderFrame]);

  // Animation loop
  useEffect(() => {
    if (!playing || !group || group.animationLength <= 1) {
      return;
    }

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

    return () => {
      clearTimeout(frameTimerRef.current);
    };
  }, [playing, group, renderFrame]);

  if (!thing) {
    return (
      <div className="text-emperia-muted text-sm">
        Select an object to preview
      </div>
    );
  }

  const isAnimated = group ? group.animationLength > 1 : false;

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Info bar */}
      <div className="text-xs text-emperia-muted flex items-center gap-3">
        <span className="text-emperia-text font-medium">#{thing.id}</span>
        <span>{thing.category}</span>
        {group && (
          <>
            <span>{group.width}x{group.height}</span>
            <span>{group.sprites.length} sprites</span>
            {isAnimated && <span>{group.animationLength} frames</span>}
          </>
        )}
      </div>

      {/* Canvas */}
      <div
        className="checkerboard rounded-lg border border-emperia-border relative"
        style={{ padding: 8 }}
      >
        <canvas
          ref={canvasRef}
          style={{
            width: (group?.width ?? 1) * 32 * zoom,
            height: (group?.height ?? 1) * 32 * zoom,
            imageRendering: 'pixelated',
          }}
        />
        {showGrid && group && (
          <div
            className="absolute inset-2 pointer-events-none"
            style={{
              backgroundImage: `
                repeating-linear-gradient(0deg, rgba(255,255,255,0.1), rgba(255,255,255,0.1) 1px, transparent 1px, transparent ${32 * zoom}px),
                repeating-linear-gradient(90deg, rgba(255,255,255,0.1), rgba(255,255,255,0.1) 1px, transparent 1px, transparent ${32 * zoom}px)
              `,
              backgroundSize: `${32 * zoom}px ${32 * zoom}px`,
            }}
          />
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2">
        {/* Zoom */}
        <button
          onClick={() => setZoom(Math.max(1, zoom - 1))}
          className="p-1.5 rounded hover:bg-emperia-hover text-emperia-muted hover:text-emperia-text transition-colors"
          title="Zoom out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <span className="text-xs text-emperia-muted w-8 text-center">{zoom}x</span>
        <button
          onClick={() => setZoom(Math.min(8, zoom + 1))}
          className="p-1.5 rounded hover:bg-emperia-hover text-emperia-muted hover:text-emperia-text transition-colors"
          title="Zoom in"
        >
          <ZoomIn className="w-4 h-4" />
        </button>

        <div className="w-px h-5 bg-emperia-border mx-1" />

        {/* Grid toggle */}
        <button
          onClick={() => setShowGrid(!showGrid)}
          className={`p-1.5 rounded transition-colors ${showGrid ? 'bg-emperia-accent/20 text-emperia-accent' : 'text-emperia-muted hover:text-emperia-text hover:bg-emperia-hover'}`}
          title="Toggle grid"
        >
          <Grid3X3 className="w-4 h-4" />
        </button>

        {/* Animation controls */}
        {isAnimated && (
          <>
            <div className="w-px h-5 bg-emperia-border mx-1" />
            <button
              onClick={() => {
                setCurrentFrame((currentFrame - 1 + (group?.animationLength ?? 1)) % (group?.animationLength ?? 1));
                setPlaying(false);
              }}
              className="p-1.5 rounded hover:bg-emperia-hover text-emperia-muted hover:text-emperia-text transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPlaying(!playing)}
              className={`p-1.5 rounded transition-colors ${playing ? 'bg-emperia-accent/20 text-emperia-accent' : 'text-emperia-muted hover:text-emperia-text hover:bg-emperia-hover'}`}
            >
              {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
            <button
              onClick={() => {
                setCurrentFrame((currentFrame + 1) % (group?.animationLength ?? 1));
                setPlaying(false);
              }}
              className="p-1.5 rounded hover:bg-emperia-hover text-emperia-muted hover:text-emperia-text transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <span className="text-xs text-emperia-muted">
              {currentFrame + 1}/{group?.animationLength}
            </span>
          </>
        )}
      </div>

      {/* Frame group selector (for outfits with idle/moving) */}
      {thing.frameGroups.length > 1 && (
        <div className="flex gap-1">
          {thing.frameGroups.map((_, i) => (
            <button
              key={i}
              onClick={() => { setActiveGroup(i); setCurrentFrame(0); setPlaying(false); }}
              className={`px-2 py-0.5 rounded text-xs transition-colors
                ${activeGroup === i
                  ? 'bg-emperia-accent text-white'
                  : 'bg-emperia-surface text-emperia-muted hover:bg-emperia-hover'
                }
              `}
            >
              {i === 0 ? 'Idle' : i === 1 ? 'Moving' : `Group ${i}`}
            </button>
          ))}
        </div>
      )}
    </div>
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
