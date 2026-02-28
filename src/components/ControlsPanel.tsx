import { useOBStore } from '../store';
import { paletteToCSS, OUTFIT_PALETTE, PALETTE_SIZE } from '../lib/outfit-colors';
import type { OutfitColorIndices } from '../lib/outfit-colors';
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
  activeLayer: number;
  setActiveLayer: (l: number) => void;
  blendLayers: boolean;
  setBlendLayers: (b: boolean) => void;
  currentFrame: number;
  setCurrentFrame: (f: number) => void;
  playing: boolean;
  setPlaying: (p: boolean) => void;
  outfitColors: OutfitColorIndices;
  setOutfitColors: (c: OutfitColorIndices) => void;
  showColorPicker: keyof OutfitColorIndices | null;
  setShowColorPicker: (c: keyof OutfitColorIndices | null) => void;
  updateFrameGroupProp: (key: string, value: number) => void;
}

export function ControlsPanel({
  thing, group, isOutfit, isDistance, previewMode,
  activeDirection, setActiveDirection, activePatternY, setActivePatternY,
  activeZ, setActiveZ, activeLayer, setActiveLayer,
  blendLayers, setBlendLayers, currentFrame, setCurrentFrame,
  playing, setPlaying, outfitColors, setOutfitColors,
  showColorPicker, setShowColorPicker, updateFrameGroupProp,
}: ControlsPanelProps) {
  return (
    <div className="border-t border-emperia-border">
      <div className="px-4 py-2">
        <div className="grid grid-cols-3 gap-x-3 gap-y-1 text-[10px]">

          {/* ── Dimensions ──────────────────────────────── */}
          <div className="col-span-3 text-[9px] font-medium text-emperia-muted uppercase tracking-wider">Dimensions</div>
          <ParamField label="Width" value={group.width} onChange={(v) => updateFrameGroupProp('width', v)} min={1} max={4} />
          <ParamField label="Height" value={group.height} onChange={(v) => updateFrameGroupProp('height', v)} min={1} max={4} />
          <ParamField label="Layers" value={group.layers} onChange={(v) => updateFrameGroupProp('layers', v)} min={1} max={4} />
          <ParamField label="Pat X" value={group.patternX} onChange={(v) => updateFrameGroupProp('patternX', v)} min={1} max={8} />
          <ParamField label="Pat Y" value={group.patternY} onChange={(v) => updateFrameGroupProp('patternY', v)} min={1} max={8} />
          <ParamField label="Pat Z" value={group.patternZ} onChange={(v) => updateFrameGroupProp('patternZ', v)} min={1} max={8} />
          <ParamField label="Frames" value={group.animationLength} onChange={(v) => updateFrameGroupProp('animationLength', v)} min={1} max={255} />
          <ParamField label="Crop" value={32} readOnly />
          <div />

          {/* ── Preview Controls ────────────────────────── */}
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
            activeLayer={activeLayer}
            setActiveLayer={setActiveLayer}
            blendLayers={blendLayers}
            setBlendLayers={setBlendLayers}
          />

          {/* ── Animation ───────────────────────────────── */}
          <AnimationControls
            thing={thing}
            group={group}
            currentFrame={currentFrame}
            setCurrentFrame={setCurrentFrame}
            playing={playing}
            setPlaying={setPlaying}
            updateFrameGroupProp={updateFrameGroupProp}
          />

          {/* ── Offset ──────────────────────────────────── */}
          {(isOutfit || thing.flags.hasDisplacement) && (
            <>
              <div className="col-span-3 text-[9px] font-medium text-emperia-muted uppercase tracking-wider mt-1 pt-1 border-t border-emperia-border/30">Offset</div>
              <div className="col-span-1">
                <ParamField label="X" value={thing.flags.displacementX ?? 0} min={-512} max={512}
                  onChange={(v) => {
                    useOBStore.getState().updateThingFlags(thing.id, { ...thing.flags, hasDisplacement: true, displacementX: v });
                  }}
                />
              </div>
              <div className="col-span-1">
                <ParamField label="Y" value={thing.flags.displacementY ?? 0} min={-512} max={512}
                  onChange={(v) => {
                    useOBStore.getState().updateThingFlags(thing.id, { ...thing.flags, hasDisplacement: true, displacementY: v });
                  }}
                />
              </div>
              <div className="col-span-1" />
            </>
          )}

          {/* ── Outfit Colors ──────────────────────────── */}
          {isOutfit && blendLayers && group.layers >= 2 && (
            <OutfitColorControls
              outfitColors={outfitColors}
              setOutfitColors={setOutfitColors}
              showColorPicker={showColorPicker}
              setShowColorPicker={setShowColorPicker}
            />
          )}

        </div>
      </div>
    </div>
  );
}

function PreviewControls({
  group, isOutfit, isDistance, previewMode,
  activeDirection, setActiveDirection, activePatternY, setActivePatternY,
  activeZ, setActiveZ, activeLayer, setActiveLayer,
  blendLayers, setBlendLayers,
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
  activeLayer: number;
  setActiveLayer: (l: number) => void;
  blendLayers: boolean;
  setBlendLayers: (b: boolean) => void;
}) {
  if (!previewMode || !(group.patternX > 1 || group.patternY > 1 || group.patternZ > 1 || group.layers > 1)) return null;

  return (
    <>
      <div className="col-span-3 text-[9px] font-medium text-emperia-muted uppercase tracking-wider mt-1 pt-1 border-t border-emperia-border/30">Preview</div>

      {/* Direction (Pattern X) — stepper fallback for non-outfit/distance with >4 patternX */}
      {group.patternX > 4 && !isDistance && (
        <div className="col-span-3 flex items-center gap-1">
          <span className="text-emperia-muted shrink-0">Direction:</span>
          <StepperBtn onClick={() => setActiveDirection(Math.max(0, activeDirection - 1))}>‹</StepperBtn>
          <span className="text-emperia-text font-mono w-10 text-center">{activeDirection + 1}/{group.patternX}</span>
          <StepperBtn onClick={() => setActiveDirection(Math.min(group.patternX - 1, activeDirection + 1))}>›</StepperBtn>
        </div>
      )}

      {/* Pattern Y — addons for outfits, or generic pattern Y */}
      {group.patternY > 1 && !isDistance && (
        <div className="col-span-1 flex items-center gap-1">
          <span className="text-emperia-muted shrink-0">{isOutfit ? 'Addon:' : 'Pat Y:'}</span>
          <StepperBtn onClick={() => setActivePatternY(Math.max(0, activePatternY - 1))}>‹</StepperBtn>
          <span className="text-emperia-text font-mono w-8 text-center text-[9px]">
            {isOutfit ? (activePatternY === 0 ? 'None' : `#${activePatternY}`) : `${activePatternY + 1}/${group.patternY}`}
          </span>
          <StepperBtn onClick={() => setActivePatternY(Math.min(group.patternY - 1, activePatternY + 1))}>›</StepperBtn>
        </div>
      )}

      {/* Pattern Z */}
      {group.patternZ > 1 && (
        <div className="col-span-1 flex items-center gap-1">
          <span className="text-emperia-muted shrink-0">{isOutfit ? 'Mount:' : 'Pat Z:'}</span>
          <StepperBtn onClick={() => setActiveZ(Math.max(0, activeZ - 1))}>‹</StepperBtn>
          <span className="text-emperia-text font-mono w-8 text-center text-[9px]">{activeZ + 1}/{group.patternZ}</span>
          <StepperBtn onClick={() => setActiveZ(Math.min(group.patternZ - 1, activeZ + 1))}>›</StepperBtn>
        </div>
      )}

      {/* Layer */}
      {group.layers > 1 && (
        <div className="col-span-1 flex items-center gap-1">
          <span className="text-emperia-muted shrink-0">Layer:</span>
          <StepperBtn onClick={() => setActiveLayer(Math.max(0, activeLayer - 1))} disabled={blendLayers}>‹</StepperBtn>
          <span className={`font-mono w-8 text-center text-[9px] ${blendLayers ? 'text-emperia-muted' : 'text-emperia-text'}`}>
            {blendLayers ? 'All' : `${activeLayer + 1}/${group.layers}`}
          </span>
          <StepperBtn onClick={() => setActiveLayer(Math.min(group.layers - 1, activeLayer + 1))} disabled={blendLayers}>›</StepperBtn>
          <label className="flex items-center gap-0.5 cursor-pointer ml-0.5">
            <input type="checkbox" checked={blendLayers} onChange={() => setBlendLayers(!blendLayers)} className="w-2.5 h-2.5 accent-emperia-accent" />
            <span className="text-emperia-muted text-[9px]">Blend</span>
          </label>
        </div>
      )}
    </>
  );
}

function AnimationControls({
  thing, group, currentFrame, setCurrentFrame, playing, setPlaying, updateFrameGroupProp,
}: {
  thing: ThingType;
  group: FrameGroup;
  currentFrame: number;
  setCurrentFrame: (f: number) => void;
  playing: boolean;
  setPlaying: (p: boolean) => void;
  updateFrameGroupProp: (key: string, value: number) => void;
}) {
  if (group.animationLength <= 1) return null;

  return (
    <>
      <div className="col-span-3 text-[9px] font-medium text-emperia-muted uppercase tracking-wider mt-1 pt-1 border-t border-emperia-border/30">Animation</div>
      <div className="col-span-2 flex items-center gap-1">
        <span className="text-emperia-muted shrink-0">Frame:</span>
        <StepperBtn onClick={() => { setCurrentFrame((currentFrame - 1 + group.animationLength) % group.animationLength); setPlaying(false); }}>‹</StepperBtn>
        <span className="text-emperia-text font-mono w-8 text-center text-[9px]">{currentFrame + 1}/{group.animationLength}</span>
        <StepperBtn onClick={() => { setCurrentFrame((currentFrame + 1) % group.animationLength); setPlaying(false); }}>›</StepperBtn>
        <button
          onClick={() => setPlaying(!playing)}
          className={`ml-0.5 px-1.5 py-0.5 rounded text-[9px] transition-colors ${playing ? 'bg-emperia-accent text-white' : 'bg-emperia-surface border border-emperia-border text-emperia-muted hover:text-emperia-text'}`}
        >{playing ? 'Stop' : 'Play'}</button>
      </div>
      <div className="col-span-1 flex items-center gap-1">
        <span className="text-emperia-muted shrink-0">Mode:</span>
        <select
          value={group.asynchronous}
          onChange={(e) => updateFrameGroupProp('asynchronous', Number(e.target.value))}
          className="flex-1 px-1 py-0 bg-emperia-surface border border-emperia-border rounded text-[9px] text-emperia-text outline-none focus:border-emperia-accent"
        >
          <option value={0}>Sync</option>
          <option value={1}>Async</option>
        </select>
      </div>
      <div className="col-span-1">
        <ParamField label="Loops" value={group.nLoop} min={0} max={255} onChange={(v) => updateFrameGroupProp('nLoop', v)} />
      </div>
      <div className="col-span-1">
        <ParamField label="Start" value={group.start} min={0} max={group.animationLength - 1} onChange={(v) => updateFrameGroupProp('start', v)} />
      </div>
      <div className="col-span-1" />

      {/* Per-frame durations */}
      {group.animationLengths[currentFrame] && (
        <>
          <div className="col-span-3 text-[8px] text-emperia-muted mt-0.5">Frame {currentFrame + 1} duration (ms)</div>
          <div className="col-span-1">
            <ParamField label="Min" value={group.animationLengths[currentFrame].min} min={0} max={65535}
              onChange={(v) => {
                group.animationLengths[currentFrame].min = v;
                thing.rawBytes = undefined;
                const store = useOBStore.getState();
                const ids = new Set(store.dirtyIds); ids.add(thing.id);
                useOBStore.setState({ dirty: true, dirtyIds: ids, editVersion: store.editVersion + 1 });
              }}
            />
          </div>
          <div className="col-span-1">
            <ParamField label="Max" value={group.animationLengths[currentFrame].max} min={0} max={65535}
              onChange={(v) => {
                group.animationLengths[currentFrame].max = v;
                thing.rawBytes = undefined;
                const store = useOBStore.getState();
                const ids = new Set(store.dirtyIds); ids.add(thing.id);
                useOBStore.setState({ dirty: true, dirtyIds: ids, editVersion: store.editVersion + 1 });
              }}
            />
          </div>
          <div className="col-span-1" />
        </>
      )}
    </>
  );
}

function OutfitColorControls({
  outfitColors, setOutfitColors, showColorPicker, setShowColorPicker,
}: {
  outfitColors: OutfitColorIndices;
  setOutfitColors: (c: OutfitColorIndices) => void;
  showColorPicker: keyof OutfitColorIndices | null;
  setShowColorPicker: (c: keyof OutfitColorIndices | null) => void;
}) {
  return (
    <>
      <div className="col-span-3 text-[9px] font-medium text-emperia-muted uppercase tracking-wider mt-1 pt-1 border-t border-emperia-border/30">Colors</div>
      {(['head', 'body', 'legs', 'feet'] as const).map((channel) => (
        <div key={channel} className="col-span-1 flex items-center gap-1">
          <button
            onClick={() => setShowColorPicker(showColorPicker === channel ? null : channel)}
            className="w-4 h-4 rounded border border-emperia-border shrink-0"
            style={{ backgroundColor: paletteToCSS(outfitColors[channel]) }}
            title={`${channel}: ${outfitColors[channel]}`}
          />
          <span className="text-emperia-muted capitalize text-[9px]">{channel}</span>
          <StepperBtn onClick={() => setOutfitColors({ ...outfitColors, [channel]: Math.max(0, outfitColors[channel] - 1) })}>‹</StepperBtn>
          <span className="text-emperia-text font-mono w-5 text-center text-[9px]">{outfitColors[channel]}</span>
          <StepperBtn onClick={() => setOutfitColors({ ...outfitColors, [channel]: Math.min(PALETTE_SIZE - 1, outfitColors[channel] + 1) })}>›</StepperBtn>
        </div>
      ))}
      {showColorPicker && (
        <div className="col-span-3 p-1 bg-emperia-surface border border-emperia-border rounded grid gap-px" style={{ gridTemplateColumns: 'repeat(19, 14px)' }}>
          {OUTFIT_PALETTE.map((_, idx) => (
            <button
              key={idx}
              onClick={() => { setOutfitColors({ ...outfitColors, [showColorPicker]: idx }); setShowColorPicker(null); }}
              className={`w-3.5 h-3.5 rounded-sm border ${outfitColors[showColorPicker] === idx ? 'border-white' : 'border-transparent'}`}
              style={{ backgroundColor: paletteToCSS(idx) }}
              title={`${idx}`}
            />
          ))}
        </div>
      )}
    </>
  );
}
