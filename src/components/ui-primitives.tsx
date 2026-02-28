import type { FrameGroup } from '../lib/types';

export function ParamField({
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

export function StepperBtn({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-5 h-5 flex items-center justify-center rounded bg-emperia-surface border border-emperia-border text-emperia-muted hover:text-emperia-text text-[10px] disabled:opacity-30"
    >{children}</button>
  );
}

export function NumInput({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
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

export function getSpriteIndex(
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
