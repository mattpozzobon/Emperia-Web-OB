import { useCallback, useState } from 'react';
import { ChevronDown, ChevronRight, Copy, ClipboardPaste } from 'lucide-react';
import { useOBStore } from '../store';
import type { ThingCategory, ThingFlags } from '../lib/types';
import { ColorPalettePopover } from './ColorPalettePopover';
import { ServerPropertiesEditor } from './ServerPropertiesEditor';

// Numeric sub-properties shown inline when their parent flag is active
interface NumericProp {
  key: keyof ThingFlags;
  label: string;
  min?: number;
  max?: number;
  colorType?: 'light' | 'minimap';
  help?: string;
}

// A single flag entry, optionally with inline numeric sub-properties
interface FlagEntry {
  key: keyof ThingFlags;
  label: string;
  numericProps?: NumericProp[];
  help?: string;
  categories?: ThingCategory[];
}

const FLAG_HELP: Partial<Record<keyof ThingFlags, string>> = {
  ground: 'Client flag for floor tiles. Enables ground speed and makes the server derive ground group/friction.',
  groundBorder: 'Draws as a ground border/top-order tile and derives the server ground group.',
  onBottom: 'Renders below regular items on a tile.',
  onTop: 'Renders above regular items on a tile.',
  fullGround: 'Marks the sprite as filling the full tile for rendering and OTB export.',
  topEffect: 'Renders this effect above other tile layers.',
  renderBelowCreatures: 'Renders this positional effect after floor items but before creatures on the same tile.',
  notWalkable: 'Blocks creature movement through this item.',
  notMoveable: 'Prevents players from moving or dragging this item.',
  blockProjectile: 'Blocks projectiles and line-of-sight checks.',
  notPathable: 'Prevents pathfinding from using this tile.',
  fluidContainer: 'Client flag for buckets, vials, bottles, and similar containers. Usually pairs with server type fluidContainer.',
  splash: 'Client flag for splash/liquid puddle items. Usually pairs with server type splash.',
  pickupable: 'Allows the item to be picked up and moved into inventory/containers.',
  stackable: 'Allows multiple items to share one stack/count.',
  container: 'Client flag for containers. Usually pairs with server type container and containerSize.',
  forceUse: 'Makes the client/server treat the item as directly useable.',
  multiUse: 'Allows use-with interactions against another target.',
  usable: 'Legacy/client use action flag with an action id.',
  rotateable: 'Allows the item to rotate into its rotateTo target.',
  wrapable: 'Allows wrapping this item.',
  unwrapable: 'Allows unwrapping this item.',
  hangable: 'Allows this item to hang on wall hooks.',
  hookSouth: 'Wall hook orientation for south-facing walls.',
  hookEast: 'Wall hook orientation for east-facing walls.',
  writable: 'Allows text writing and stores a client max text length.',
  writableOnce: 'Allows text writing once, then locks further edits.',
  hasLight: 'Emits client light from the item sprite.',
  hasDisplacement: 'Offsets sprite drawing from the default tile position.',
  hasElevation: 'Adds visual height and can affect server height/standing behavior.',
  hasMinimapColor: 'Paints this item with a minimap color.',
  translucent: 'Allows looking through this item and maps to look-through behavior.',
  dontHide: 'Prevents hiding this item behind some visual layers.',
  animateAlways: 'Keeps the animation running even when it might normally pause.',
  noMoveAnimation: 'Disables movement animation behavior for this item.',
  cloth: 'Marks this as an outfit/equipment cloth sprite category.',
  hasMarket: 'Carries legacy market metadata from the object file.',
  chargeable: 'Marks the item as having client-visible charges.',
  lyingCorpse: 'Corpse rendering flag for bodies lying on the ground.',
  look: 'Legacy look-through/look flag from object data.',
};

const NUMERIC_HELP: Partial<Record<keyof ThingFlags, string>> = {
  groundSpeed: 'Movement speed/friction for ground tiles. Non-default values are exported to server friction.',
  writableMaxLen: 'Maximum characters for writable items.',
  writableOnceMaxLen: 'Maximum characters for write-once items.',
  lightLevel: 'Strength/radius of the emitted client light.',
  lightColor: 'Palette color of the emitted client light.',
  displacementX: 'Horizontal sprite draw offset.',
  displacementY: 'Vertical sprite draw offset.',
  elevation: 'Visual height value for raised items.',
  minimapColor: 'Palette color shown on the minimap.',
  clothSlot: 'Legacy cloth/equipment slot id.',
};

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
        { key: 'lightLevel', label: 'Level', min: 0, max: 255 },
        { key: 'lightColor', label: 'Color', min: 0, max: 215, colorType: 'light' },
      ]},
      { key: 'hasDisplacement', label: 'Displacement', numericProps: [
        { key: 'displacementX', label: 'X', min: -512, max: 512 },
        { key: 'displacementY', label: 'Y', min: -512, max: 512 },
      ]},
      { key: 'hasElevation', label: 'Elevation', numericProps: [
        { key: 'elevation', label: 'Height', min: 0, max: 65535 },
      ]},
      { key: 'hasMinimapColor', label: 'Minimap Color', numericProps: [
        { key: 'minimapColor', label: 'Color', min: 0, max: 215, colorType: 'minimap' },
      ]},
      { key: 'translucent', label: 'Translucent' },
      { key: 'dontHide', label: "Don't Hide" },
      { key: 'animateAlways', label: 'Animate Always' },
      { key: 'noMoveAnimation', label: 'No Move Animation' },
      { key: 'renderBelowCreatures', label: 'Below Creatures', categories: ['effect'] },
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

export function PropertyInspector() {
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

  const copiedThing = useOBStore((s) => s.copiedThing);
  const hasCopiedFlags = !!copiedThing?.flags;

  const handleCopyProps = useCallback(() => {
    if (!thing) return;
    useOBStore.setState({
      copiedThing: { flags: { ...thing.flags }, label: 'Flags Only' },
    });
  }, [thing]);

  const handlePasteProps = useCallback(() => {
    if (!thing) return;
    const { copiedThing: ct } = useOBStore.getState();
    if (!ct?.flags) return;
    updateThingFlags(thing.id, { ...ct.flags });
  }, [thing, updateThingFlags]);

  if (!thing) {
    return (
      <div className="p-4 text-emperia-muted text-sm">
        No object selected
      </div>
    );
  }

  return (
    <div className="p-3 text-xs space-y-3">
      <div className="flex items-center gap-1 mb-1">
        <button
          onClick={handleCopyProps}
          className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium hover:bg-emperia-hover text-emperia-muted hover:text-emperia-text transition-colors border border-emperia-border/50"
          title="Copy properties"
        >
          <Copy className="w-3 h-3" />
          Copy
        </button>
        <button
          onClick={handlePasteProps}
          disabled={!hasCopiedFlags}
          className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors border border-emperia-border/50 ${
            hasCopiedFlags
              ? 'hover:bg-emperia-hover text-emperia-muted hover:text-emperia-text'
              : 'text-emperia-muted/30 cursor-not-allowed'
          }`}
          title={hasCopiedFlags ? `Paste: ${copiedThing?.label ?? 'Properties'}` : 'Nothing copied'}
        >
          <ClipboardPaste className="w-3 h-3" />
          Paste
        </button>
        {hasCopiedFlags && (
          <span className="text-[9px] text-emperia-accent ml-1">{copiedThing?.label}</span>
        )}
      </div>
      <div>
        <h3 className="text-[10px] font-semibold text-emperia-muted uppercase tracking-wider mb-1">Visual Properties</h3>
      <div className="grid grid-cols-4 gap-1">
        {FLAG_GROUPS.map((group) => {
          const visibleFlags = group.flags.filter((flag) =>
            !flag.categories || flag.categories.includes(thing.category)
          );
          if (visibleFlags.length === 0) return null;
          const activeCount = visibleFlags.filter(f => !!thing.flags[f.key]).length;
          const span = group.wide ? 'col-span-2' : '';
          return (
            <div key={group.title} className={span}>
              <FlagGroupSection
                title={group.title}
                activeCount={activeCount}
                flags={visibleFlags}
                thingFlags={thing.flags}
                onToggle={toggleFlag}
                onNumericChange={setNumericProp}
              />
            </div>
          );
        })}
      </div>
      </div>
      <div>
        <h3 className="text-[10px] font-semibold text-emperia-muted uppercase tracking-wider mb-1">Item Definition</h3>
        <ServerPropertiesEditor />
      </div>
    </div>
  );
}

function HelpButton({ text }: { text: string }) {
  return (
    <button
      type="button"
      title={text}
      aria-label={text}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      className="w-4 h-4 rounded-full border border-emperia-border text-[10px] leading-none text-emperia-muted hover:text-emperia-accent hover:border-emperia-accent/70 transition-colors shrink-0"
    >
      ?
    </button>
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
            const help = FLAG_HELP[key] ?? `${label} client object flag.`;
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
                  <HelpButton text={help} />
                </label>
                {checked && numericProps && numericProps.length > 0 && (
                  <div className="ml-7 mb-1 flex flex-wrap gap-x-3 gap-y-0.5">
                    {numericProps.map((np) => (
                      <div key={np.key} className="flex items-center gap-1.5">
                        {np.colorType ? (
                          <>
                            <ColorPalettePopover
                              type={np.colorType}
                              value={(thingFlags[np.key] as number) ?? 0}
                              onChange={(v) => onNumericChange(np.key, v)}
                            />
                            <HelpButton text={np.help ?? NUMERIC_HELP[np.key] ?? `${np.label} value.`} />
                          </>
                        ) : (
                          <>
                            <span className="text-emperia-muted text-[10px] flex items-center gap-1">
                              {np.label}
                              <HelpButton text={np.help ?? NUMERIC_HELP[np.key] ?? `${np.label} value.`} />
                            </span>
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
                          </>
                        )}
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
