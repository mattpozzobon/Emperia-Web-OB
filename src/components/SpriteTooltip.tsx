import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { getSpriteDataUrl } from '../lib/sprite-decoder';
import type { SpriteData } from '../lib/types';

const PREVIEW_SIZE = 128;
const OFFSET_X = 16;
const OFFSET_Y = 16;

interface SpriteTooltipState {
  url: string;
  label: string;
  x: number;
  y: number;
}

/**
 * Hook that provides onMouseEnter/Move/Leave handlers and a portal element
 * showing an enlarged sprite preview next to the cursor.
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
    setTip({ url, label, x: e.clientX + OFFSET_X, y: e.clientY + OFFSET_Y });
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

  return { show, move, hide, portal };
}

function SpriteTooltipOverlay({ url, label, x, y }: SpriteTooltipState) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

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
    setPos({ nx, ny } as any);
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
          style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <img
            src={url}
            alt=""
            style={{
              width: PREVIEW_SIZE - 8,
              height: PREVIEW_SIZE - 8,
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
