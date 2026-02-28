import { type ReactNode, useCallback, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useOBStore } from '../store';
import type { ThingFlags } from '../lib/types';

// Numeric sub-properties shown inline when their parent flag is active
interface NumericProp {
  key: keyof ThingFlags;
  label: string;
  min?: number;
  max?: number;
}

// A single flag entry, optionally with inline numeric sub-properties
interface FlagEntry {
  key: keyof ThingFlags;
  label: string;
  numericProps?: NumericProp[];
}

// Organized flag groups — `wide` groups span full width (they have numeric sub-properties)
const FLAG_GROUPS: { title: string; flags: FlagEntry[]; wide?: boolean }[] = [
  {
    title: 'Ground & Stacking',
    wide: true,
    flags: [
      { key: 'ground', label: 'Ground', numericProps: [
        { key: 'groundSpeed', label: 'Speed', min: 0, max: 65535 },
      ]},
      { key: 'groundBorder', label: 'Ground Border' },
      { key: 'onBottom', label: 'On Bottom' },
      { key: 'onTop', label: 'On Top' },
      { key: 'fullGround', label: 'Full Ground' },
      { key: 'topEffect', label: 'Top Effect' },
    ],
  },
  {
    title: 'Blocking',
    flags: [
      { key: 'notWalkable', label: 'Not Walkable' },
      { key: 'notMoveable', label: 'Not Moveable' },
      { key: 'blockProjectile', label: 'Block Projectile' },
      { key: 'notPathable', label: 'Not Pathable' },
    ],
  },
  {
    title: 'Fluids',
    flags: [
      { key: 'fluidContainer', label: 'Fluid Container' },
      { key: 'splash', label: 'Splash' },
    ],
  },
  {
    title: 'Interaction',
    flags: [
      { key: 'pickupable', label: 'Pickupable' },
      { key: 'stackable', label: 'Stackable' },
      { key: 'container', label: 'Container' },
      { key: 'forceUse', label: 'Force Use' },
      { key: 'multiUse', label: 'Multi Use' },
      { key: 'usable', label: 'Usable' },
      { key: 'rotateable', label: 'Rotateable' },
      { key: 'wrapable', label: 'Wrapable' },
      { key: 'unwrapable', label: 'Unwrapable' },
    ],
  },
  {
    title: 'Hooks & Hanging',
    flags: [
      { key: 'hangable', label: 'Hangable' },
      { key: 'hookSouth', label: 'Hook South' },
      { key: 'hookEast', label: 'Hook East' },
    ],
  },
  {
    title: 'Writing',
    wide: true,
    flags: [
      { key: 'writable', label: 'Writable', numericProps: [
        { key: 'writableMaxLen', label: 'Max Length', min: 0, max: 65535 },
      ]},
      { key: 'writableOnce', label: 'Writable Once', numericProps: [
        { key: 'writableOnceMaxLen', label: 'Max Length', min: 0, max: 65535 },
      ]},
    ],
  },
  {
    title: 'Visual',
    wide: true,
    flags: [
      { key: 'hasLight', label: 'Light', numericProps: [
        { key: 'lightLevel', label: 'Level', min: 0, max: 65535 },
        { key: 'lightColor', label: 'Color', min: 0, max: 65535 },
      ]},
      { key: 'hasDisplacement', label: 'Displacement', numericProps: [
        { key: 'displacementX', label: 'X', min: 0, max: 65535 },
        { key: 'displacementY', label: 'Y', min: 0, max: 65535 },
      ]},
      { key: 'hasElevation', label: 'Elevation', numericProps: [
        { key: 'elevation', label: 'Height', min: 0, max: 65535 },
      ]},
      { key: 'hasMinimapColor', label: 'Minimap Color', numericProps: [
        { key: 'minimapColor', label: 'Color', min: 0, max: 65535 },
      ]},
      { key: 'translucent', label: 'Translucent' },
      { key: 'dontHide', label: "Don't Hide" },
      { key: 'animateAlways', label: 'Animate Always' },
      { key: 'noMoveAnimation', label: 'No Move Animation' },
    ],
  },
  {
    title: 'Equipment & Market',
    wide: true,
    flags: [
      { key: 'cloth', label: 'Cloth', numericProps: [
        { key: 'clothSlot', label: 'Slot', min: 0, max: 65535 },
      ]},
      { key: 'hasMarket', label: 'Market' },
      { key: 'chargeable', label: 'Chargeable' },
    ],
  },
  {
    title: 'Miscellaneous',
    flags: [
      { key: 'lyingCorpse', label: 'Lying Corpse' },
      { key: 'look', label: 'Look' },
    ],
  },
];

// Flat list for the attributes-only view
const ALL_BOOL_FLAGS = FLAG_GROUPS.flatMap(g => g.flags);

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
            {ALL_BOOL_FLAGS.filter(({ key }) => !!thing.flags[key]).map(({ key, label }) => (
              <div key={key} className="text-emperia-text text-xs">{label}</div>
            ))}
            {ALL_BOOL_FLAGS.every(({ key }) => !thing.flags[key]) && (
              <span className="text-emperia-muted italic">None</span>
            )}
          </div>
        </Section>
      </div>
    );
  }

  return (
    <div className="p-3 text-xs space-y-1">
      <div className="grid grid-cols-4 gap-1">
        {FLAG_GROUPS.map((group) => {
          const activeCount = group.flags.filter(f => !!thing.flags[f.key]).length;
          const span = group.wide ? 'col-span-2' : '';
          return (
            <div key={group.title} className={span}>
              <FlagGroupSection
                title={group.title}
                activeCount={activeCount}
                flags={group.flags}
                thingFlags={thing.flags}
                onToggle={toggleFlag}
                onNumericChange={setNumericProp}
              />
            </div>
          );
        })}
      </div>
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

function FlagGroupSection({
  title,
  activeCount,
  flags,
  thingFlags,
  onToggle,
  onNumericChange,
}: {
  title: string;
  activeCount: number;
  flags: FlagEntry[];
  thingFlags: ThingFlags;
  onToggle: (key: keyof ThingFlags) => void;
  onNumericChange: (key: keyof ThingFlags, value: number) => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="border border-emperia-border/50 rounded overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 bg-emperia-surface/60 hover:bg-emperia-surface transition-colors text-left"
      >
        {open
          ? <ChevronDown className="w-3 h-3 text-emperia-muted shrink-0" />
          : <ChevronRight className="w-3 h-3 text-emperia-muted shrink-0" />
        }
        <span className="text-[10px] font-semibold text-emperia-text uppercase tracking-wider flex-1">
          {title}
        </span>
        {activeCount > 0 && (
          <span className="text-[9px] font-medium text-emperia-accent bg-emperia-accent/15 px-1.5 py-0.5 rounded-full">
            {activeCount}
          </span>
        )}
      </button>
      {open && (
        <div className="px-1 py-0.5">
          {flags.map(({ key, label, numericProps }) => {
            const checked = !!thingFlags[key];
            return (
              <div key={key}>
                <label className="flex items-center gap-2 py-[3px] px-1 rounded hover:bg-emperia-hover cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(key)}
                    className="w-3 h-3 rounded border-emperia-border bg-emperia-surface accent-emperia-accent cursor-pointer"
                  />
                  <span className={checked ? 'text-emperia-text' : 'text-emperia-muted'}>
                    {label}
                  </span>
                </label>
                {checked && numericProps && numericProps.length > 0 && (
                  <div className="ml-7 mb-1 flex flex-wrap gap-x-3 gap-y-0.5">
                    {numericProps.map((np) => (
                      <div key={np.key} className="flex items-center gap-1.5">
                        <span className="text-emperia-muted text-[10px]">{np.label}</span>
                        <input
                          type="number"
                          value={thingFlags[np.key] as number ?? 0}
                          min={np.min}
                          max={np.max}
                          onChange={(e) => {
                            const v = parseInt(e.target.value, 10);
                            if (!isNaN(v)) onNumericChange(np.key, Math.max(np.min ?? 0, Math.min(np.max ?? 65535, v)));
                          }}
                          className="w-16 px-1 py-0.5 rounded bg-emperia-surface border border-emperia-border
                                     text-emperia-text font-mono text-right text-[10px] outline-none
                                     focus:border-emperia-accent transition-colors"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
