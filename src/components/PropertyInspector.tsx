import type { ReactNode } from 'react';
import { useOBStore } from '../store';
import type { ThingFlags, ThingType, FrameGroup } from '../lib/types';

export function PropertyInspector() {
  const selectedId = useOBStore((s) => s.selectedThingId);
  const objectData = useOBStore((s) => s.objectData);

  const thing = selectedId != null ? objectData?.things.get(selectedId) ?? null : null;

  if (!thing) {
    return (
      <div className="p-4 text-emperia-muted text-sm">
        No object selected
      </div>
    );
  }

  return (
    <div className="p-3 text-xs space-y-4">
      {/* Identity */}
      <Section title="Identity">
        <Row label="ID" value={thing.id} />
        <Row label="Category" value={thing.category} />
      </Section>

      {/* Flags */}
      <Section title="Flags">
        <FlagsList flags={thing.flags} />
      </Section>

      {/* Properties with values */}
      <Section title="Properties">
        <PropertiesList flags={thing.flags} />
      </Section>

      {/* Frame Groups */}
      {thing.frameGroups.map((fg, i) => (
        <Section key={i} title={`Frame Group ${i}${thing.category === 'outfit' ? (i === 0 ? ' (Idle)' : ' (Moving)') : ''}`}>
          <Row label="Size" value={`${fg.width}x${fg.height}`} />
          <Row label="Layers" value={fg.layers} />
          <Row label="Pattern" value={`${fg.patternX}x${fg.patternY}x${fg.patternZ}`} />
          <Row label="Frames" value={fg.animationLength} />
          <Row label="Sprites" value={fg.sprites.length} />
          {fg.animationLength > 1 && (
            <>
              <Row label="Async" value={fg.asynchronous ? 'Yes' : 'No'} />
              <Row label="Loop" value={fg.nLoop === 0 ? 'Infinite' : fg.nLoop} />
              <Row label="Start" value={fg.start} />
            </>
          )}
        </Section>
      ))}
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

function Row({ label, value }: { label: string; value: string | number | boolean }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="text-emperia-muted">{label}</span>
      <span className="text-emperia-text font-mono">{String(value)}</span>
    </div>
  );
}

function FlagsList({ flags }: { flags: ThingFlags }) {
  const boolFlags: { key: keyof ThingFlags; label: string }[] = [
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

  const activeFlags = boolFlags.filter(f => flags[f.key] === true);

  if (activeFlags.length === 0) {
    return <span className="text-emperia-muted italic">None</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {activeFlags.map(f => (
        <span
          key={f.key}
          className="px-1.5 py-0.5 rounded bg-emperia-surface border border-emperia-border text-emperia-text text-[10px]"
        >
          {f.label}
        </span>
      ))}
    </div>
  );
}

function PropertiesList({ flags }: { flags: ThingFlags }) {
  const props: { label: string; value: string | number }[] = [];

  if (flags.groundSpeed != null) props.push({ label: 'Ground Speed', value: flags.groundSpeed });
  if (flags.lightLevel != null) props.push({ label: 'Light Level', value: flags.lightLevel });
  if (flags.lightColor != null) props.push({ label: 'Light Color', value: `0x${flags.lightColor.toString(16).padStart(4, '0')}` });
  if (flags.displacementX != null) props.push({ label: 'Displacement X', value: flags.displacementX });
  if (flags.displacementY != null) props.push({ label: 'Displacement Y', value: flags.displacementY });
  if (flags.elevation != null) props.push({ label: 'Elevation', value: flags.elevation });
  if (flags.minimapColor != null) props.push({ label: 'Minimap Color', value: `0x${flags.minimapColor.toString(16).padStart(4, '0')}` });
  if (flags.clothSlot != null) props.push({ label: 'Cloth Slot', value: flags.clothSlot });

  if (props.length === 0) {
    return <span className="text-emperia-muted italic">None</span>;
  }

  return (
    <>
      {props.map(p => (
        <Row key={p.label} label={p.label} value={p.value} />
      ))}
    </>
  );
}
