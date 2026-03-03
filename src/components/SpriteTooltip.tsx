import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { getSpriteDataUrl, compositeThingDataUrl } from '../lib/sprite-decoder';
import type { SpriteData, FrameGroup } from '../lib/types';

const MAX_PREVIEW = 128; // max width or height of preview area in px
const OFFSET_X = 16;
const OFFSET_Y = 16;

interface SpriteTooltipState {
  url: string;
  label: string;
  x: number;
  y: number;
  /** native pixel width of the composited image */
  nativeW: number;
  /** native pixel height of the composited image */
  nativeH: number;
}

/**
 * Hook that provides onMouseEnter/Move/Leave handlers and a portal element
 * showing an enlarged sprite preview next to the cursor.
 *
 * - show()      — single 32×32 sprite (atlas cells)
 * - showThing() — full composite using FrameGroup width×height
 */
export function useSpriteTooltip(spriteData: SpriteData | null, spriteOverrides: Map<number, ImageData>) {
  const [tip, setTip] = useState<SpriteTooltipState | null>(null);
  const rafRef = useRef<number>(0);
  const activeRef = useRef<{ url: string; label: string } | null>(null);

  const show = useCallback((spriteId: number, label: string, e: React.MouseEvent) => {
    if (!spriteData || spriteId <= 0) return;
    const url = getSpriteDataUrl(spriteData, spriteId, spriteOverrides);
    if (!url) return;
    activeRef.current = { url, label };
    setTip({ url, label, x: e.clientX + OFFSET_X, y: e.clientY + OFFSET_Y, nativeW: 32, nativeH: 32 });
  }, [spriteData, spriteOverrides]);

  const showThing = useCallback((
    thingId: number,
    fg: FrameGroup,
    label: string,
    e: React.MouseEvent,
  ) => {
    if (!spriteData) return;
    const w = fg.width || 1;
    const h = fg.height || 1;
    const url = compositeThingDataUrl(spriteData, thingId, w, h, fg.sprites, spriteOverrides);
    if (!url) return;
    activeRef.current = { url, label };
    setTip({ url, label, x: e.clientX + OFFSET_X, y: e.clientY + OFFSET_Y, nativeW: w * 32, nativeH: h * 32 });
  }, [spriteData, spriteOverrides]);

  const move = useCallback((e: React.MouseEvent) => {
    if (!activeRef.current) return;
    cancelAnimationFrame(rafRef.current);
    const cx = e.clientX;
    const cy = e.clientY;
    rafRef.current = requestAnimationFrame(() => {
      setTip((prev) => prev ? { ...prev, x: cx + OFFSET_X, y: cy + OFFSET_Y } : null);
    });
  }, []);

  const hide = useCallback(() => {
    activeRef.current = null;
    cancelAnimationFrame(rafRef.current);
    setTip(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const portal = tip
    ? createPortal(<SpriteTooltipOverlay {...tip} />, document.body)
    : null;

  return { show, showThing, move, hide, portal };
}

function SpriteTooltipOverlay({ url, label, x, y, nativeW, nativeH }: SpriteTooltipState) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  // Scale to fit within MAX_PREVIEW while preserving aspect ratio
  const scale = Math.min(MAX_PREVIEW / nativeW, MAX_PREVIEW / nativeH, 4); // cap at 4× zoom
  const displayW = Math.round(nativeW * scale);
  const displayH = Math.round(nativeH * scale);

  // Clamp to viewport
  useEffect(() => {
    const el = ref.current;
    if (!el) { setPos({ x, y }); return; }
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let nx = x;
    let ny = y;
    if (nx + rect.width > vw - 8) nx = x - rect.width - OFFSET_X * 2;
    if (ny + rect.height > vh - 8) ny = y - rect.height - OFFSET_Y * 2;
    if (nx < 4) nx = 4;
    if (ny < 4) ny = 4;
    setPos({ x: nx, y: ny });
  }, [x, y]);

  return (
    <div
      ref={ref}
      className="fixed z-[9999] pointer-events-none"
      style={{ left: pos.x, top: pos.y }}
    >
      <div className="bg-emperia-panel border border-emperia-border rounded-lg shadow-xl p-1.5 flex flex-col items-center gap-1">
        <div
          className="checkerboard rounded"
          style={{ width: displayW + 8, height: displayH + 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <img
            src={url}
            alt=""
            style={{
              width: displayW,
              height: displayH,
              imageRendering: 'pixelated',
            }}
            draggable={false}
          />
        </div>
        {label && (
          <span className="text-[10px] text-emperia-muted font-mono leading-none">{label}</span>
        )}
      </div>
    </div>
  );
}
