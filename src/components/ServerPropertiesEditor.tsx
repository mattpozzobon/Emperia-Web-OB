import { useCallback, useMemo } from 'react';
import { useOBStore, getDisplayId } from '../store';
import { OTB_FLAG_NAMES } from '../lib/types';
import type { ItemProperties } from '../lib/types';

// ─── Field definitions for the UI ───────────────────────────────────────────

interface FieldDef {
  key: string;
  label: string;
  type: 'string' | 'number' | 'select' | 'boolean';
  options?: string[];
  placeholder?: string;
}

const IDENTITY_FIELDS: FieldDef[] = [
  { key: 'name', label: 'Name', type: 'string' },
  { key: 'article', label: 'Article', type: 'string', placeholder: 'a / an' },
  { key: 'description', label: 'Description', type: 'string' },
  { key: 'type', label: 'Type', type: 'select', options: [
    '', 'bed', 'container', 'corpse', 'depot', 'door', 'fluidContainer',
    'key', 'magicfield', 'mailbox', 'readable', 'rune', 'splash',
    'teleport', 'trashholder', 'window',
  ]},
];

const EQUIPMENT_FIELDS: FieldDef[] = [
  { key: 'weaponType', label: 'Weapon Type', type: 'select', options: [
    '', 'sword', 'axe', 'club', 'distance', 'shield', 'wand', 'orb', 'magical',
  ]},
  { key: 'slotType', label: 'Slot Type', type: 'select', options: [
    '', 'hand', 'two-handed', 'head', 'body', 'legs', 'feet', 'ring', 'necklace', 'backpack', 'ammo',
  ]},
  { key: 'ammoType', label: 'Ammo Type', type: 'string' },
  { key: 'shootType', label: 'Shoot Type', type: 'string' },
  { key: 'damageElement', label: 'Damage Element', type: 'select', options: [
    '', 'fire', 'ice', 'energy', 'earth', 'death', 'holy', 'arcane', 'wind',
  ]},
];

const COMBAT_FIELDS: FieldDef[] = [
  { key: 'physicalAttack', label: 'Physical Attack', type: 'number' },
  { key: 'magicalAttack', label: 'Magical Attack', type: 'number' },
  { key: 'physicalDefense', label: 'Physical Defense', type: 'number' },
  { key: 'magicalDefense', label: 'Magical Defense', type: 'number' },
  { key: 'armor', label: 'Armor', type: 'number' },
  { key: 'extradef', label: 'Extra Def', type: 'number' },
  { key: 'hitChance', label: 'Hit Chance', type: 'number' },
  { key: 'maxHitChance', label: 'Max Hit Chance', type: 'number' },
  { key: 'range', label: 'Range', type: 'number' },
];

const WEIGHT_FIELDS: FieldDef[] = [
  { key: 'weight', label: 'Weight', type: 'number' },
  { key: 'speed', label: 'Speed', type: 'number' },
  { key: 'friction', label: 'Friction', type: 'number' },
  { key: 'floorchange', label: 'Floor Change', type: 'select', options: ['', 'down', 'north', 'south', 'east', 'west'] },
];

const REQUIREMENT_FIELDS: FieldDef[] = [
  { key: 'level', label: 'Level', type: 'number' },
  { key: 'expertise', label: 'Expertise', type: 'number' },
];

const CONTAINER_FIELDS: FieldDef[] = [
  { key: 'containerSize', label: 'Container Size', type: 'number' },
  { key: 'containerSizePotions', label: 'Container Size (Potions)', type: 'number' },
  { key: 'weightReduction', label: 'Weight Reduction', type: 'number' },
];

const DECAY_FIELDS: FieldDef[] = [
  { key: 'charges', label: 'Charges', type: 'number' },
  { key: 'duration', label: 'Duration', type: 'number' },
  { key: 'decayTo', label: 'Decay To (Item ID)', type: 'number' },
  { key: 'destroyTo', label: 'Destroy To (Item ID)', type: 'number' },
  { key: 'rotateTo', label: 'Rotate To (Item ID)', type: 'number' },
  { key: 'transformEquipTo', label: 'Transform Equip To', type: 'number' },
  { key: 'transformDeEquipTo', label: 'Transform DeEquip To', type: 'number' },
];

const SPECIAL_FIELDS: FieldDef[] = [
  { key: 'fluidSource', label: 'Fluid Source', type: 'string' },
  { key: 'field', label: 'Field', type: 'string' },
  { key: 'readable', label: 'Readable', type: 'boolean' },
  { key: 'writeable', label: 'Writeable', type: 'boolean' },
  { key: 'maxTextLen', label: 'Max Text Length', type: 'number' },
];

const REGEN_FIELDS: FieldDef[] = [
  { key: 'healthGain', label: 'Health Gain', type: 'number' },
  { key: 'healthTicks', label: 'Health Ticks', type: 'number' },
  { key: 'manaGain', label: 'Mana Gain', type: 'number' },
  { key: 'manaTicks', label: 'Mana Ticks', type: 'number' },
];

const SKILL_FIELDS: FieldDef[] = [
  { key: 'skillSword', label: 'Skill Sword', type: 'number' },
  { key: 'skillAxe', label: 'Skill Axe', type: 'number' },
  { key: 'skillClub', label: 'Skill Club', type: 'number' },
  { key: 'skillDist', label: 'Skill Distance', type: 'number' },
  { key: 'skillShield', label: 'Skill Shield', type: 'number' },
  { key: 'skillFist', label: 'Skill Fist', type: 'number' },
  { key: 'magiclevelpoints', label: 'Magic Level Points', type: 'number' },
];

const ABSORB_FIELDS: FieldDef[] = [
  { key: 'absorbPercentPhysical', label: 'Absorb Physical %', type: 'number' },
  { key: 'absorbPercentFire', label: 'Absorb Fire %', type: 'number' },
  { key: 'absorbPercentIce', label: 'Absorb Ice %', type: 'number' },
  { key: 'absorbPercentEnergy', label: 'Absorb Energy %', type: 'number' },
  { key: 'absorbPercentEarth', label: 'Absorb Earth %', type: 'number' },
  { key: 'absorbPercentDeath', label: 'Absorb Death %', type: 'number' },
  { key: 'absorbPercentHoly', label: 'Absorb Holy %', type: 'number' },
];

const STAT_BONUS_FIELDS: FieldDef[] = [
  { key: 'bonusStrength', label: 'Strength', type: 'number' },
  { key: 'bonusDexterity', label: 'Dexterity', type: 'number' },
  { key: 'bonusEndurance', label: 'Endurance', type: 'number' },
  { key: 'bonusAgility', label: 'Agility', type: 'number' },
  { key: 'bonusIntelligence', label: 'Intelligence', type: 'number' },
  { key: 'bonusWisdom', label: 'Wisdom', type: 'number' },
  { key: 'bonusFocus', label: 'Focus', type: 'number' },
  { key: 'bonusSpirit', label: 'Spirit', type: 'number' },
];

const COMBAT_BONUS_FIELDS: FieldDef[] = [
  { key: 'bonusCritChance', label: 'Crit Chance', type: 'number' },
  { key: 'bonusCritDamage', label: 'Crit Damage', type: 'number' },
  { key: 'bonusDodge', label: 'Dodge', type: 'number' },
  { key: 'bonusCDR', label: 'CDR', type: 'number' },
  { key: 'bonusHealingPower', label: 'Healing Power', type: 'number' },
  { key: 'bonusAttackSpeed', label: 'Attack Speed', type: 'number' },
  { key: 'bonusPhysicalHit', label: 'Physical Hit', type: 'number' },
  { key: 'bonusSpellHit', label: 'Spell Hit', type: 'number' },
  { key: 'bonusMaxHealth', label: 'Max Health', type: 'number' },
  { key: 'bonusMaxMana', label: 'Max Mana', type: 'number' },
  { key: 'bonusCapacity', label: 'Capacity', type: 'number' },
  { key: 'bonusHealthRegen', label: 'Health Regen', type: 'number' },
  { key: 'bonusManaRegen', label: 'Mana Regen', type: 'number' },
  { key: 'bonusMaxStamina', label: 'Max Stamina', type: 'number' },
  { key: 'bonusStaminaRegen', label: 'Stamina Regen', type: 'number' },
  { key: 'bonusStatusResist', label: 'Status Resist', type: 'number' },
];

const GROUP_OPTIONS = [
  { value: 0, label: '0 — Normal' },
  { value: 1, label: '1 — Ground' },
  { value: 2, label: '2 — Container' },
  { value: 11, label: '11 — Splash' },
  { value: 12, label: '12 — Fluid Container' },
  { value: 14, label: '14 — None / Unused' },
];

// ─── Component ───────────────────────────────────────────────────────────────

export function ServerPropertiesEditor() {
  const selectedId = useOBStore((s) => s.selectedThingId);
  const objectData = useOBStore((s) => s.objectData);
  const activeCategory = useOBStore((s) => s.activeCategory);
  const itemDefinitions = useOBStore((s) => s.itemDefinitions);
  const clientToServerIds = useOBStore((s) => s.clientToServerIds);
  const updateItemDefinition = useOBStore((s) => s.updateItemDefinition);
  useOBStore((s) => s.editVersion);

  const thing = selectedId != null ? objectData?.things.get(selectedId) ?? null : null;
  const serverId = selectedId != null ? clientToServerIds.get(selectedId) : undefined;
  const def = serverId != null ? itemDefinitions.get(serverId) ?? null : null;
  const displayId = thing && objectData ? getDisplayId(objectData, thing.id) : selectedId ?? 0;

  const props: ItemProperties = useMemo(() => def?.properties ?? {}, [def]);

  const setProperty = useCallback((key: string, value: string | number | boolean | undefined) => {
    if (selectedId == null) return;
    const sid = clientToServerIds.get(selectedId);
    const current = sid != null ? itemDefinitions.get(sid) : undefined;
    const currentProps = current?.properties ? { ...current.properties } : {};
    if (value === undefined || value === '' || value === false) {
      delete currentProps[key];
    } else {
      currentProps[key] = value;
    }
    updateItemDefinition(selectedId, { properties: Object.keys(currentProps).length > 0 ? currentProps : null });
  }, [selectedId, itemDefinitions, updateItemDefinition]);

  if (activeCategory !== 'item') {
    return (
      <div className="flex items-center justify-center h-full text-emperia-muted text-sm p-4">
        Server properties are only available for items.
      </div>
    );
  }

  if (!thing) {
    return (
      <div className="flex items-center justify-center h-full text-emperia-muted text-sm p-4">
        No item selected
      </div>
    );
  }

  // Show imported/stored flags (what actually gets exported)
  const storedFlags = def?.flags ?? 0;
  const storedGroup = def?.group ?? 0;
  const storedServerId = def?.serverId;
  const activeOtbNames = OTB_FLAG_NAMES.filter((_, i) => (storedFlags & (1 << i)) !== 0)
    .map((n) => n.replace('FLAG_', ''));
  const groupLabel = GROUP_OPTIONS.find((o) => o.value === storedGroup)?.label ?? String(storedGroup);

  return (
    <div className="p-3 text-xs space-y-3 overflow-y-auto">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-emperia-text font-semibold">Item #{displayId}</span>
        {props.name && <span className="text-emperia-muted">— {props.name}</span>}
        {storedServerId != null && storedServerId !== selectedId && (
          <span className="text-emperia-muted/50 text-[10px]">(Server ID: {storedServerId})</span>
        )}
      </div>

      {/* Stored flags & group from definitions.json (read-only) */}
      <Section title="OTB Flags & Group (from definitions.json)">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-16 text-emperia-muted shrink-0">Group</span>
            <span className="text-emperia-text font-mono text-[10px]">{groupLabel}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-16 text-emperia-muted shrink-0">Flags</span>
            <span className="text-emperia-text font-mono text-[10px]">{storedFlags}</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-16 text-emperia-muted shrink-0">Active</span>
            <span className="text-emperia-text font-mono text-[10px] leading-relaxed">
              {activeOtbNames.length > 0 ? activeOtbNames.join(', ') : <span className="text-emperia-muted/50">none</span>}
            </span>
          </div>
          <p className="text-[9px] text-emperia-muted/50 mt-1">
            Imported from definitions.json. New items use flags derived from the Properties tab.
          </p>
        </div>
      </Section>

      <FieldSection title="Identity" fields={IDENTITY_FIELDS} props={props} setProperty={setProperty} />
      <FieldSection title="Equipment" fields={EQUIPMENT_FIELDS} props={props} setProperty={setProperty} />
      <FieldSection title="Combat Stats" fields={COMBAT_FIELDS} props={props} setProperty={setProperty} />
      <FieldSection title="Weight / Speed" fields={WEIGHT_FIELDS} props={props} setProperty={setProperty} />
      <FieldSection title="Requirements" fields={REQUIREMENT_FIELDS} props={props} setProperty={setProperty} />
      <FieldSection title="Container" fields={CONTAINER_FIELDS} props={props} setProperty={setProperty} />
      <FieldSection title="Decay / Transform" fields={DECAY_FIELDS} props={props} setProperty={setProperty} />
      <FieldSection title="Special" fields={SPECIAL_FIELDS} props={props} setProperty={setProperty} />
      <FieldSection title="Regeneration" fields={REGEN_FIELDS} props={props} setProperty={setProperty} />
      <FieldSection title="Skill Bonuses" fields={SKILL_FIELDS} props={props} setProperty={setProperty} />
      <FieldSection title="Absorb %" fields={ABSORB_FIELDS} props={props} setProperty={setProperty} />
      <FieldSection title="Stat Bonuses" fields={STAT_BONUS_FIELDS} props={props} setProperty={setProperty} />
      <FieldSection title="Combat Bonuses" fields={COMBAT_BONUS_FIELDS} props={props} setProperty={setProperty} />
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[10px] font-semibold text-emperia-muted uppercase tracking-wider mb-1">{title}</h3>
      {children}
    </div>
  );
}

function FieldSection({
  title,
  fields,
  props,
  setProperty,
}: {
  title: string;
  fields: FieldDef[];
  props: ItemProperties;
  setProperty: (key: string, value: string | number | boolean | undefined) => void;
}) {
  // Only show section if any field has a value, or always show first few important sections
  const hasValues = fields.some((f) => props[f.key] !== undefined && props[f.key] !== '');
  const alwaysShow = title === 'Identity';

  if (!hasValues && !alwaysShow) {
    return (
      <details>
        <summary className="text-[10px] font-semibold text-emperia-muted uppercase tracking-wider cursor-pointer hover:text-emperia-text select-none">
          {title}
        </summary>
        <div className="mt-1 space-y-1">
          {fields.map((f) => (
            <FieldRow key={f.key} field={f} value={props[f.key]} onChange={(v) => setProperty(f.key, v)} />
          ))}
        </div>
      </details>
    );
  }

  return (
    <Section title={title}>
      <div className="space-y-1">
        {fields.map((f) => (
          <FieldRow key={f.key} field={f} value={props[f.key]} onChange={(v) => setProperty(f.key, v)} />
        ))}
      </div>
    </Section>
  );
}

function FieldRow({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: string | number | boolean | undefined;
  onChange: (value: string | number | boolean | undefined) => void;
}) {
  const { label, type, options, placeholder } = field;

  if (type === 'boolean') {
    return (
      <label className="flex items-center gap-2 py-[2px] px-1 rounded hover:bg-emperia-hover cursor-pointer select-none">
        <input
          type="checkbox"
          checked={!!value}
          onChange={() => onChange(!value)}
          className="accent-emperia-accent"
        />
        <span className="text-emperia-text">{label}</span>
      </label>
    );
  }

  if (type === 'select') {
    return (
      <div className="flex items-center gap-2">
        <span className="w-28 text-emperia-muted shrink-0">{label}</span>
        <select
          value={value != null ? String(value) : ''}
          onChange={(e) => onChange(e.target.value || undefined)}
          className="flex-1 bg-emperia-bg border border-emperia-border rounded px-2 py-0.5 text-emperia-text text-xs"
        >
          {options!.map((o) => (
            <option key={o} value={o}>{o || '—'}</option>
          ))}
        </select>
      </div>
    );
  }

  if (type === 'number') {
    return (
      <div className="flex items-center gap-2">
        <span className="w-28 text-emperia-muted shrink-0">{label}</span>
        <input
          type="number"
          value={value != null ? String(value) : ''}
          placeholder={placeholder}
          onChange={(e) => {
            const v = e.target.value;
            if (v === '') { onChange(undefined); return; }
            const n = parseFloat(v);
            if (!isNaN(n)) onChange(n);
          }}
          className="flex-1 bg-emperia-bg border border-emperia-border rounded px-2 py-0.5 text-emperia-text text-xs w-0"
        />
      </div>
    );
  }

  // string
  return (
    <div className="flex items-center gap-2">
      <span className="w-28 text-emperia-muted shrink-0">{label}</span>
      <input
        type="text"
        value={value != null ? String(value) : ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value || undefined)}
        className="flex-1 bg-emperia-bg border border-emperia-border rounded px-2 py-0.5 text-emperia-text text-xs w-0"
      />
    </div>
  );
}
