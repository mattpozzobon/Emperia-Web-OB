import { Trash2 } from 'lucide-react';
import { getSpriteDataUrl } from '../lib/sprite-decoder';
import type { SpriteData } from '../lib/types';

const CELL = 40;

interface AtlasCellProps {
  spriteId: number;
  spriteData: SpriteData;
  spriteOverrides: Map<number, ImageData>;
  isHighlighted: boolean;
  isAtlasSelected: boolean;
  hasSelectedSlot: boolean;
  onClick: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDelete: () => void;
}

export function AtlasCell({
  spriteId, spriteData, spriteOverrides,
  isHighlighted, isAtlasSelected, hasSelectedSlot,
  onClick, onContextMenu, onDragStart, onDelete,
}: AtlasCellProps) {
  const url = getSpriteDataUrl(spriteData, spriteId, spriteOverrides);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className={`group relative flex items-center justify-center border transition-colors cursor-grab active:cursor-grabbing
        ${isAtlasSelected
          ? 'border-emperia-accent bg-emperia-accent/20'
          : isHighlighted
            ? 'border-green-400 bg-green-400/20'
            : hasSelectedSlot
              ? 'border-transparent hover:bg-emperia-accent/10 hover:border-emperia-accent/30 cursor-pointer'
              : 'border-transparent hover:bg-emperia-hover'
        }
      `}
      style={{ width: CELL, height: CELL }}
      title={`#${spriteId}${isAtlasSelected ? ' (selected)' : ''} — Ctrl+click to multi-select, Shift+click for range`}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      {url ? (
        <img src={url} alt="" draggable={false} className="w-8 h-8 pointer-events-none" style={{ imageRendering: 'pixelated' }} />
      ) : (
        <div className="w-6 h-6" />
      )}
      <span className="absolute bottom-0 right-0.5 text-[6px] text-emperia-muted/40 leading-none">
        {spriteId}
      </span>
      {!isAtlasSelected && (
        <button
          className="absolute top-0 right-0 p-0.5 rounded-bl bg-red-500/80 text-white opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          title={`Delete sprite #${spriteId}`}
        >
          <Trash2 className="w-2.5 h-2.5" />
        </button>
      )}
    </div>
  );
}
