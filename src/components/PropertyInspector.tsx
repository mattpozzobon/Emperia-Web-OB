import { useCallback, useState } from 'react';
import { ChevronDown, ChevronRight, Copy, ClipboardPaste } from 'lucide-react';
import { useOBStore } from '../store';
import type { ItemProperties, ItemSeatDefinition, SeatDirection, ThingCategory, ThingFlags } from '../lib/types';
import { ColorPalettePopover } from './ColorPalettePopover';
import { ServerPropertiesEditor } from './ServerPropertiesEditor';
import { HelpTooltip } from './HelpTooltip';
import type { HelpContent } from './HelpTooltip';

// Numeric sub-properties shown inline when their parent flag is active
interface NumericProp {
  key: keyof ThingFlags;
  label: string;
  min?: number;
  max?: number;
  colorType?: 'light' | 'minimap';
  help?: HelpDetails;
}

// A single flag entry, optionally with inline numeric sub-properties
interface FlagEntry {
  key: keyof ThingFlags;
  label: string;
  numericProps?: NumericProp[];
  help?: HelpDetails;
  categories?: ThingCategory[];
}

type HelpDetails = Omit<HelpContent, 'title'>;

const FLAG_HELP: Partial<Record<keyof ThingFlags, HelpDetails>> = {
  ground: {
    scope: 'Derived',
    description: 'Marks the appearance as the floor of a tile. Compile derives server group Ground and the friction value from it.',
    example: 'A stone floor uses Ground. A player walking over it uses its Speed/Friction to calculate step duration.',
  },
  groundBorder: {
    scope: 'Client + Server',
    description: 'Places a border in the ground layer and derives top order 1 plus the Ground group.',
    example: 'A grass edge is drawn over the base dirt floor but remains below walls, items, and creatures.',
  },
  onBottom: {
    scope: 'Client + Server',
    description: 'Places the object in the lower item layer and derives top order 2.',
    example: 'A carpet is drawn above the floor and borders, but below a chest or a creature standing on the tile.',
  },
  onTop: {
    scope: 'Client + Server',
    description: 'Places the object in the upper item layer and derives top order 3.',
    example: 'A wall decoration or foreground detail is rendered after normal tile items.',
  },
  renderBelowCreatures: {
    scope: 'Client',
    description: 'Changes the render pass of a positional effect so creatures are drawn after the effect.',
    example: 'Holy Floor Resurrection appears under the player while the player outfit remains visible above it.',
  },
  notWalkable: {
    scope: 'Client + Server',
    description: 'Marks the item as solid for movement. The server rejects movement into a blocked tile.',
    example: 'A closed stone wall prevents both players and monsters from stepping onto its tile.',
  },
  notMoveable: {
    scope: 'Client + Server',
    description: 'Prevents the item from being dragged or pushed as a normal movable object.',
    example: 'A fixed statue stays on the map when a player tries to drag it into a backpack.',
  },
  blockProjectile: {
    scope: 'Client + Server',
    description: 'Blocks projectile and line-of-sight paths through the tile.',
    example: 'A closed window can stop an arrow or a targeted spell from crossing to the tile behind it.',
  },
  notPathable: {
    scope: 'Server',
    description: 'Excludes the tile from automatic pathfinding, even when direct movement rules may differ.',
    example: 'Monster pathfinding routes around a hazardous or unsuitable tile instead of selecting it as a path node.',
  },
  fluidContainer: {
    scope: 'Client + Server',
    description: 'Classifies an item that can hold a fluid. Compile derives the Fluid Container structural group.',
    example: 'A vial can display water, mana, or blood according to its fluid subtype and be handled as a fluid container.',
  },
  splash: {
    scope: 'Client + Server',
    description: 'Classifies a liquid puddle or splash placed on the ground. Compile derives the Splash group.',
    example: 'Blood spilled after combat is rendered as a ground splash and handled as a splash item by the server.',
  },
  pickupable: {
    scope: 'Client + Server',
    description: 'Allows an item to be collected and stored in inventories or containers.',
    example: 'A sword with Pickupable enabled can be dragged from the floor into a backpack, subject to capacity rules.',
  },
  stackable: {
    scope: 'Client + Server',
    description: 'Stores multiple identical units in one item stack using a count.',
    example: 'One inventory slot can contain 100 gold coins instead of creating 100 separate item instances.',
  },
  container: {
    scope: 'Client + Server',
    description: 'Classifies the appearance as a container and derives the server Container group. Slot capacity still comes from Item Definition.',
    example: 'A backpack opens a container panel; Container Size decides how many normal slots it contains.',
  },
  forceUse: {
    scope: 'Client',
    description: 'Makes the client prefer a use action for this object in interactions where a blocking item must be selected.',
    example: 'Clicking an interactive object embedded in a tile selects that object for Use instead of treating it like ordinary scenery.',
    note: 'The server still validates and executes the received use action; this flag controls client-side selection.',
  },
  multiUse: {
    scope: 'Client',
    description: 'Enables the client Use With flow, where the item is selected first and a target is chosen second.',
    example: 'Using a rope, shovel, or rune changes the cursor so the player can click the tile or creature to target.',
  },
  rotateable: {
    scope: 'Map Editor',
    description: 'Marks the appearance as rotatable for client/editor behavior. The server transformation target comes from Rotate To.',
    example: 'Rotating a chair changes it to the item ID configured in Rotate To.',
    note: 'Set Rotate To in Item Definition; this visual flag alone does not define the destination item.',
  },
  hangable: {
    scope: 'Client + Server',
    description: 'Allows the item to be placed on compatible wall hook tiles.',
    example: 'A tapestry can be moved onto a wall and rendered using the orientation supported by that wall.',
  },
  hookSouth: {
    scope: 'Client + Server',
    description: 'Marks a wall/support as accepting the south-facing hangable orientation.',
    example: 'A tapestry placed on a south-facing wall selects its south wall sprite pattern.',
  },
  hookEast: {
    scope: 'Client + Server',
    description: 'Marks a wall/support as accepting the east-facing hangable orientation.',
    example: 'A painting placed on an east-facing wall selects its east wall sprite pattern.',
  },
  hasLight: {
    scope: 'Client',
    description: 'Adds a light source to the rendered item or effect.',
    example: 'A lit torch with Level 7 illuminates nearby tiles using the selected palette Color.',
  },
  hasDisplacement: {
    scope: 'Client',
    description: 'Offsets sprite drawing from the default tile anchor without changing the server position.',
    example: 'A 64×64 aura can use X 32 and Y 32 so its visual center aligns with the creature tile.',
  },
  hasElevation: {
    scope: 'Client + Server',
    description: 'Adds visual elevation and derives the server height flag used by tile movement and standing checks.',
    example: 'A raised crate shifts sprites drawn above it and can affect whether a creature may occupy the tile.',
  },
  hasMinimapColor: {
    scope: 'Client',
    description: 'Paints the object on the minimap using a palette index.',
    example: 'Grass can use a green minimap color while water uses a blue palette entry.',
  },
  translucent: {
    scope: 'Client',
    description: 'Treats the tile as see-through for rendering and light occlusion.',
    example: 'A glass floor lets lower-floor content and light remain partially visible instead of using a fully solid mask.',
  },
  animateAlways: {
    scope: 'Client',
    description: 'Keeps an animated appearance advancing even when normal animation policy could pause it.',
    example: 'A continuously burning flame keeps cycling its frames whenever it is visible.',
  },
};

const NUMERIC_HELP: Partial<Record<keyof ThingFlags, HelpDetails>> = {
  groundSpeed: {
    scope: 'Derived',
    description: 'Friction used by the server step-duration formula. Higher values produce a longer step on the tile.',
    example: 'At the same creature speed, friction 150 is slower to cross than friction 100.',
  },
  lightLevel: {
    scope: 'Client',
    description: 'Radius/strength of the rendered light source.',
    example: 'Level 3 creates a small glow; level 7 illuminates a wider area around a torch.',
  },
  lightColor: {
    scope: 'Client',
    description: 'Palette index used to tint the emitted light.',
    example: 'Choose a warm orange/red entry for fire or a pale blue entry for magical ice light.',
  },
  displacementX: {
    scope: 'Client',
    description: 'Horizontal draw offset from the tile anchor.',
    example: 'Increase X when a wide effect needs to move horizontally to align its center with the player.',
  },
  displacementY: {
    scope: 'Client',
    description: 'Vertical draw offset from the tile anchor.',
    example: 'Increase Y when a tall effect needs its visual base aligned with the creature feet.',
  },
  elevation: {
    scope: 'Client + Server',
    description: 'Height amount used to raise subsequent sprite drawing; the presence of elevation also sets the server height flag.',
    example: 'Height 8 raises items or creatures rendered on top of a small box by eight pixels.',
  },
  minimapColor: {
    scope: 'Client',
    description: 'Palette index painted for this object on the minimap.',
    example: 'Select the same green index used by nearby grass so the terrain reads consistently.',
  },
};

const FLAG_GROUPS: {
  title: string;
  flags: FlagEntry[];
  fullWidth?: boolean;
  contentColumns?: 1 | 2 | 3;
}[] = [
  {
    title: 'Ground & Layering',
    flags: [
      { key: 'ground', label: 'Ground', numericProps: [
        { key: 'groundSpeed', label: 'Speed', min: 0, max: 65535 },
      ]},
      { key: 'groundBorder', label: 'Ground Border' },
      { key: 'onBottom', label: 'On Bottom' },
      { key: 'onTop', label: 'On Top' },
    ],
  },
  {
    title: 'Collision & Movement',
    flags: [
      { key: 'notWalkable', label: 'Not Walkable' },
      { key: 'notMoveable', label: 'Not Moveable' },
      { key: 'blockProjectile', label: 'Block Projectile' },
      { key: 'notPathable', label: 'Not Pathable' },
    ],
  },
  {
    title: 'Inventory & Use',
    flags: [
      { key: 'pickupable', label: 'Pickupable' },
      { key: 'stackable', label: 'Stackable' },
      { key: 'container', label: 'Container' },
      { key: 'forceUse', label: 'Force Use' },
      { key: 'multiUse', label: 'Multi Use' },
      { key: 'rotateable', label: 'Rotatable' },
    ],
  },
  {
    title: 'Wall Placement',
    flags: [
      { key: 'hangable', label: 'Hangable' },
      { key: 'hookSouth', label: 'Hook South' },
      { key: 'hookEast', label: 'Hook East' },
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
    title: 'Visual Rendering',
    fullWidth: true,
    contentColumns: 3,
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
      { key: 'animateAlways', label: 'Animate Always' },
      { key: 'renderBelowCreatures', label: 'Below Creatures', categories: ['effect'] },
    ],
  },
];

type TextAccessMode = 'none' | 'read-only' | 'writable' | 'write-once';

export function PropertyInspector() {
  const selectedId = useOBStore((s) => s.selectedThingId);
  const objectData = useOBStore((s) => s.objectData);
  const updateThingFlags = useOBStore((s) => s.updateThingFlags);
  const itemDefinitions = useOBStore((s) => s.itemDefinitions);
  const appearanceToItemIds = useOBStore((s) => s.appearanceToItemIds);
  const updateItemDefinition = useOBStore((s) => s.updateItemDefinition);
  const updateItemSeatDefinition = useOBStore((s) => s.updateItemSeatDefinition);
  // Subscribe to editVersion so edits cause re-render
  useOBStore((s) => s.editVersion);

  const thing = selectedId != null ? objectData?.things.get(selectedId) ?? null : null;
  const itemId = selectedId != null
    ? appearanceToItemIds.get(selectedId)
      ?? Array.from(objectData?.itemAppearances.entries() ?? [])
        .find(([, appearanceId]) => appearanceId === selectedId)?.[0]
    : undefined;
  const itemProperties = itemId != null
    ? itemDefinitions.get(itemId)?.properties ?? null
    : null;
  const seatDefinition = itemId != null
    ? objectData?.itemSeatDefinitions.get(itemId) ?? null
    : null;

  const updateTextConfiguration = useCallback((
    mode: TextAccessMode,
    patch?: Partial<Pick<ItemProperties, 'maxTextLen' | 'writeOnceItemId'>>,
  ) => {
    if (!thing || thing.category !== 'item') return;

    const state = useOBStore.getState();
    const currentItemId = state.appearanceToItemIds.get(thing.id);
    const currentDefinition = currentItemId != null
      ? state.itemDefinitions.get(currentItemId)
      : undefined;
    const properties: ItemProperties = currentDefinition?.properties
      ? { ...currentDefinition.properties }
      : {};

    delete properties.readable;
    delete properties.writeable;
    if (properties.type === 'readable') delete properties.type;
    if (mode !== 'write-once') delete properties.writeOnceItemId;

    if (mode === 'read-only') {
      properties.readable = true;
    } else if (mode === 'writable' || mode === 'write-once') {
      properties.writeable = true;
    } else {
      delete properties.maxTextLen;
    }

    if (patch) {
      for (const [key, value] of Object.entries(patch)) {
        if (value == null || value === 0) delete properties[key as keyof ItemProperties];
        else (properties as Record<string, unknown>)[key] = value;
      }
    }

    const flags = {
      ...thing.flags,
      writable: mode === 'writable',
      writableOnce: mode === 'write-once',
    };
    updateThingFlags(thing.id, flags);
    updateItemDefinition(thing.id, {
      properties: Object.keys(properties).length > 0 ? properties : null,
    });
  }, [thing, updateItemDefinition, updateThingFlags]);

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
    }
    // When toggling on a parent flag, set defaults
    if (newFlags[key]) {
      if (key === 'ground' && newFlags.groundSpeed == null) newFlags.groundSpeed = 100;
      if (key === 'hasLight') { if (newFlags.lightLevel == null) newFlags.lightLevel = 7; if (newFlags.lightColor == null) newFlags.lightColor = 215; }
      if (key === 'hasDisplacement') { if (newFlags.displacementX == null) newFlags.displacementX = 8; if (newFlags.displacementY == null) newFlags.displacementY = 8; }
      if (key === 'hasElevation' && newFlags.elevation == null) newFlags.elevation = 8;
      if (key === 'hasMinimapColor' && newFlags.minimapColor == null) newFlags.minimapColor = 0;
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
  const textMode: TextAccessMode = thing?.flags.writableOnce
    ? 'write-once'
    : thing?.flags.writable || itemProperties?.writeable === true
      ? 'writable'
      : itemProperties?.readable === true || itemProperties?.type === 'readable'
        ? 'read-only'
        : 'none';

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
    <div className="space-y-5 p-4 text-xs">
      <div className={`grid items-start gap-3 ${
        thing.category === 'item'
          ? 'grid-cols-1 lg:grid-cols-[minmax(300px,1fr)_minmax(0,2.6fr)]'
          : 'grid-cols-1'
      }`}>
        {thing.category === 'item' && (
          <section className="rounded-md border border-cyan-500/30 bg-cyan-950/15 p-2 shadow-[inset_0_1px_0_rgba(34,211,238,0.05)]">
            <div className="mb-2 px-0.5">
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-300/85">
                Item Identity
              </h3>
              <p className="mt-0.5 text-[9px] text-cyan-200/45">
                Semantic classification shared by runtime systems
              </p>
            </div>
            <ServerPropertiesEditor mode="identity" />
          </section>
        )}
        <section>
        <div className="mb-2.5 flex min-h-7 items-center justify-between gap-3">
          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emperia-muted">
              Visual Properties
            </h3>
            <p className="mt-0.5 text-[9px] text-emperia-muted/60">
              Appearance, tile behavior, and derived runtime flags
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {hasCopiedFlags && (
              <span className="mr-1 text-[9px] text-emperia-accent">{copiedThing?.label}</span>
            )}
            <button
              onClick={handleCopyProps}
              className="flex items-center gap-1 rounded border border-emperia-border/70 px-2 py-1 text-[10px]
                         font-medium text-emperia-muted transition-colors hover:bg-emperia-hover hover:text-emperia-text"
              title="Copy visual properties"
            >
              <Copy className="h-3 w-3" />
              Copy
            </button>
            <button
              onClick={handlePasteProps}
              disabled={!hasCopiedFlags}
              className={`flex items-center gap-1 rounded border border-emperia-border/70 px-2 py-1 text-[10px] font-medium transition-colors ${
                hasCopiedFlags
                  ? 'text-emperia-muted hover:bg-emperia-hover hover:text-emperia-text'
                  : 'cursor-not-allowed text-emperia-muted/30'
              }`}
              title={hasCopiedFlags ? `Paste: ${copiedThing?.label ?? 'Properties'}` : 'Nothing copied'}
            >
              <ClipboardPaste className="h-3 w-3" />
              Paste
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 items-start gap-2 md:grid-cols-3">
        {FLAG_GROUPS.filter((group) => !group.fullWidth).map((group) => {
          const visibleFlags = group.flags.filter((flag) =>
            !flag.categories || flag.categories.includes(thing.category)
          );
          if (visibleFlags.length === 0) return null;
          const activeCount = visibleFlags.filter(f => !!thing.flags[f.key]).length;
          return (
            <div key={group.title} className="h-full">
              <FlagGroupSection
                title={group.title}
                activeCount={activeCount}
                flags={visibleFlags}
                thingFlags={thing.flags}
                onToggle={toggleFlag}
                onNumericChange={setNumericProp}
                contentColumns={group.contentColumns}
              />
            </div>
          );
        })}
        {thing.category === 'item' && (
          <div className="h-full">
            <TextWritingSection
              mode={textMode}
              maxTextLen={itemProperties?.maxTextLen}
              writeOnceItemId={itemProperties?.writeOnceItemId}
              onChange={updateTextConfiguration}
            />
          </div>
        )}
        {thing.category === 'item' && (
          <div className="h-full">
            <SeatingSection
              definition={seatDefinition}
              onChange={(definition) => updateItemSeatDefinition(thing.id, definition)}
            />
          </div>
        )}
        {FLAG_GROUPS.filter((group) => group.fullWidth).map((group) => {
          const visibleFlags = group.flags.filter((flag) =>
            !flag.categories || flag.categories.includes(thing.category)
          );
          if (visibleFlags.length === 0) return null;
          const activeCount = visibleFlags.filter((flag) => !!thing.flags[flag.key]).length;
          return (
            <div key={group.title} className="h-full md:col-span-3">
              <FlagGroupSection
                title={group.title}
                activeCount={activeCount}
                flags={visibleFlags}
                thingFlags={thing.flags}
                onToggle={toggleFlag}
                onNumericChange={setNumericProp}
                contentColumns={group.contentColumns}
              />
            </div>
          );
        })}
        </div>
        </section>
      </div>
      <section className="border-t border-emperia-border/70 pt-4">
        <div className="mb-2.5">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emperia-muted">
            Item Definition
          </h3>
          <p className="mt-0.5 text-[9px] text-emperia-muted/60">
            Server gameplay metadata stored in items.json
          </p>
        </div>
        <ServerPropertiesEditor mode="details" />
      </section>
    </div>
  );
}

const SEAT_DIRECTIONS: {
  key: SeatDirection;
  label: string;
  name: string;
  bit: number;
}[] = [
  { key: 'north', label: '↑', name: 'North', bit: 1 },
  { key: 'east', label: '→', name: 'East', bit: 2 },
  { key: 'south', label: '↓', name: 'South', bit: 4 },
  { key: 'west', label: '←', name: 'West', bit: 8 },
];

function createSeatDefinition(): ItemSeatDefinition {
  return {
    poseSetId: 0,
    directionMask: 0,
    offsets: {
      north: { x: 0, y: 0 },
      east: { x: 0, y: 0 },
      south: { x: 0, y: 0 },
      west: { x: 0, y: 0 },
    },
  };
}

function SeatingSection({
  definition,
  onChange,
}: {
  definition: ItemSeatDefinition | null;
  onChange: (definition: ItemSeatDefinition | null) => void;
}) {
  const [open, setOpen] = useState(true);
  const poseSets = useOBStore((state) => state.objectData?.poseSets);
  const availablePoseSets = Array.from(poseSets?.values() ?? [])
    .filter((poseSet) => poseSet.action === 'sit')
    .sort((a, b) => a.name.localeCompare(b.name));
  const update = (patch: Partial<ItemSeatDefinition>) => {
    if (!definition) return;
    onChange({ ...definition, ...patch });
  };

  return (
    <div className="h-full overflow-hidden rounded-md border border-emperia-border/60 bg-emperia-bg/20">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 border-b border-transparent bg-emperia-surface/60 px-2.5 py-2
                   text-left transition-colors hover:bg-emperia-surface"
      >
        {open
          ? <ChevronDown className="h-3 w-3 shrink-0 text-emperia-muted" />
          : <ChevronRight className="h-3 w-3 shrink-0 text-emperia-muted" />}
        <span className="flex-1 text-[10px] font-semibold uppercase tracking-wider text-emperia-text">
          Seating
        </span>
        <input
          type="checkbox"
          checked={definition !== null}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => {
            if (event.target.checked) {
              setOpen(true);
              onChange(createSeatDefinition());
            } else {
              onChange(null);
            }
          }}
          title="Allow the local client to render creatures seated on this item"
        />
      </button>
      {open && definition && (
        <div className="space-y-2 px-2.5 py-2">
          <label className="block">
            <span className="mb-1 block text-[10px] text-emperia-muted">Pose Set</span>
            <select
              value={definition.poseSetId}
              onChange={(event) => update({ poseSetId: Number(event.target.value) })}
              className="w-full rounded border border-emperia-border bg-emperia-bg px-2 py-1 text-[9px] text-emperia-text"
            >
              <option value={0}>Not assigned</option>
              {availablePoseSets.map((poseSet) => (
                <option key={poseSet.id} value={poseSet.id}>
                  {poseSet.name} (#{poseSet.id})
                </option>
              ))}
            </select>
          </label>
          <div>
            <div className="mb-1 text-[10px] text-emperia-muted">Allowed facing directions</div>
            <div className="grid grid-cols-4 gap-1">
              {SEAT_DIRECTIONS.map(({ key, label, name, bit }) => {
                const enabled = (definition.directionMask & bit) !== 0;
                return (
                  <button
                    key={key}
                    type="button"
                    title={name}
                    aria-label={`${name} facing ${enabled ? 'enabled' : 'disabled'}`}
                    onClick={() => update({
                      directionMask: enabled
                        ? definition.directionMask & ~bit
                        : definition.directionMask | bit,
                    })}
                    className={`rounded border px-1 py-1 text-sm leading-none ${
                      enabled
                        ? 'border-emperia-accent/70 bg-emperia-accent/15 text-emperia-accent'
                        : 'border-emperia-border text-emperia-muted'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          <p className="text-[9px] leading-relaxed text-emperia-muted/60">
            Client-only EOBJ metadata. The server receives no seated state.
          </p>
        </div>
      )}
    </div>
  );
}

function TextWritingSection({
  mode,
  maxTextLen,
  writeOnceItemId,
  onChange,
}: {
  mode: TextAccessMode;
  maxTextLen?: number;
  writeOnceItemId?: number;
  onChange: (
    mode: TextAccessMode,
    patch?: Partial<Pick<ItemProperties, 'maxTextLen' | 'writeOnceItemId'>>,
  ) => void;
}) {
  const [open, setOpen] = useState(true);
  const modes: { value: TextAccessMode; label: string }[] = [
    { value: 'none', label: 'None' },
    { value: 'read-only', label: 'Read only' },
    { value: 'writable', label: 'Writable' },
    { value: 'write-once', label: 'Writable once' },
  ];

  return (
    <div className="h-full overflow-hidden rounded-md border border-emperia-border/60 bg-emperia-bg/20">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 border-b border-transparent bg-emperia-surface/60 px-2.5 py-2
                   text-left transition-colors hover:bg-emperia-surface"
      >
        {open
          ? <ChevronDown className="h-3 w-3 shrink-0 text-emperia-muted" />
          : <ChevronRight className="h-3 w-3 shrink-0 text-emperia-muted" />
        }
        <span className="flex-1 text-[10px] font-semibold uppercase tracking-wider text-emperia-text">
          Text & Writing
        </span>
        {mode !== 'none' && (
          <span className="rounded-full bg-emperia-accent/15 px-1.5 py-0.5 text-[9px] font-medium text-emperia-accent">
            {modes.find((entry) => entry.value === mode)?.label}
          </span>
        )}
      </button>
      {open && (
        <div className="space-y-2 px-2.5 py-2">
          <div className="flex items-center gap-1.5 text-[10px] text-emperia-muted">
            Access mode
            <HelpTooltip content={{
              title: 'Text access mode',
              scope: 'Client + Server',
              description: 'One canonical mode updates the EOBJ visual flag and the server item definition together.',
              example: 'Choose Writable for a reusable letter, or Writable once when writing must transform it into a sealed item.',
            }} />
          </div>
          <div className="grid grid-cols-2 gap-1">
            {modes.map((entry) => (
              <button
                key={entry.value}
                type="button"
                onClick={() => onChange(entry.value)}
                className={`rounded border px-2 py-1 text-[9px] transition-colors ${
                  mode === entry.value
                    ? 'border-emperia-accent/70 bg-emperia-accent/15 text-emperia-accent'
                    : 'border-emperia-border bg-emperia-bg/40 text-emperia-muted hover:bg-emperia-hover hover:text-emperia-text'
                }`}
              >
                {entry.label}
              </button>
            ))}
          </div>
          {mode !== 'none' && (
            <div className="space-y-1.5 border-t border-emperia-border/50 pt-2">
              <label className="flex items-center gap-2">
                <span className="flex w-24 shrink-0 items-center gap-1 text-[10px] text-emperia-muted">
                  Max text length
                  <HelpTooltip content={{
                    title: 'Maximum text length',
                    scope: 'Server',
                    description: 'Maximum number of characters accepted by the server when the player saves text.',
                    example: 'Set 500 to reject a letter body longer than 500 characters. Empty uses the server default of 2000.',
                  }} />
                </span>
                <input
                  type="number"
                  min={1}
                  value={maxTextLen ?? ''}
                  placeholder="Default: 2000"
                  onChange={(event) => {
                    const value = Number.parseInt(event.target.value, 10);
                    onChange(mode, { maxTextLen: Number.isFinite(value) ? value : undefined });
                  }}
                  className="min-w-0 flex-1 rounded border border-emperia-border bg-emperia-bg px-2 py-1
                             text-[10px] text-emperia-text outline-none focus:border-emperia-accent"
                />
              </label>
              {mode === 'write-once' && (
                <label className="flex items-center gap-2">
                  <span className="flex w-24 shrink-0 items-center gap-1 text-[10px] text-emperia-muted">
                    Result item ID
                    <HelpTooltip content={{
                      title: 'Write-once result item',
                      scope: 'Server',
                      description: 'Public item ID that replaces this item after the first successful text save.',
                      example: 'A blank paper can transform into the sealed letter item while preserving the written content.',
                    }} />
                  </span>
                  <input
                    type="number"
                    min={1}
                    value={writeOnceItemId ?? ''}
                    placeholder="Required item ID"
                    onChange={(event) => {
                      const value = Number.parseInt(event.target.value, 10);
                      onChange(mode, { writeOnceItemId: Number.isFinite(value) ? value : undefined });
                    }}
                    className="min-w-0 flex-1 rounded border border-emperia-border bg-emperia-bg px-2 py-1
                               text-[10px] text-emperia-text outline-none focus:border-emperia-accent"
                  />
                </label>
              )}
            </div>
          )}
        </div>
      )}
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
  contentColumns = 1,
}: {
  title: string;
  activeCount: number;
  flags: FlagEntry[];
  thingFlags: ThingFlags;
  onToggle: (key: keyof ThingFlags) => void;
  onNumericChange: (key: keyof ThingFlags, value: number) => void;
  contentColumns?: 1 | 2 | 3;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="h-full overflow-hidden rounded-md border border-emperia-border/60 bg-emperia-bg/20">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 border-b border-transparent bg-emperia-surface/60 px-2.5 py-2
                   text-left transition-colors hover:bg-emperia-surface"
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
        <div className={`grid gap-x-4 px-2 py-1.5 ${
          contentColumns === 3
            ? 'grid-cols-1 lg:grid-cols-3'
            : contentColumns === 2
              ? 'grid-cols-1 lg:grid-cols-2'
              : 'grid-cols-1'
        }`}>
          {flags.map(({ key, label, numericProps }) => {
            const checked = !!thingFlags[key];
            const details = FLAG_HELP[key] ?? {
              scope: 'Client' as const,
              description: `${label} controls appearance behavior in the client object definition.`,
              example: `Enable ${label} and compile the object package to apply it to this appearance.`,
            };
            return (
              <div key={key} className="min-w-0">
                <label className="flex min-h-6 cursor-pointer select-none items-center gap-2 rounded px-1 py-1 hover:bg-emperia-hover">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(key)}
                    className="w-3 h-3 rounded border-emperia-border bg-emperia-surface accent-emperia-accent cursor-pointer"
                  />
                  <span className={checked ? 'text-emperia-text' : 'text-emperia-muted'}>
                    {label}
                  </span>
                  <HelpTooltip content={{ title: label, ...details }} />
                </label>
                {checked && numericProps && numericProps.length > 0 && (
                  <div className="mb-1.5 ml-7 flex flex-wrap gap-x-3 gap-y-1">
                    {numericProps.map((np) => (
                      <div key={np.key} className="flex items-center gap-1.5">
                        {(() => {
                          const numericDetails = np.help ?? NUMERIC_HELP[np.key] ?? {
                            scope: 'Client' as const,
                            description: `${np.label} configures the numeric value attached to this visual property.`,
                            example: `Change ${np.label} and compile to preview the result on this appearance.`,
                          };
                          return np.colorType ? (
                            <>
                              <ColorPalettePopover
                                type={np.colorType}
                                value={(thingFlags[np.key] as number) ?? 0}
                                onChange={(v) => onNumericChange(np.key, v)}
                              />
                              <HelpTooltip content={{ title: `${label}: ${np.label}`, ...numericDetails }} />
                            </>
                          ) : (
                            <>
                              <span className="flex items-center gap-1 text-[10px] text-emperia-muted">
                                {np.label}
                                <HelpTooltip content={{ title: `${label}: ${np.label}`, ...numericDetails }} />
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
                                className="w-16 rounded border border-emperia-border bg-emperia-surface px-1 py-0.5
                                           text-right font-mono text-[10px] text-emperia-text outline-none
                                           transition-colors focus:border-emperia-accent"
                              />
                            </>
                          );
                        })()}
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
