import { useCallback, useMemo, useState } from 'react';
import { useOBStore } from '../store';
import { OTB_FLAG_NAMES } from '../lib/types';
import type { ItemProperties, ExclusiveSlotDef } from '../lib/types';

// ─── Field definitions for the UI ───────────────────────────────────────────

interface FieldDef {
  key: string;
  label: string;
  type: 'string' | 'number' | 'select' | 'boolean';
  options?: string[];
  placeholder?: string;
}

// Unified slot types: equipment slots + tool/item categories (used for both slotType and exclusive slot restrictions)
const SLOT_TYPES = [
  // Equipment slots
  'head', 'body', 'legs', 'feet',
  'left-hand', 'right-hand', 'hand', 'two-handed',
  'ring', 'necklace', 'backpack', 'belt', 'ammo', 'quiver',
  // Tool / item categories
  'rope', 'shovel', 'pick', 'knife', 'fishingRod',
  'potion', 'food', 'rune', 'key',
] as const;

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
  { key: 'slotType', label: 'Slot Type', type: 'select', options: ['', ...SLOT_TYPES] },
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
  { value: 3, label: '3 — Weapon' },
  { value: 4, label: '4 — Ammunition' },
  { value: 5, label: '5 — Armor' },
  { value: 6, label: '6 — Charges' },
  { value: 7, label: '7 — Teleport' },
  { value: 9, label: '9 — Write' },
  { value: 10, label: '10 — Write Once' },
  { value: 11, label: '11 — Fluid (Splash)' },
  { value: 12, label: '12 — Fluid Container' },
];

// ─── Component ───────────────────────────────────────────────────────────────

const SECTIONS: { key: string; title: string; fields: FieldDef[] }[] = [
  { key: 'identity', title: 'Identity', fields: IDENTITY_FIELDS },
  { key: 'equipment', title: 'Equipment', fields: EQUIPMENT_FIELDS },
  { key: 'combat', title: 'Combat Stats', fields: COMBAT_FIELDS },
  { key: 'weight', title: 'Weight / Speed', fields: WEIGHT_FIELDS },
  { key: 'requirements', title: 'Requirements', fields: REQUIREMENT_FIELDS },
  { key: 'container', title: 'Container', fields: CONTAINER_FIELDS },
  { key: 'decay', title: 'Decay / Transform', fields: DECAY_FIELDS },
  { key: 'special', title: 'Special', fields: SPECIAL_FIELDS },
  { key: 'regen', title: 'Regeneration', fields: REGEN_FIELDS },
  { key: 'skills', title: 'Skill Bonuses', fields: SKILL_FIELDS },
  { key: 'absorb', title: 'Absorb %', fields: ABSORB_FIELDS },
  { key: 'statBonus', title: 'Stat Bonuses', fields: STAT_BONUS_FIELDS },
  { key: 'combatBonus', title: 'Combat Bonuses', fields: COMBAT_BONUS_FIELDS },
];

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

  const setExclusiveSlots = useCallback((slots: ExclusiveSlotDef[] | undefined) => {
    if (selectedId == null) return;
    const sid = clientToServerIds.get(selectedId);
    const current = sid != null ? itemDefinitions.get(sid) : undefined;
    const currentProps = current?.properties ? { ...current.properties } : {};
    if (!slots || slots.length === 0) {
      delete currentProps.exclusiveSlots;
    } else {
      // Strip any stale keys (e.g. legacy "name") — only keep known fields
      currentProps.exclusiveSlots = slots.map(({ slotIndex, allowedItemTypes, allowedItemIds }) => {
        const clean: ExclusiveSlotDef = { slotIndex, allowedItemTypes };
        if (allowedItemIds && allowedItemIds.length > 0) clean.allowedItemIds = allowedItemIds;
        return clean;
      });
    }
    updateItemDefinition(selectedId, { properties: Object.keys(currentProps).length > 0 ? currentProps : null });
  }, [selectedId, itemDefinitions, updateItemDefinition]);

  // Auto-expand sections that have values, collapse empty ones
  const defaultExpanded = useMemo(() => {
    const set = new Set<string>();
    for (const sec of SECTIONS) {
      if (sec.fields.some((f) => props[f.key] !== undefined && props[f.key] !== '')) {
        set.add(sec.key);
      }
    }
    // Also expand container if exclusiveSlots has entries
    if (Array.isArray(props.exclusiveSlots) && props.exclusiveSlots.length > 0) {
      set.add('container');
    }
    // Always expand identity
    set.add('identity');
    return set;
  }, [props]);

  const [expanded, setExpanded] = useState<Set<string>>(defaultExpanded);

  // Sync defaults when item changes
  const [lastId, setLastId] = useState(selectedId);
  if (selectedId !== lastId) {
    setLastId(selectedId);
    setExpanded(defaultExpanded);
  }

  const toggle = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

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
  const activeOtbNames = OTB_FLAG_NAMES.filter((_, i) => (storedFlags & (1 << i)) !== 0)
    .map((n) => n.replace('FLAG_', ''));

  return (
    <div className="p-3 text-xs space-y-2 overflow-y-auto">
      {/* Stored flags & group from items.json */}
      <Section title="OTB Flags & Group">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-16 text-emperia-muted shrink-0">Group</span>
            <select
              value={storedGroup}
              onChange={(e) => {
                const g = parseInt(e.target.value, 10);
                if (selectedId != null) updateItemDefinition(selectedId, { group: g });
              }}
              className="flex-1 bg-emperia-bg border border-emperia-border rounded px-2 py-0.5 text-emperia-text text-xs"
            >
              {GROUP_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
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
            Groups 1 (Ground), 2 (Container), 11 (Splash), 12 (Fluid) are used by the server for gameplay logic.
          </p>
        </div>
      </Section>

      {SECTIONS.map((sec) => (
        <div key={sec.key}>
          <FieldSection
            title={sec.title}
            fields={sec.fields}
            props={props}
            setProperty={setProperty}
            expanded={expanded.has(sec.key)}
            onToggle={() => toggle(sec.key)}
          />
          {sec.key === 'container' && expanded.has('container') && (
            <ExclusiveSlotsEditor
              slots={(props.exclusiveSlots as ExclusiveSlotDef[] | undefined) ?? []}
              onChange={setExclusiveSlots}
            />
          )}
        </div>
      ))}
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
  expanded,
  onToggle,
}: {
  title: string;
  fields: FieldDef[];
  props: ItemProperties;
  setProperty: (key: string, value: string | number | boolean | undefined) => void;
  expanded: boolean;
  onToggle: () => void;
}) {
  const valueCount = fields.filter((f) => props[f.key] !== undefined && props[f.key] !== '').length;

  return (
    <div className="border border-emperia-border rounded overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 bg-emperia-bg hover:bg-emperia-hover transition-colors select-none"
      >
        <span className={`text-[9px] text-emperia-muted transition-transform ${expanded ? 'rotate-90' : ''}`}>▶</span>
        <span className="text-[10px] font-semibold text-emperia-muted uppercase tracking-wider">{title}</span>
        {valueCount > 0 && (
          <span className="ml-auto text-[9px] font-medium text-emperia-accent bg-emperia-accent/10 rounded-full px-1.5 py-px">
            {valueCount}
          </span>
        )}
      </button>
      {expanded && (
        <div className="px-2 pb-2 pt-1 space-y-1 border-t border-emperia-border">
          {fields.map((f) => (
            <FieldRow key={f.key} field={f} value={props[f.key] as string | number | boolean | undefined} onChange={(v) => setProperty(f.key, v)} />
          ))}
        </div>
      )}
    </div>
  );
}

function ExclusiveSlotsEditor({
  slots,
  onChange,
}: {
  slots: ExclusiveSlotDef[];
  onChange: (slots: ExclusiveSlotDef[] | undefined) => void;
}) {
  const addSlot = () => {
    const nextIndex = slots.length > 0 ? Math.max(...slots.map((s) => s.slotIndex)) + 1 : 0;
    onChange([...slots, { slotIndex: nextIndex, allowedItemTypes: [] }]);
  };

  const removeSlot = (i: number) => {
    const next = slots.filter((_, idx) => idx !== i);
    onChange(next.length > 0 ? next : undefined);
  };

  const updateSlot = (i: number, patch: Partial<ExclusiveSlotDef>) => {
    const next = slots.map((s, idx) => (idx === i ? { ...s, ...patch } : s));
    onChange(next);
  };

  return (
    <div className="mt-1 border border-emperia-border rounded overflow-hidden">
      <div className="flex items-center justify-between px-2 py-1 bg-emperia-bg">
        <span className="text-[10px] font-semibold text-emperia-muted uppercase tracking-wider">Exclusive Slots</span>
        <button
          onClick={addSlot}
          className="text-[9px] text-emperia-accent hover:text-emperia-text transition-colors px-1.5 py-0.5 rounded border border-emperia-border hover:bg-emperia-hover"
        >
          + Add Slot
        </button>
      </div>
      {slots.length > 0 && (
        <div className="px-2 pb-2 pt-1 space-y-2 border-t border-emperia-border">
          {slots.map((slot, i) => (
            <div key={i} className="border border-emperia-border/50 rounded p-1.5 space-y-1 bg-emperia-bg/30">
              <div className="flex items-center gap-1">
                <span className="text-[9px] text-emperia-accent font-bold shrink-0">#{slot.slotIndex}</span>
                <span className="flex-1" />
                <button
                  onClick={() => removeSlot(i)}
                  className="text-[9px] text-red-400 hover:text-red-300 px-1 shrink-0"
                  title="Remove slot"
                >
                  ×
                </button>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[9px] text-emperia-muted shrink-0 w-12">Index</span>
                <input
                  type="number"
                  value={slot.slotIndex}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    if (!isNaN(n) && n >= 0) updateSlot(i, { slotIndex: n });
                  }}
                  className="w-12 bg-emperia-bg border border-emperia-border rounded px-1.5 py-0.5 text-emperia-text text-[10px]"
                />
              </div>
              <div className="flex items-start gap-1">
                <span className="text-[9px] text-emperia-muted shrink-0 w-12 pt-0.5">Types</span>
                <div className="flex-1 flex flex-wrap gap-1">
                  {SLOT_TYPES.map((st) => {
                    const active = (slot.allowedItemTypes ?? []).includes(st);
                    return (
                      <button
                        key={st}
                        onClick={() => {
                          const current = slot.allowedItemTypes ?? [];
                          const next = active ? current.filter((t) => t !== st) : [...current, st];
                          updateSlot(i, { allowedItemTypes: next });
                        }}
                        className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${
                          active
                            ? 'bg-emperia-accent/20 border-emperia-accent text-emperia-accent'
                            : 'bg-emperia-bg border-emperia-border text-emperia-muted hover:text-emperia-text hover:border-emperia-text/30'
                        }`}
                      >
                        {st}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-start gap-1">
                <span className="text-[9px] text-emperia-muted shrink-0 w-12 pt-0.5">IDs</span>
                <input
                  type="text"
                  value={(slot.allowedItemIds ?? []).join(', ')}
                  placeholder="Allowed client IDs (comma-separated)"
                  onChange={(e) => {
                    const ids = e.target.value
                      .split(',')
                      .map((t) => parseInt(t.trim(), 10))
                      .filter((n) => !isNaN(n) && n > 0);
                    updateSlot(i, { allowedItemIds: ids.length > 0 ? ids : undefined });
                  }}
                  className="flex-1 bg-emperia-bg border border-emperia-border rounded px-1.5 py-0.5 text-emperia-text text-[10px] w-0"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
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
