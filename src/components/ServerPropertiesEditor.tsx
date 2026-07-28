import { useCallback, useMemo, useState } from 'react';
import { useOBStore } from '../store';
import type { ItemProperties, ExclusiveSlotDef } from '../lib/types';
import { ITEM_SLOT_TYPES } from '../lib/item-slot-types';
import { inferVisualFlagsFromIdentity, ITEM_IDENTITY_OPTIONS } from '../lib/item-identity';
import { HelpTooltip } from './HelpTooltip';
import type { HelpContent } from './HelpTooltip';

// ─── Field definitions for the UI ───────────────────────────────────────────

interface FieldDef {
  key: string;
  label: string;
  type: 'string' | 'number' | 'select' | 'boolean';
  options?: string[];
  placeholder?: string;
  help?: string;
}

const FIELD_HELP: Record<string, string> = {
  name: 'Server display name used in item look text, search, tooltips, and exports.',
  article: 'Article prepended to the item name in English text, such as "a" or "an".',
  description: 'Optional description sent in detailed item look/tooltips.',
  type: 'Canonical item identity used by interaction, lighting, rendering, and server gameplay systems.',
  weaponType: 'Classifies the item for combat formulas and equipment rules.',
  slotType: 'Equipment slot or item category used by equipment panels, restrictions, and outfit catalog links.',
  ammoType: 'Ammunition category used by ranged weapons.',
  shootType: 'Projectile visual/type identifier used by ranged attacks.',
  damageElement: 'Element associated with this item or weapon damage.',
  physicalAttack: 'Base physical attack value used by combat calculations.',
  magicalAttack: 'Base magical attack value used by combat calculations.',
  physicalDefense: 'Base physical defense value used by equipment/stat calculations.',
  magicalDefense: 'Base magical defense value used by equipment/stat calculations.',
  extradef: 'Extra defense modifier for shields or equipment.',
  hitChance: 'Base hit chance modifier.',
  maxHitChance: 'Maximum hit chance cap for this item.',
  range: 'Attack or use range for ranged items.',
  weight: 'Server-side weight. Pickupable items use this for capacity calculations and look details.',
  speed: 'Optional movement speed-style property; most ground movement uses Ground Speed/Friction instead.',
  floorchange: 'Marks tiles that move the player between floors in a direction.',
  level: 'Minimum player level requirement.',
  expertise: 'Minimum expertise requirement.',
  containerSize: 'Number of normal container slots.',
  containerSizePotions: 'Potion-only slot count for potion belts or similar containers.',
  weightReduction: 'Capacity/weight reduction applied by this container.',
  charges: 'Number of uses or charges shown/consumed by chargeable items.',
  duration: 'Duration in seconds/ticks for decaying or timed items.',
  decayTo: 'Item id this item transforms into after duration expires.',
  destroyTo: 'Item id this item becomes when destroyed.',
  rotateTo: 'Item id this item becomes when rotated.',
  transformEquipTo: 'Item id this item becomes when equipped.',
  transformDeEquipTo: 'Item id this item becomes when unequipped.',
  fluidSource: 'Fluid provided when an empty fluid container is used on this item, such as water, blood, or slime.',
  field: 'Magic field metadata used by field items.',
  healthGain: 'Health regenerated per tick while this item effect is active.',
  healthTicks: 'Interval for health regeneration.',
  manaGain: 'Mana regenerated per tick while this item effect is active.',
  manaTicks: 'Interval for mana regeneration.',
  maxUses: 'Maximum number of tool uses before depletion or breakage.',
  uses: 'Current/default uses value for tool items.',
};

const FIELD_EXAMPLES: Record<string, string> = {
  name: 'An item named "steel sword" appears with that name in look text, searches, and server messages.',
  article: 'Use "an" for "an arcane orb"; the server combines it with the item name in English text.',
  description: 'A quest item can display "An old key marked with the royal seal." when inspected.',
  type: 'Closed and open doors use doorClosed and doorOpen; walls and windows can drive lighting occlusion while levers and chests drive proximity interaction.',
  weaponType: 'Set sword so combat and equipment rules treat the item as a sword weapon.',
  slotType: 'Set head for a helmet or potion for an item that belongs to the potion/tool category.',
  ammoType: 'A bow can require the same ammunition category configured on its arrow item.',
  shootType: 'A bow attack can request the arrow projectile visual associated with this value.',
  damageElement: 'Set fire on a weapon whose additional damage must be resolved as fire damage.',
  weight: 'A value of 350 represents 3.50 oz in server capacity and item look calculations.',
  speed: 'A special item can grant or describe a movement-speed modifier where the consuming system reads this property.',
  floorchange: 'Set north on a stair tile that moves a creature toward the corresponding upper/lower-floor destination.',
  level: 'Set 20 so equipment validation can reject a level 12 player attempting to equip the item.',
  expertise: 'Set the required expertise rank before the server allows the item to be used or equipped.',
  containerSize: 'Set 20 on a backpack to create twenty normal inventory slots.',
  containerSizePotions: 'Set 4 on a potion belt to reserve four potion-specific positions.',
  weightReduction: 'A specialized bag can reduce the effective carried weight according to this configured value.',
  charges: 'A rune with 5 charges can be used five times before its charge count reaches zero.',
  duration: 'A temporary field can remain active for the configured duration before decay processing.',
  decayTo: 'A lit torch can decay into the dimmer torch item ID after its duration expires.',
  destroyTo: 'A breakable crate can transform into its debris item ID when destroyed.',
  rotateTo: 'Rotating a north-facing chair changes it into the east-facing chair item ID.',
  transformEquipTo: 'Equipping an inactive torch can transform it into its equipped/active item variant.',
  transformDeEquipTo: 'Removing that active torch can transform it back to the inventory variant.',
  fluidSource: 'A water source configured as water fills an empty vial with the water subtype.',
  field: 'A fire-field item stores the field metadata used when the server applies its field behavior.',
  healthGain: 'Food can restore the configured health amount each regeneration tick.',
  healthTicks: 'Set the interval that separates each health regeneration application.',
  manaGain: 'A regeneration item can restore the configured mana amount on every mana tick.',
  manaTicks: 'Set the interval that separates each mana regeneration application.',
  maxUses: 'A pickaxe with Max Uses 100 can track a lifetime limit of one hundred uses.',
  uses: 'A partially used pickaxe can start or persist with its current use counter.',
};

function getFieldHelp(field: FieldDef): HelpContent {
  let description = field.help ?? FIELD_HELP[field.key];
  if (!description && field.key.startsWith('skill')) {
    description = `Equipment bonus applied to the player's ${field.label} skill while the item contributes its stats.`;
  } else if (!description && field.key === 'magiclevelpoints') {
    description = 'Equipment bonus applied to the player magic-level stat while the item contributes its stats.';
  } else if (!description && field.key.startsWith('absorbPercent')) {
    description = `Percentage reduction for the ${field.label.replace('Absorb ', '').replace(' %', '')} damage category.`;
  } else if (!description && field.key.startsWith('bonus')) {
    description = `${field.label} contribution included when the server aggregates active equipment bonuses.`;
  } else if (!description) {
    description = `${field.label} is stored in the item definition and consumed by the corresponding server system.`;
  }

  let example = FIELD_EXAMPLES[field.key];
  if (!example && (field.key.startsWith('skill') || field.key === 'magiclevelpoints')) {
    example = `Equipment with ${field.label} 2 contributes two points to that skill while its bonuses are active.`;
  } else if (!example && field.key.startsWith('absorbPercent')) {
    example = `${field.label} 10 reduces the matching incoming damage category by ten percent when the equipment applies.`;
  } else if (!example && field.key.startsWith('bonus')) {
    example = `${field.label} 3 contributes a value of three to the player's aggregated equipment bonuses.`;
  } else if (!example && /Attack|Defense|armor|extradef|hitChance|maxHitChance|range/i.test(field.key)) {
    example = `A value configured for ${field.label} is included when the server builds the item's combat profile.`;
  } else {
    example = `Set ${field.label} on this item, compile, and the server will load it from items.json for the relevant gameplay rule.`;
  }

  return {
    title: field.label,
    scope: 'Server',
    description,
    example,
  };
}

// Unified slot types: equipment slots + tool/item categories (used for both slotType and exclusive slot restrictions)
const FLUID_SOURCE_OPTIONS = [
  '',
  'water',
  'blood',
  'beer',
  'slime',
  'lemonade',
  'milk',
  'mana',
  'oil',
  'urine',
  'coconutmilk',
  'wine',
  'mud',
  'fruitjuice',
  'lava',
  'rum',
] as const;

const IDENTITY_FIELDS: FieldDef[] = [
  { key: 'name', label: 'Name', type: 'string', help: FIELD_HELP.name },
  { key: 'article', label: 'Article', type: 'string', placeholder: 'a / an', help: FIELD_HELP.article },
  { key: 'description', label: 'Description', type: 'string', help: FIELD_HELP.description },
  { key: 'type', label: 'Type', type: 'select', options: [...ITEM_IDENTITY_OPTIONS], help: FIELD_HELP.type },
];

const EQUIPMENT_FIELDS: FieldDef[] = [
  { key: 'weaponType', label: 'Weapon Type', type: 'select', options: [
    '', 'sword', 'axe', 'club', 'distance', 'shield', 'wand', 'orb', 'magical',
  ]},
  { key: 'slotType', label: 'Slot Type', type: 'select', options: ['', ...ITEM_SLOT_TYPES], help: FIELD_HELP.slotType },
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
  { key: 'extradef', label: 'Extra Def', type: 'number' },
  { key: 'hitChance', label: 'Hit Chance', type: 'number' },
  { key: 'maxHitChance', label: 'Max Hit Chance', type: 'number' },
  { key: 'range', label: 'Range', type: 'number' },
];

const WEIGHT_FIELDS: FieldDef[] = [
  { key: 'weight', label: 'Weight', type: 'number' },
  { key: 'speed', label: 'Speed', type: 'number' },
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
  { key: 'fluidSource', label: 'Fluid Source', type: 'select', options: [...FLUID_SOURCE_OPTIONS], help: FIELD_HELP.fluidSource },
  { key: 'field', label: 'Field', type: 'string' },
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

const TOOL_USES_FIELDS: FieldDef[] = [
  { key: 'maxUses', label: 'Max Uses', type: 'number' },
  { key: 'uses', label: 'Uses', type: 'number' },
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
  { key: 'special', title: 'Sources & Fields', fields: SPECIAL_FIELDS },
  { key: 'regen', title: 'Regeneration', fields: REGEN_FIELDS },
  { key: 'skills', title: 'Skill Bonuses', fields: SKILL_FIELDS },
  { key: 'absorb', title: 'Absorb %', fields: ABSORB_FIELDS },
  { key: 'statBonus', title: 'Stat Bonuses', fields: STAT_BONUS_FIELDS },
  { key: 'combatBonus', title: 'Combat Bonuses', fields: COMBAT_BONUS_FIELDS },
  { key: 'toolUses', title: 'Tool Uses', fields: TOOL_USES_FIELDS },
];

export function ServerPropertiesEditor({
  mode = 'all',
}: {
  mode?: 'all' | 'identity' | 'details';
}) {
  const selectedId = useOBStore((s) => s.selectedThingId);
  const objectData = useOBStore((s) => s.objectData);
  const activeCategory = useOBStore((s) => s.activeCategory);
  const itemDefinitions = useOBStore((s) => s.itemDefinitions);
  const appearanceToItemIds = useOBStore((s) => s.appearanceToItemIds);
  const updateItemDefinition = useOBStore((s) => s.updateItemDefinition);
  const updateThingFlags = useOBStore((s) => s.updateThingFlags);
  useOBStore((s) => s.editVersion);

  const thing = selectedId != null ? objectData?.things.get(selectedId) ?? null : null;
  const itemId = selectedId != null ? appearanceToItemIds.get(selectedId) : undefined;
  const def = itemId != null ? itemDefinitions.get(itemId) ?? null : null;

  const props: ItemProperties = useMemo(() => def?.properties ?? {}, [def]);

  const setProperty = useCallback((key: string, value: string | number | boolean | undefined) => {
    if (selectedId == null) return;
    const itemId = appearanceToItemIds.get(selectedId);
    const current = itemId != null ? itemDefinitions.get(itemId) : undefined;
    const currentProps = current?.properties ? { ...current.properties } : {};
    if (value === undefined || value === '' || value === false) {
      delete currentProps[key];
    } else {
      currentProps[key] = value;
    }
    if (key === 'type' && typeof value === 'string' && thing) {
      updateThingFlags(
        selectedId,
        inferVisualFlagsFromIdentity(value, thing.flags),
      );
    }
    updateItemDefinition(selectedId, { properties: Object.keys(currentProps).length > 0 ? currentProps : null });
  }, [
    appearanceToItemIds,
    itemDefinitions,
    selectedId,
    thing,
    updateItemDefinition,
    updateThingFlags,
  ]);

  const setExclusiveSlots = useCallback((slots: ExclusiveSlotDef[] | undefined) => {
    if (selectedId == null) return;
    const itemId = appearanceToItemIds.get(selectedId);
    const current = itemId != null ? itemDefinitions.get(itemId) : undefined;
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
  const visibleSections = useMemo(
    () => SECTIONS.filter((section) => (
      mode === 'all'
      || (mode === 'identity' && section.key === 'identity')
      || (mode === 'details' && section.key !== 'identity')
    )),
    [mode],
  );

  const defaultExpanded = useMemo(() => {
    const set = new Set<string>();
    for (const sec of visibleSections) {
      if (sec.fields.some((f) => props[f.key] !== undefined && props[f.key] !== '')) {
        set.add(sec.key);
      }
    }
    // Also expand container if exclusiveSlots has entries
    if (Array.isArray(props.exclusiveSlots) && props.exclusiveSlots.length > 0) {
      set.add('container');
    }
    if (mode !== 'details') set.add('identity');
    return set;
  }, [mode, props, visibleSections]);

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

  return (
    <div className="space-y-2 text-xs">
      {visibleSections.map((sec) => (
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
                  {ITEM_SLOT_TYPES.map((st) => {
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
                  placeholder="Allowed item IDs (comma-separated)"
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
  const help = getFieldHelp(field);
  const labelNode = (
    <span className="w-28 text-emperia-muted shrink-0 flex items-center gap-1">
      <span>{label}</span>
      <HelpTooltip content={help} />
    </span>
  );

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
        <HelpTooltip content={help} />
      </label>
    );
  }

  if (type === 'select') {
    return (
      <div className="flex items-center gap-2">
        {labelNode}
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
        {labelNode}
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
      {labelNode}
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
