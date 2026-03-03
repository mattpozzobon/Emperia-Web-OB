import { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { LIGHT_PALETTE, MINIMAP_PALETTE, rgbToHex } from '../lib/color-palettes';

type PaletteType = 'light' | 'minimap';

interface ColorPalettePopoverProps {
  type: PaletteType;
  value: number;
  onChange: (index: number) => void;
}

const COLS = 18;
const SWATCH = 14;       // px per swatch cell
const POPUP_W = COLS * SWATCH + 20; // grid + padding
const POPUP_H_EST = 420; // rough max height estimate for flip detection

export function ColorPalettePopover({ type, value, onChange }: ColorPalettePopoverProps) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const palette = type === 'light' ? LIGHT_PALETTE : MINIMAP_PALETTE;
  const maxIndex = type === 'light' ? 215 : palette.length - 1;

  // Skip trailing black padding entries for minimap
  const visibleCount = type === 'minimap'
    ? palette.length - 8
    : palette.length;

  const currentColor = value >= 0 && value < palette.length
    ? palette[value]
    : [128, 128, 128] as [number, number, number];
  const currentHex = rgbToHex(currentColor[0], currentColor[1], currentColor[2]);

  // Position popup relative to trigger button
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const flipUp = spaceBelow < POPUP_H_EST && rect.top > spaceBelow;
    const top = flipUp ? rect.top - POPUP_H_EST : rect.bottom + 4;
    const left = Math.min(rect.left, window.innerWidth - POPUP_W - 8);
    setPos({ top: Math.max(4, top), left: Math.max(4, left) });
  }, [open]);

  // Close on outside click
  const handleClickOutside = useCallback((e: MouseEvent) => {
    const target = e.target as Node;
    if (
      popupRef.current && !popupRef.current.contains(target) &&
      btnRef.current && !btnRef.current.contains(target)
    ) {
      setOpen(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open, handleClickOutside]);

  return (
    <div className="inline-flex items-center gap-1.5">
      <span className="text-emperia-muted text-[10px]">Color</span>
      <button
        ref={btnRef}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 px-1 py-0.5 rounded bg-emperia-surface border border-emperia-border
                   hover:border-emperia-accent transition-colors cursor-pointer"
        title={`Index: ${value} — Click to pick`}
      >
        <span
          className="w-4 h-4 rounded-sm border border-white/20"
          style={{ backgroundColor: currentHex }}
        />
        <span className="text-emperia-text font-mono text-[10px] w-7 text-right">{value}</span>
      </button>

      {open && createPortal(
        <div
          ref={popupRef}
          className="fixed z-[9999] bg-emperia-bg border border-emperia-border rounded-lg shadow-2xl p-2"
          style={{ top: pos.top, left: pos.left, width: POPUP_W, maxHeight: '90vh', overflowY: 'auto' }}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] text-emperia-muted font-medium uppercase tracking-wider">
              {type === 'light' ? 'Light Color' : 'Minimap Color'}
            </span>
            <span className="text-[9px] text-emperia-muted font-mono">
              #{value} {currentHex}
            </span>
          </div>
          <div
            className="grid"
            style={{
              gridTemplateColumns: `repeat(${COLS}, ${SWATCH}px)`,
              gap: '1px',
            }}
          >
            {Array.from({ length: visibleCount }, (_, i) => {
              const [r, g, b] = palette[i];
              const hex = rgbToHex(r, g, b);
              const isSelected = i === value;
              const isDark = r + g + b < 200;
              return (
                <button
                  key={i}
                  onClick={() => { onChange(Math.min(i, maxIndex)); setOpen(false); }}
                  className={`cursor-pointer transition-transform hover:scale-[1.6] hover:z-10 rounded-sm ${
                    isSelected ? 'ring-2 ring-emperia-accent ring-offset-1 ring-offset-emperia-bg scale-125 z-10' : ''
                  }`}
                  style={{ backgroundColor: hex, width: SWATCH, height: SWATCH }}
                  title={`#${i} — rgb(${r}, ${g}, ${b})`}
                >
                  {isSelected && (
                    <span className={`block text-[7px] leading-none text-center font-bold ${isDark ? 'text-white' : 'text-black'}`}>
                      ✓
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2 mt-2 pt-1.5 border-t border-emperia-border/50">
            <span className="text-[10px] text-emperia-muted">Index:</span>
            <input
              type="number"
              value={value}
              min={0}
              max={maxIndex}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!isNaN(v)) onChange(Math.max(0, Math.min(maxIndex, v)));
              }}
              className="w-14 px-1 py-0.5 rounded bg-emperia-surface border border-emperia-border
                         text-emperia-text font-mono text-right text-[10px] outline-none
                         focus:border-emperia-accent transition-colors"
            />
            <span
              className="w-5 h-5 rounded border border-white/20"
              style={{ backgroundColor: currentHex }}
            />
            <span className="text-[9px] text-emperia-muted font-mono">{currentHex}</span>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
