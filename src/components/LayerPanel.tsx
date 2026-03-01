import { useCallback } from 'react';
import { useOBStore } from '../store';
import { clearSpriteCache } from '../lib/sprite-decoder';
import { paletteToCSS, OUTFIT_PALETTE, PALETTE_SIZE } from '../lib/outfit-colors';
import type { OutfitColorIndices } from '../lib/outfit-colors';
import { ParamField, StepperBtn } from './ui-primitives';

export function LayerPanel() {
  const selectedId = useOBStore((s) => s.selectedThingId);
  const objectData = useOBStore((s) => s.objectData);
  const category = useOBStore((s) => s.activeCategory);
  const editVersion = useOBStore((s) => s.editVersion);

  const activeLayer = useOBStore((s) => s.activeLayer);
  const blendLayers = useOBStore((s) => s.blendLayers);
  const currentFrame = useOBStore((s) => s.currentFrame);
  const playing = useOBStore((s) => s.playing);
  const outfitColors = useOBStore((s) => s.outfitColors);
  const showColorPicker = useOBStore((s) => s.showColorPicker);

  const thing = selectedId != null ? objectData?.things.get(selectedId) ?? null : null;
  const isOutfit = category === 'outfit';

  // Use first frame group for layer count (could be extended to track activeGroup)
  const group = thing?.frameGroups[0] ?? null;
  const hasMultipleLayers = group ? group.layers > 1 : false;
  const isAnimated = group ? group.animationLength > 1 : false;
  const showOffset = isOutfit || (thing?.flags.hasDisplacement ?? false);
  const showColors = isOutfit && blendLayers && (group?.layers ?? 0) >= 2;

  const updateFrameGroupProp = useCallback((key: string, value: number) => {
    if (!thing || !group) return;
    (group as unknown as Record<string, unknown>)[key] = value;

    const total = group.width * group.height * group.layers * group.patternX * group.patternY * group.patternZ * group.animationLength;
    if (group.sprites.length < total) {
      while (group.sprites.length < total) group.sprites.push(0);
    } else if (group.sprites.length > total) {
      group.sprites.length = total;
    }

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

  if (!thing || (!hasMultipleLayers && !showOffset && !isAnimated)) return null;

  return (
    <div className="border-t border-emperia-border text-[10px]">

      {/* ── LAYER ── */}
      {hasMultipleLayers && group && (
        <>
          <div className="px-2 py-1 bg-purple-950/30 border-b border-emperia-border/40">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-purple-400 opacity-80">Layer</span>
          </div>
          <div className="px-3 py-1.5 flex items-center gap-1">
            <span className="text-emperia-muted shrink-0">Layer:</span>
            <StepperBtn onClick={() => useOBStore.setState({ activeLayer: Math.max(0, activeLayer - 1), blendLayers: false })} disabled={blendLayers}>‹</StepperBtn>
            <span className={`font-mono w-8 text-center text-[9px] ${blendLayers ? 'text-emperia-muted' : 'text-emperia-text'}`}>
              {blendLayers ? 'All' : `${activeLayer + 1}/${group.layers}`}
            </span>
            <StepperBtn onClick={() => useOBStore.setState({ activeLayer: Math.min(group.layers - 1, activeLayer + 1), blendLayers: false })} disabled={blendLayers}>›</StepperBtn>
            <label className="flex items-center gap-0.5 cursor-pointer ml-1">
              <input type="checkbox" checked={blendLayers} onChange={() => useOBStore.setState({ blendLayers: !blendLayers })} className="w-2.5 h-2.5 accent-emperia-accent" />
              <span className="text-emperia-muted text-[9px]">Blend</span>
            </label>
          </div>
        </>
      )}

      {/* ── ANIMATION ── */}
      {isAnimated && group && (
        <>
          <div className="px-2 py-1 bg-emerald-950/30 border-y border-emperia-border/40">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-emerald-400 opacity-80">Animation</span>
          </div>
          <div className="px-3 py-1.5">
            {/* Frame stepper + play */}
            <div className="flex items-center gap-1 mb-1">
              <span className="text-emperia-muted shrink-0">Frame:</span>
              <StepperBtn onClick={() => { useOBStore.setState({ currentFrame: (currentFrame - 1 + group.animationLength) % group.animationLength, playing: false }); }}>‹</StepperBtn>
              <span className="text-emperia-text font-mono w-10 text-center text-[9px]">{currentFrame + 1}/{group.animationLength}</span>
              <StepperBtn onClick={() => { useOBStore.setState({ currentFrame: (currentFrame + 1) % group.animationLength, playing: false }); }}>›</StepperBtn>
              <button
                onClick={() => useOBStore.setState({ playing: !playing })}
                className={`ml-1 px-1.5 py-0.5 rounded text-[9px] transition-colors ${playing ? 'bg-emperia-accent text-white' : 'bg-emperia-surface border border-emperia-border text-emperia-muted hover:text-emperia-text'}`}
              >{playing ? 'Stop' : 'Play'}</button>
            </div>

            {/* Settings grid */}
            <div className="grid grid-cols-3 gap-x-3 gap-y-1">
              <div className="flex items-center gap-1">
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
              <ParamField label="Loop" value={group.nLoop} min={0} max={255} onChange={(v) => updateFrameGroupProp('nLoop', v)} />
              <ParamField label="Start" value={group.start} min={0} max={group.animationLength - 1} onChange={(v) => updateFrameGroupProp('start', v)} />
            </div>

            {/* Per-frame durations */}
            {group.animationLengths[currentFrame] && (
              <div className="grid grid-cols-3 gap-x-3 gap-y-1 mt-1 pt-1 border-t border-emperia-border/20">
                <div className="col-span-3 text-[8px] text-emperia-muted">Frame {currentFrame + 1} duration (ms)</div>
                <ParamField label="Min" value={group.animationLengths[currentFrame].min} min={0} max={65535}
                  onChange={(v) => {
                    group.animationLengths[currentFrame].min = v;
                    thing.rawBytes = undefined;
                    const store = useOBStore.getState();
                    const ids = new Set(store.dirtyIds); ids.add(thing.id);
                    useOBStore.setState({ dirty: true, dirtyIds: ids, editVersion: store.editVersion + 1 });
                  }}
                />
                <ParamField label="Max" value={group.animationLengths[currentFrame].max} min={0} max={65535}
                  onChange={(v) => {
                    group.animationLengths[currentFrame].max = v;
                    thing.rawBytes = undefined;
                    const store = useOBStore.getState();
                    const ids = new Set(store.dirtyIds); ids.add(thing.id);
                    useOBStore.setState({ dirty: true, dirtyIds: ids, editVersion: store.editVersion + 1 });
                  }}
                />
                <div />
              </div>
            )}
          </div>
        </>
      )}

      {/* ── OFFSET ── */}
      {showOffset && (
        <>
          <div className="px-2 py-1 bg-emperia-surface/60 border-y border-emperia-border/40">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-emperia-muted">Offset</span>
          </div>
          <div className="px-3 py-1.5 grid grid-cols-2 gap-x-3 gap-y-1">
            <ParamField label="X" value={thing.flags.displacementX ?? 0} min={-512} max={512}
              onChange={(v) => {
                useOBStore.getState().updateThingFlags(thing.id, { ...thing.flags, hasDisplacement: true, displacementX: v });
              }}
            />
            <ParamField label="Y" value={thing.flags.displacementY ?? 0} min={-512} max={512}
              onChange={(v) => {
                useOBStore.getState().updateThingFlags(thing.id, { ...thing.flags, hasDisplacement: true, displacementY: v });
              }}
            />
          </div>
        </>
      )}

      {/* ── OUTFIT COLORS ── */}
      {showColors && (
        <>
          <div className="px-2 py-1 bg-emperia-surface/60 border-y border-emperia-border/40">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-emperia-muted">Colors</span>
          </div>
          <div className="px-3 py-1.5">
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              {(['head', 'body', 'legs', 'feet'] as const).map((channel) => (
                <div key={channel} className="flex items-center gap-1">
                  <button
                    onClick={() => useOBStore.setState({ showColorPicker: showColorPicker === channel ? null : channel })}
                    className="w-4 h-4 rounded border border-emperia-border shrink-0"
                    style={{ backgroundColor: paletteToCSS(outfitColors[channel]) }}
                    title={`${channel}: ${outfitColors[channel]}`}
                  />
                  <span className="text-emperia-muted capitalize text-[9px]">{channel}</span>
                  <StepperBtn onClick={() => useOBStore.setState({ outfitColors: { ...outfitColors, [channel]: Math.max(0, outfitColors[channel] - 1) } })}>‹</StepperBtn>
                  <span className="text-emperia-text font-mono w-5 text-center text-[9px]">{outfitColors[channel]}</span>
                  <StepperBtn onClick={() => useOBStore.setState({ outfitColors: { ...outfitColors, [channel]: Math.min(PALETTE_SIZE - 1, outfitColors[channel] + 1) } })}>›</StepperBtn>
                </div>
              ))}
            </div>
            {showColorPicker && (
              <div className="mt-1 p-1 bg-emperia-surface border border-emperia-border rounded grid gap-px" style={{ gridTemplateColumns: 'repeat(19, 14px)' }}>
                {OUTFIT_PALETTE.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => { useOBStore.setState({ outfitColors: { ...outfitColors, [showColorPicker]: idx }, showColorPicker: null }); }}
                    className={`w-3.5 h-3.5 rounded-sm border ${outfitColors[showColorPicker] === idx ? 'border-white' : 'border-transparent'}`}
                    style={{ backgroundColor: paletteToCSS(idx) }}
                    title={`${idx}`}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}

    </div>
  );
}
