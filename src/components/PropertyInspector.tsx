import { type ReactNode, useCallback } from 'react';
import { useOBStore } from '../store';
import type { ThingFlags } from '../lib/types';

// All boolean flags with their display labels
const BOOL_FLAGS: { key: keyof ThingFlags; label: string }[] = [
  { key: 'ground', label: 'Ground' },
  { key: 'groundBorder', label: 'Ground Border' },
  { key: 'onBottom', label: 'On Bottom' },
  { key: 'onTop', label: 'On Top' },
  { key: 'container', label: 'Container' },
  { key: 'stackable', label: 'Stackable' },
  { key: 'forceUse', label: 'Force Use' },
  { key: 'multiUse', label: 'Multi Use' },
  { key: 'writable', label: 'Writable' },
  { key: 'writableOnce', label: 'Writable Once' },
  { key: 'fluidContainer', label: 'Fluid Container' },
  { key: 'splash', label: 'Splash' },
  { key: 'notWalkable', label: 'Not Walkable' },
  { key: 'notMoveable', label: 'Not Moveable' },
  { key: 'blockProjectile', label: 'Block Projectile' },
  { key: 'notPathable', label: 'Not Pathable' },
  { key: 'pickupable', label: 'Pickupable' },
  { key: 'hangable', label: 'Hangable' },
  { key: 'hookSouth', label: 'Hook South' },
  { key: 'hookEast', label: 'Hook East' },
  { key: 'rotateable', label: 'Rotateable' },
  { key: 'hasLight', label: 'Light' },
  { key: 'dontHide', label: "Don't Hide" },
  { key: 'translucent', label: 'Translucent' },
  { key: 'hasDisplacement', label: 'Displacement' },
  { key: 'hasElevation', label: 'Elevation' },
  { key: 'lyingCorpse', label: 'Lying Corpse' },
  { key: 'animateAlways', label: 'Animate Always' },
  { key: 'hasMinimapColor', label: 'Minimap Color' },
  { key: 'fullGround', label: 'Full Ground' },
  { key: 'look', label: 'Look' },
  { key: 'cloth', label: 'Cloth' },
  { key: 'hasMarket', label: 'Market' },
  { key: 'usable', label: 'Usable' },
  { key: 'wrapable', label: 'Wrapable' },
  { key: 'unwrapable', label: 'Unwrapable' },
  { key: 'topEffect', label: 'Top Effect' },
  { key: 'noMoveAnimation', label: 'No Move Animation' },
  { key: 'chargeable', label: 'Chargeable' },
];

// Numeric properties tied to specific flags
interface NumericProp {
  key: keyof ThingFlags;
  label: string;
  parentFlag?: keyof ThingFlags;
  min?: number;
  max?: number;
}

const NUMERIC_PROPS: NumericProp[] = [
  { key: 'groundSpeed', label: 'Ground Speed', parentFlag: 'ground', min: 0, max: 65535 },
  { key: 'lightLevel', label: 'Light Level', parentFlag: 'hasLight', min: 0, max: 65535 },
  { key: 'lightColor', label: 'Light Color', parentFlag: 'hasLight', min: 0, max: 65535 },
  { key: 'displacementX', label: 'Displacement X', parentFlag: 'hasDisplacement', min: 0, max: 65535 },
  { key: 'displacementY', label: 'Displacement Y', parentFlag: 'hasDisplacement', min: 0, max: 65535 },
  { key: 'elevation', label: 'Elevation', parentFlag: 'hasElevation', min: 0, max: 65535 },
  { key: 'minimapColor', label: 'Minimap Color', parentFlag: 'hasMinimapColor', min: 0, max: 65535 },
  { key: 'clothSlot', label: 'Cloth Slot', parentFlag: 'cloth', min: 0, max: 65535 },
];

export function PropertyInspector({ showAttributesOnly }: { showAttributesOnly?: boolean } = {}) {
  const selectedId = useOBStore((s) => s.selectedThingId);
  const objectData = useOBStore((s) => s.objectData);
  const updateThingFlags = useOBStore((s) => s.updateThingFlags);
  // Subscribe to editVersion so edits cause re-render
  useOBStore((s) => s.editVersion);

  const thing = selectedId != null ? objectData?.things.get(selectedId) ?? null : null;

  const toggleFlag = useCallback((key: keyof ThingFlags) => {
    if (!thing) return;
    const newFlags = { ...thing.flags };
    (newFlags as Record<string, unknown>)[key] = !newFlags[key];

    // When toggling off a parent flag, clear its associated values
    if (!newFlags[key]) {
      if (key === 'ground') newFlags.groundSpeed = undefined;
      if (key === 'hasLight') { newFlags.lightLevel = undefined; newFlags.lightColor = undefined; }
      if (key === 'hasDisplacement') { newFlags.displacementX = undefined; newFlags.displacementY = undefined; }
      if (key === 'hasElevation') newFlags.elevation = undefined;
      if (key === 'hasMinimapColor') newFlags.minimapColor = undefined;
      if (key === 'cloth') newFlags.clothSlot = undefined;
    }
    // When toggling on a parent flag, set defaults
    if (newFlags[key]) {
      if (key === 'ground' && newFlags.groundSpeed == null) newFlags.groundSpeed = 100;
      if (key === 'hasLight') { if (newFlags.lightLevel == null) newFlags.lightLevel = 7; if (newFlags.lightColor == null) newFlags.lightColor = 215; }
      if (key === 'hasDisplacement') { if (newFlags.displacementX == null) newFlags.displacementX = 8; if (newFlags.displacementY == null) newFlags.displacementY = 8; }
      if (key === 'hasElevation' && newFlags.elevation == null) newFlags.elevation = 8;
      if (key === 'hasMinimapColor' && newFlags.minimapColor == null) newFlags.minimapColor = 0;
      if (key === 'cloth' && newFlags.clothSlot == null) newFlags.clothSlot = 0;
    }

    updateThingFlags(thing.id, newFlags);
  }, [thing, updateThingFlags]);

  const setNumericProp = useCallback((key: keyof ThingFlags, value: number) => {
    if (!thing) return;
    const newFlags = { ...thing.flags, [key]: value };
    updateThingFlags(thing.id, newFlags);
  }, [thing, updateThingFlags]);

  if (!thing) {
    return (
      <div className="p-4 text-emperia-muted text-sm">
        No object selected
      </div>
    );
  }

  if (showAttributesOnly) {
    return (
      <div className="p-3 text-xs space-y-4">
        <Section title="Identity">
          <ReadonlyRow label="ID" value={thing.id} />
          <ReadonlyRow label="Category" value={thing.category} />
        </Section>

        {thing.frameGroups.map((fg, i) => (
          <Section key={i} title={`Frame Group ${i}${thing.category === 'outfit' ? (i === 0 ? ' (Idle)' : ' (Moving)') : ''}`}>
            <ReadonlyRow label="Size" value={`${fg.width}x${fg.height}`} />
            <ReadonlyRow label="Layers" value={fg.layers} />
            <ReadonlyRow label="Pattern X" value={fg.patternX} />
            <ReadonlyRow label="Pattern Y" value={fg.patternY} />
            <ReadonlyRow label="Pattern Z" value={fg.patternZ} />
            <ReadonlyRow label="Animations" value={fg.animationLength} />
            <ReadonlyRow label="Sprites" value={fg.sprites.length} />
            {fg.animationLength > 1 && (
              <>
                <ReadonlyRow label="Async" value={fg.asynchronous ? 'Yes' : 'No'} />
                <ReadonlyRow label="Loop Count" value={fg.nLoop === 0 ? 'Infinite' : fg.nLoop} />
                <ReadonlyRow label="Start Frame" value={fg.start} />
              </>
            )}
          </Section>
        ))}

        <Section title="Active Flags">
          <div className="space-y-0.5">
            {BOOL_FLAGS.filter(({ key }) => !!thing.flags[key]).map(({ key, label }) => (
              <div key={key} className="text-emperia-text text-xs">{label}</div>
            ))}
            {BOOL_FLAGS.every(({ key }) => !thing.flags[key]) && (
              <span className="text-emperia-muted italic">None</span>
            )}
          </div>
        </Section>
      </div>
    );
  }

  return (
    <div className="p-3 text-xs space-y-4">
      <Section title="Identity">
        <ReadonlyRow label="ID" value={thing.id} />
        <ReadonlyRow label="Category" value={thing.category} />
      </Section>

      <Section title="Flags">
        <div className="grid grid-cols-1 gap-0">
          {BOOL_FLAGS.map(({ key, label }) => (
            <label
              key={key}
              className="flex items-center gap-2 py-[3px] px-1 rounded hover:bg-emperia-hover cursor-pointer select-none"
            >
              <input
                type="checkbox"
                checked={!!thing.flags[key]}
                onChange={() => toggleFlag(key)}
                className="w-3 h-3 rounded border-emperia-border bg-emperia-surface accent-emperia-accent cursor-pointer"
              />
              <span className={thing.flags[key] ? 'text-emperia-text' : 'text-emperia-muted'}>
                {label}
              </span>
            </label>
          ))}
        </div>
      </Section>

      <Section title="Properties">
        <NumericPropsEditor flags={thing.flags} onChange={setNumericProp} />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="text-emperia-accent font-semibold text-[11px] uppercase tracking-wider mb-1.5 pb-1 border-b border-emperia-border">
        {title}
      </h3>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function ReadonlyRow({ label, value }: { label: string; value: string | number | boolean }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="text-emperia-muted">{label}</span>
      <span className="text-emperia-text font-mono">{String(value)}</span>
    </div>
  );
}

function NumericPropsEditor({
  flags,
  onChange,
}: {
  flags: ThingFlags;
  onChange: (key: keyof ThingFlags, value: number) => void;
}) {
  const visibleProps = NUMERIC_PROPS.filter((p) => {
    if (!p.parentFlag) return true;
    return !!flags[p.parentFlag];
  });

  if (visibleProps.length === 0) {
    return <span className="text-emperia-muted italic">No active properties</span>;
  }

  return (
    <div className="space-y-1">
      {visibleProps.map((p) => (
        <div key={p.key} className="flex items-center justify-between gap-2">
          <span className="text-emperia-muted shrink-0">{p.label}</span>
          <input
            type="number"
            value={flags[p.key] as number ?? 0}
            min={p.min}
            max={p.max}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v)) onChange(p.key, Math.max(p.min ?? 0, Math.min(p.max ?? 65535, v)));
            }}
            className="w-20 px-1.5 py-0.5 rounded bg-emperia-surface border border-emperia-border
                       text-emperia-text font-mono text-right text-xs outline-none
                       focus:border-emperia-accent transition-colors"
          />
        </div>
      ))}
    </div>
  );
}
