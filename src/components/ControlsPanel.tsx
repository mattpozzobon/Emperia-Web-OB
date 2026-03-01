import { useOBStore } from '../store';
import type { ThingType, FrameGroup } from '../lib/types';
import { ParamField, StepperBtn } from './ui-primitives';

interface ControlsPanelProps {
  thing: ThingType;
  group: FrameGroup;
  isOutfit: boolean;
  isDistance: boolean;
  previewMode: boolean;
  activeDirection: number;
  setActiveDirection: (d: number) => void;
  activePatternY: number;
  setActivePatternY: (p: number) => void;
  activeZ: number;
  setActiveZ: (z: number) => void;
  updateFrameGroupProp: (key: string, value: number) => void;
}

export function ControlsPanel({
  thing, group, isOutfit, isDistance, previewMode,
  activeDirection, setActiveDirection, activePatternY, setActivePatternY,
  activeZ, setActiveZ, updateFrameGroupProp,
}: ControlsPanelProps) {
  return (
    <div className="border-t border-emperia-border text-[10px]">

      {/* ═══════════════════════════════════════════════ */}
      {/* ── PATTERNS ─────────────────────────────────── */}
      {/* ═══════════════════════════════════════════════ */}
      <SectionHeader label="Patterns" />
      <div className="px-4 py-1.5 space-y-1.5">
        {/* Row 1: Size */}
        <div className="grid grid-cols-3 gap-x-3 gap-y-1 bg-emperia-surface/40 rounded px-2 py-1.5">
          <ParamField label="Width" value={group.width} onChange={(v) => updateFrameGroupProp('width', v)} min={1} max={4} />
          <ParamField label="Height" value={group.height} onChange={(v) => updateFrameGroupProp('height', v)} min={1} max={4} />
          <ParamField label="Crop Size" value={32} readOnly />
        </div>
        {/* Row 2: Patterns (blue) */}
        <div className="grid grid-cols-3 gap-x-3 gap-y-1 bg-blue-950/20 border border-blue-500/10 rounded px-2 py-1.5">
          <ParamField label="Pattern X" value={group.patternX} onChange={(v) => updateFrameGroupProp('patternX', v)} min={1} max={8} labelClassName="text-[10px] text-blue-400/80" />
          <ParamField label="Pattern Y" value={group.patternY} onChange={(v) => updateFrameGroupProp('patternY', v)} min={1} max={8} labelClassName="text-[10px] text-blue-400/80" />
          <ParamField label="Pattern Z" value={group.patternZ} onChange={(v) => updateFrameGroupProp('patternZ', v)} min={1} max={8} labelClassName="text-[10px] text-blue-400/80" />
        </div>
        {/* Row 3: Layers + Animations (individually color-coded to match their sections) */}
        <div className="grid grid-cols-2 gap-x-2">
          <div className="bg-purple-950/20 border border-purple-500/10 rounded px-2 py-1.5">
            <ParamField label="Layers" value={group.layers} onChange={(v) => updateFrameGroupProp('layers', v)} min={1} max={255} labelClassName="text-[10px] text-purple-400/80" />
          </div>
          <div className="bg-emerald-950/20 border border-emerald-500/10 rounded px-2 py-1.5">
            <ParamField label="Animations" value={group.animationLength} onChange={(v) => updateFrameGroupProp('animationLength', v)} min={1} max={999} labelClassName="text-[10px] text-emerald-400/80" />
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════ */}
      {/* ── PREVIEW (direction / pattern selectors) ─── */}
      {/* ═══════════════════════════════════════════════ */}
      <PreviewControls
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
      />

    </div>
  );
}

function SectionHeader({ label, colorClass }: { label: string; colorClass?: string }) {
  return (
    <div className={`px-4 py-1 border-y border-emperia-border/40 ${colorClass ?? 'bg-emperia-surface/60'}`}>
      <span className={`text-[9px] font-semibold uppercase tracking-wider ${colorClass ? 'text-inherit opacity-80' : 'text-emperia-muted'}`}>{label}</span>
    </div>
  );
}

function PreviewControls({
  group, isOutfit, isDistance, previewMode,
  activeDirection, setActiveDirection, activePatternY, setActivePatternY,
  activeZ, setActiveZ,
}: {
  group: FrameGroup;
  isOutfit: boolean;
  isDistance: boolean;
  previewMode: boolean;
  activeDirection: number;
  setActiveDirection: (d: number) => void;
  activePatternY: number;
  setActivePatternY: (p: number) => void;
  activeZ: number;
  setActiveZ: (z: number) => void;
}) {
  const showDirection = group.patternX > 4 && !isDistance;
  const showPatternY = group.patternY > 1 && !isDistance;
  const showPatternZ = group.patternZ > 1;
  if (!previewMode || !(showDirection || showPatternY || showPatternZ)) return null;

  return (
    <>
      <SectionHeader label="Preview" />
      <div className="px-4 py-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">

        {/* Direction (Pattern X) — stepper fallback for non-outfit/distance with >4 patternX */}
        {showDirection && (
          <div className="flex items-center gap-1">
            <span className="text-emperia-muted shrink-0">Direction:</span>
            <StepperBtn onClick={() => setActiveDirection(Math.max(0, activeDirection - 1))}>‹</StepperBtn>
            <span className="text-emperia-text font-mono w-10 text-center">{activeDirection + 1}/{group.patternX}</span>
            <StepperBtn onClick={() => setActiveDirection(Math.min(group.patternX - 1, activeDirection + 1))}>›</StepperBtn>
          </div>
        )}

        {/* Pattern Y — addons for outfits, or generic pattern Y */}
        {showPatternY && (
          <div className="flex items-center gap-1">
            <span className="text-emperia-muted shrink-0">{isOutfit ? 'Addon:' : 'Pat Y:'}</span>
            <StepperBtn onClick={() => setActivePatternY(Math.max(0, activePatternY - 1))}>‹</StepperBtn>
            <span className="text-emperia-text font-mono w-8 text-center text-[9px]">
              {isOutfit ? (activePatternY === 0 ? 'None' : `#${activePatternY}`) : `${activePatternY + 1}/${group.patternY}`}
            </span>
            <StepperBtn onClick={() => setActivePatternY(Math.min(group.patternY - 1, activePatternY + 1))}>›</StepperBtn>
          </div>
        )}

        {/* Pattern Z */}
        {showPatternZ && (
          <div className="flex items-center gap-1">
            <span className="text-emperia-muted shrink-0">{isOutfit ? 'Mount:' : 'Pat Z:'}</span>
            <StepperBtn onClick={() => setActiveZ(Math.max(0, activeZ - 1))}>‹</StepperBtn>
            <span className="text-emperia-text font-mono w-8 text-center text-[9px]">{activeZ + 1}/{group.patternZ}</span>
            <StepperBtn onClick={() => setActiveZ(Math.min(group.patternZ - 1, activeZ + 1))}>›</StepperBtn>
          </div>
        )}

      </div>
    </>
  );
}


