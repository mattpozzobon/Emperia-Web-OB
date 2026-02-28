import { getSpriteDataUrl } from '../lib/sprite-decoder';
import type { SpriteData, ThingType } from '../lib/types';

const CELL = 40;

interface ObjectSlotsProps {
  thing: ThingType;
  spriteData: SpriteData;
  spriteOverrides: Map<number, ImageData>;
  slots: { spriteId: number; group: number; index: number }[];
  selectedSlot: { group: number; index: number } | null;
  setSelectedSlot: (s: { group: number; index: number } | null) => void;
  dropTarget: { group: number; index: number } | null;
  onSlotDragOver: (e: React.DragEvent, group: number, index: number) => void;
  onSlotDragLeave: () => void;
  onSlotDrop: (e: React.DragEvent, group: number, index: number) => void;
}

export function ObjectSlots({
  thing, spriteData, spriteOverrides, slots,
  selectedSlot, setSelectedSlot, dropTarget,
  onSlotDragOver, onSlotDragLeave, onSlotDrop,
}: ObjectSlotsProps) {
  return (
    <div className="shrink-0 border-b border-emperia-border">
      <div className="px-2 py-1.5 flex items-center justify-between">
        <span className="text-[10px] font-medium text-emperia-text uppercase tracking-wider">
          Object Sprites
        </span>
        <span className="text-[10px] text-emperia-muted">{slots.length}</span>
      </div>
      <div className="overflow-y-auto max-h-40 px-1.5 pb-1.5">
        <div className="grid grid-cols-6 gap-0.5">
          {slots.map(({ spriteId, group, index }, i) => {
            const url = spriteId > 0 ? getSpriteDataUrl(spriteData, spriteId, spriteOverrides) : null;
            const isSelected = selectedSlot?.group === group && selectedSlot?.index === index;
            const isModified = spriteOverrides.has(spriteId);
            const isDragOver = dropTarget?.group === group && dropTarget?.index === index;

            return (
              <button
                key={`${group}-${index}`}
                onClick={() => setSelectedSlot(isSelected ? null : { group, index })}
                onDragOver={(e) => onSlotDragOver(e, group, index)}
                onDragLeave={onSlotDragLeave}
                onDrop={(e) => onSlotDrop(e, group, index)}
                className={`relative flex items-center justify-center rounded border transition-colors
                  ${isDragOver
                    ? 'border-green-400 bg-green-400/20'
                    : isSelected
                      ? 'border-emperia-accent bg-emperia-accent/20'
                      : isModified
                        ? 'border-amber-500/50 bg-amber-500/10'
                        : 'border-emperia-border/40 hover:border-emperia-muted'
                  }
                `}
                style={{ width: CELL, height: CELL }}
                title={`Slot ${i} → Sprite #${spriteId}${isSelected ? ' (selected — click atlas sprite to assign)' : '\nDrag a sprite here or click to select'}`}
              >
                {url ? (
                  <img src={url} alt="" className="w-8 h-8" style={{ imageRendering: 'pixelated' }} />
                ) : (
                  <div className="w-8 h-8 bg-emperia-border/20 rounded-sm" />
                )}
                <span className="absolute bottom-0 right-0.5 text-[6px] text-emperia-muted/50 leading-none">
                  {spriteId}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {selectedSlot && (
        <div className="px-2 pb-1.5 text-[10px] text-emperia-accent">
          Click a sprite below to assign it to the selected slot
        </div>
      )}
    </div>
  );
}
