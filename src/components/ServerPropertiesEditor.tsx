import { useCallback, useMemo, useState } from 'react';
import { useOBStore } from '../store';
import type { ItemProperties, ExclusiveSlotDef } from '../lib/types';
import { ITEM_SLOT_TYPES } from '../lib/item-slot-types';
import { inferVisualFlagsFromIdentity, ITEM_IDENTITY_GROUPS } from '../lib/item-identity';
import {
  hasEquipmentClassification,
  normalizeItemPropertiesForEditor,
  writeItemProperty,
} from '../lib/item-properties';
import { compositeThingDataUrl } from '../lib/sprite-decoder';
import { HelpTooltip } from './HelpTooltip';
import type { HelpContent } from './HelpTooltip';

// ─── Field definitions for the UI ───────────────────────────────────────────

interface FieldDef {
  key: string;
  label: string;
  type: 'string' | 'number' | 'select' | 'boolean' | 'identity-buttons';
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
  itemType: 'Canonical non-equipment item category used by tools, consumables, runes, keys, and container restrictions.',
  shootType: 'Projectile visual/type identifier used by ranged attacks.',
  damageElement: 'Element associated with this item or weapon damage.',
  physicalAttack: 'Base physical attack value used by combat calculations.',
  magicalAttack: 'Base magical attack value used by combat calculations.',
  physicalDefense: 'Base physical defense value used by equipment/stat calculations.',
  magicalDefense: 'Base magical defense value used by equipment/stat calculations.',
  range: 'Attack or use range for ranged items.',
  weight: 'Server-side weight. Pickupable items use this for capacity calculations and look details.',
  speed: 'Optional movement speed-style property; most ground movement uses Ground Speed/Friction instead.',
  floorchange: 'Marks tiles that move the player between floors in a direction.',
  level: 'Minimum player level requirement.',
  expertise: 'Minimum expertise requirement.',
  containerSize: 'Number of normal container slots.',
  containerSizePotions: 'Potion-only slot count for potion belts or similar containers.',
  weightReduction: 'Capacity/weight reduction applied by this container.',
  mannequin: 'Creates the explicit mannequin runtime type and world equipment presentation.',
  mannequinDirection: 'Outfit direction used to render displayed equipment (0-7).',
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
  type: 'Use doorClosed/doorOpen and windowClosed/windowOpen for stateful structures; selecting one also synchronizes its intrinsic visual flags.',
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
  mannequin: 'Enable only for containers whose exclusive slots represent visible head, body, legs, and feet equipment.',
  mannequinDirection: 'Use 2 for the south-facing mannequin variant and 1 for the east-facing variant.',
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
    description = `Percentage reduction for the ${field.label.replace('Absorb ', '').replace(' %', '')} damage category. Set it to 0 or clear the field to remove the modifier.`;
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
  } else if (!example && /Attack|Defense|armor|range/i.test(field.key)) {
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

const EQUIPMENT_SLOT_TYPES = ITEM_SLOT_TYPES.filter((slot) => (
  [
    'head', 'body', 'legs', 'feet', 'left-hand', 'right-hand', 'hand',
    'two-handed', 'ring', 'necklace', 'backpack', 'belt', 'ammo',
    'quiver', 'torch', 'pet',
  ] as readonly string[]
).includes(slot));

const FLUID_SOURCE_OPTIONS = [
  '',
  'water',
  'blood',
  'beer',
  'slime',
  'lemonade',
  'wine',
  'mud',
  'lava',
  'rum',
] as const;

const IDENTITY_FIELDS: FieldDef[] = [
  { key: 'name', label: 'Name', type: 'string', help: FIELD_HELP.name },
  { key: 'article', label: 'Article', type: 'string', placeholder: 'a / an', help: FIELD_HELP.article },
  { key: 'description', label: 'Description', type: 'string', help: FIELD_HELP.description },
  { key: 'type', label: 'Type', type: 'identity-buttons', help: FIELD_HELP.type },
];

const EQUIPMENT_FIELDS: FieldDef[] = [
  { key: 'weaponType', label: 'Weapon Type', type: 'select', options: [
    '', 'sword', 'axe', 'club', 'distance', 'orb', 'shield', 'ammunition', 'fist',
  ]},
  { key: 'slotType', label: 'Slot Type', type: 'select', options: ['', ...EQUIPMENT_SLOT_TYPES], help: FIELD_HELP.slotType },
  { key: 'ammoType', label: 'Ammo Type', type: 'select', options: ['', 'arrow', 'bolt'] },
  { key: 'shootType', label: 'Shoot Type', type: 'number' },
  { key: 'damageElement', label: 'Damage Element', type: 'select', options: [
    '', 'fire', 'earth', 'water', 'wind', 'ice', 'death', 'arcane', 'holy',
  ]},
];

const HARVEST_FIELDS: FieldDef[] = [
  { key: 'harvestType', label: 'Harvest Type', type: 'select', options: ['', 'mining', 'herbalism', 'skinning', 'fishing', 'chopping'] },
  { key: 'harvestResultItemId', label: 'Result Item ID', type: 'number' },
  { key: 'harvestQuantityMin', label: 'Minimum Quantity', type: 'number' },
  { key: 'harvestQuantityMax', label: 'Maximum Quantity', type: 'number' },
  { key: 'harvestTier', label: 'Resource Tier', type: 'number' },
  { key: 'harvestRequiredMasteryLevel', label: 'Required Mastery Level', type: 'number' },
  { key: 'harvestRequiredToolType', label: 'Required Tool', type: 'select', options: ['', 'pick', 'knife', 'fishingRod', 'machete'] },
  { key: 'harvestRequiredToolTier', label: 'Required Tool Tier', type: 'number' },
  { key: 'harvestToolUseCost', label: 'Tool Use Cost', type: 'number' },
  { key: 'harvestBaseChanceBps', label: 'Base Chance (bps)', type: 'number' },
  { key: 'harvestChancePerLevelBps', label: 'Chance / Level (bps)', type: 'number' },
  { key: 'harvestMaxChanceBps', label: 'Maximum Chance (bps)', type: 'number' },
  { key: 'harvestAttemptXp', label: 'Attempt XP', type: 'number' },
  { key: 'harvestSuccessXp', label: 'Success XP', type: 'number' },
  { key: 'harvestBonusYieldPerLevelBps', label: 'Bonus Yield / Level (bps)', type: 'number' },
  { key: 'harvestBonusYieldMaxBps', label: 'Maximum Bonus Yield (bps)', type: 'number' },
  { key: 'harvestSizeMultiplierBps', label: 'Size Multiplier (bps)', type: 'number' },
  { key: 'harvestMode', label: 'After Harvest', type: 'select', options: ['keep', 'remove', 'transform', 'mark'] },
  { key: 'harvestTransformItemId', label: 'Transform Item ID', type: 'number' },
  { key: 'harvestRespawnSeconds', label: 'Respawn (seconds)', type: 'number' },
];

const AVAILABILITY_FIELDS: FieldDef[] = [
  { key: 'marketable', label: 'Can be used in Market', type: 'boolean' },
  { key: 'autoLootable', label: 'Can be selected for Auto Loot', type: 'boolean' },
];

const COMBAT_FIELDS: FieldDef[] = [
  { key: 'physicalAttack', label: 'Physical Attack', type: 'number' },
  { key: 'magicalAttack', label: 'Magical Attack', type: 'number' },
  { key: 'physicalDefense', label: 'Physical Defense', type: 'number' },
  { key: 'magicalDefense', label: 'Magical Defense', type: 'number' },
  { key: 'range', label: 'Range', type: 'number' },
];

const WEIGHT_FIELDS: FieldDef[] = [
  { key: 'weight', label: 'Weight', type: 'number' },
  { key: 'speed', label: 'Speed', type: 'number' },
  { key: 'floorchange', label: 'Floor Change', type: 'select', options: ['', 'north', 'east', 'south', 'west', 'down', 'southalt', 'eastalt'] },
];

const REQUIREMENT_FIELDS: FieldDef[] = [
  { key: 'level', label: 'Level', type: 'number' },
  { key: 'expertise', label: 'Expertise', type: 'number' },
];

const CONTAINER_FIELDS: FieldDef[] = [
  { key: 'containerSize', label: 'Container Size', type: 'number' },
  { key: 'containerSizePotions', label: 'Container Size (Potions)', type: 'number' },
  { key: 'weightReduction', label: 'Weight Reduction', type: 'number' },
  { key: 'mannequin', label: 'World Mannequin', type: 'boolean' },
  { key: 'mannequinDirection', label: 'Mannequin Direction', type: 'number' },
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
  { key: 'itemType', label: 'Item Category', type: 'select', options: [
    '', 'rope', 'shovel', 'pick', 'knife', 'fishingRod', 'potion', 'machete',
    'food', 'rune', 'key', 'shield',
  ]},
  { key: 'fluidSource', label: 'Fluid Source', type: 'select', options: [...FLUID_SOURCE_OPTIONS], help: FIELD_HELP.fluidSource },
  { key: 'field', label: 'Field', type: 'select', options: ['', 'fire', 'poison', 'energy'] },
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

type SectionGroup = 'identity' | 'equipment' | 'general';

interface SectionDef {
  key: string;
  title: string;
  fields: FieldDef[];
  group: SectionGroup;
  equippableOnly?: boolean;
}

const SECTION_GROUP_LABELS: Record<Exclude<SectionGroup, 'identity'>, string> = {
  equipment: 'Equipment metadata',
  general: 'General item metadata',
};

const DETAILS_TAB_LABELS: Record<string, string> = {
  general: 'General',
  equipment: 'Equipment',
  combat: 'Combat',
  requirements: 'Requirements',
  skills: 'Skills',
  absorb: 'Absorb',
  statBonus: 'Stats',
  combatBonus: 'Bonuses',
  regen: 'Regeneration',
  toolUses: 'Tool Uses',
  harvest: 'Harvest',
  availability: 'Market',
};

const SECTIONS: SectionDef[] = [
  { key: 'identity', title: 'Identity', fields: IDENTITY_FIELDS, group: 'identity' },
  { key: 'equipment', title: 'Equipment', fields: EQUIPMENT_FIELDS, group: 'equipment' },
  { key: 'combat', title: 'Combat Stats', fields: COMBAT_FIELDS, group: 'equipment', equippableOnly: true },
  { key: 'requirements', title: 'Requirements', fields: REQUIREMENT_FIELDS, group: 'equipment', equippableOnly: true },
  { key: 'skills', title: 'Skill Bonuses', fields: SKILL_FIELDS, group: 'equipment', equippableOnly: true },
  { key: 'absorb', title: 'Absorb %', fields: ABSORB_FIELDS, group: 'equipment', equippableOnly: true },
  { key: 'statBonus', title: 'Stat Bonuses', fields: STAT_BONUS_FIELDS, group: 'equipment', equippableOnly: true },
  { key: 'combatBonus', title: 'Combat Bonuses', fields: COMBAT_BONUS_FIELDS, group: 'equipment', equippableOnly: true },
  { key: 'regen', title: 'Regeneration', fields: REGEN_FIELDS, group: 'equipment', equippableOnly: true },
  { key: 'toolUses', title: 'Tool Uses', fields: TOOL_USES_FIELDS, group: 'equipment', equippableOnly: true },
  { key: 'harvest', title: 'Harvest', fields: HARVEST_FIELDS, group: 'general' },
  { key: 'availability', title: 'Market / Auto Loot', fields: AVAILABILITY_FIELDS, group: 'general' },
  { key: 'weight', title: 'Weight / Speed', fields: WEIGHT_FIELDS, group: 'general' },
  { key: 'container', title: 'Container', fields: CONTAINER_FIELDS, group: 'general' },
  { key: 'decay', title: 'Decay / Transform', fields: DECAY_FIELDS, group: 'general' },
  { key: 'special', title: 'Sources & Fields', fields: SPECIAL_FIELDS, group: 'general' },
];

const EQUIPMENT_DETAIL_TAB_KEYS = new Set(
  SECTIONS
    .filter((section) => section.group === 'equipment' && section.key !== 'equipment')
    .map((section) => section.key),
);

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
  const itemId = useMemo(() => {
    if (selectedId == null) return undefined;
    const primaryItemId = appearanceToItemIds.get(selectedId);
    let resolvedItemId = primaryItemId != null
      && itemDefinitions.has(primaryItemId)
      ? primaryItemId
      : undefined;
    let fallbackItemId = primaryItemId;
    for (const [candidateItemId, appearanceId] of objectData?.itemAppearances ?? []) {
      if (appearanceId !== selectedId) continue;
      fallbackItemId ??= candidateItemId;
      const candidate = itemDefinitions.get(candidateItemId);
      if (!candidate) continue;
      const current = resolvedItemId != null
        ? itemDefinitions.get(resolvedItemId)
        : undefined;
      const candidateIsEquipment = hasEquipmentClassification(candidate.properties);
      const currentIsEquipment = hasEquipmentClassification(current?.properties);
      if (
        !current
        || (candidateIsEquipment && !currentIsEquipment)
        || (
          candidateIsEquipment === currentIsEquipment
          && candidateItemId === selectedId
          && resolvedItemId !== selectedId
        )
      ) {
        resolvedItemId = candidateItemId;
      }
    }
    return resolvedItemId ?? fallbackItemId;
  }, [
    appearanceToItemIds,
    itemDefinitions,
    objectData?.itemAppearances,
    selectedId,
  ]);
  const def = itemId != null ? itemDefinitions.get(itemId) ?? null : null;

  const props: ItemProperties = useMemo(
    () => normalizeItemPropertiesForEditor(def?.properties),
    [def],
  );
  const isEquippable = useMemo(
    () => hasEquipmentClassification(def?.properties),
    [def],
  );
  const [detailsTab, setDetailsTab] = useState<string>(
    isEquippable ? 'equipment' : 'general',
  );
  const activeDetailsTab = !isEquippable
    && EQUIPMENT_DETAIL_TAB_KEYS.has(detailsTab)
    ? 'equipment'
    : detailsTab;

  const setProperty = useCallback((key: string, value: string | number | boolean | undefined) => {
    if (selectedId == null) return;
    const current = itemId != null ? itemDefinitions.get(itemId) : undefined;
    const currentProps = current?.properties ? { ...current.properties } : {};
    writeItemProperty(currentProps, key, value);
    if (key === 'type' && typeof value === 'string' && thing) {
      updateThingFlags(
        selectedId,
        inferVisualFlagsFromIdentity(value, thing.flags),
      );
    }
    updateItemDefinition(selectedId, { properties: Object.keys(currentProps).length > 0 ? currentProps : null });
  }, [
    itemId,
    itemDefinitions,
    selectedId,
    thing,
    updateItemDefinition,
    updateThingFlags,
  ]);

  const setExclusiveSlots = useCallback((slots: ExclusiveSlotDef[] | undefined) => {
    if (selectedId == null) return;
    const current = itemId != null ? itemDefinitions.get(itemId) : undefined;
    const currentProps = current?.properties ? { ...current.properties } : {};
    if (!slots || slots.length === 0) {
      writeItemProperty(currentProps, 'exclusiveSlots', undefined);
    } else {
      // Strip any stale keys (e.g. legacy "name") — only keep known fields
      const cleanSlots = slots.map(({ slotIndex, allowedItemTypes, allowedItemIds }) => {
        const clean: ExclusiveSlotDef = { slotIndex, allowedItemTypes };
        if (allowedItemIds && allowedItemIds.length > 0) clean.allowedItemIds = allowedItemIds;
        return clean;
      });
      writeItemProperty(currentProps, 'exclusiveSlots', cleanSlots);
    }
    updateItemDefinition(selectedId, { properties: Object.keys(currentProps).length > 0 ? currentProps : null });
  }, [itemId, selectedId, itemDefinitions, updateItemDefinition]);

  // Auto-expand sections that have values, collapse empty ones
  const visibleSections = useMemo(
    () => SECTIONS.filter((section) => (
      (
        mode === 'all'
        || (mode === 'identity' && section.key === 'identity')
        || (
          mode === 'details'
          && section.key !== 'identity'
          && (
            (
              activeDetailsTab === 'general'
              && section.group === 'general'
              && section.key !== 'harvest'
              && section.key !== 'availability'
            )
            || section.key === activeDetailsTab
          )
        )
      )
      && (!section.equippableOnly || isEquippable)
    )),
    [activeDetailsTab, isEquippable, mode],
  );

  const mainDetailsTabs = useMemo(
    () => [
      { key: 'general', title: 'General item properties' },
      { key: 'equipment', title: 'Equipment properties' },
      { key: 'harvest', title: 'Harvest configuration' },
      { key: 'availability', title: 'Market and auto-loot availability' },
    ],
    [],
  );
  const equipmentSubTabs = useMemo(
    () => SECTIONS
      .filter((section) => (
        section.group === 'equipment'
        && section.key !== 'equipment'
        && (!section.equippableOnly || isEquippable)
      ))
      .map((section) => ({ key: section.key, title: section.title })),
    [isEquippable],
  );
  const equipmentTabKeys = useMemo(
    () => new Set(['equipment', ...equipmentSubTabs.map((tab) => tab.key)]),
    [equipmentSubTabs],
  );
  const activeMainDetailsTab = equipmentTabKeys.has(activeDetailsTab)
    ? 'equipment'
    : activeDetailsTab;

  const defaultExpanded = useMemo(() => {
    const set = new Set<string>();
    for (const sec of SECTIONS) {
      if (sec.equippableOnly && !isEquippable) continue;
      if (sec.fields.some((f) => props[f.key] !== undefined && props[f.key] !== '')) {
        set.add(sec.key);
      }
    }
    // Also expand container if exclusiveSlots has entries
    if (Array.isArray(props.exclusiveSlots) && props.exclusiveSlots.length > 0) {
      set.add('container');
    }
    if (
      mode === 'details'
      && (activeDetailsTab !== 'general' || isEquippable)
    ) {
      set.add(activeDetailsTab === 'general' ? 'equipment' : activeDetailsTab);
    }
    if (mode !== 'details') set.add('identity');
    return set;
  }, [activeDetailsTab, isEquippable, mode, props]);

  const [expanded, setExpanded] = useState<Set<string>>(defaultExpanded);

  const selectDetailsTab = useCallback((tab: string) => {
    setDetailsTab(tab);
    if (tab !== 'general') {
      setExpanded((previous) => {
        if (previous.has(tab)) return previous;
        const next = new Set(previous);
        next.add(tab);
        return next;
      });
    }
  }, []);

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
      {mode === 'details' && (
        <div
          role="tablist"
          aria-label="Item definition section"
          className="flex gap-1 overflow-x-auto rounded border border-emperia-border bg-emperia-bg p-1"
        >
          {mainDetailsTabs.map((tab) => {
            const active = activeMainDetailsTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active}
                title={tab.title}
                onClick={() => selectDetailsTab(tab.key)}
                className={`flex shrink-0 items-center justify-center gap-1.5 rounded px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                  active
                    ? 'bg-emperia-accent/15 text-emperia-accent'
                    : 'text-emperia-muted hover:bg-emperia-hover hover:text-emperia-text'
                }`}
              >
                {DETAILS_TAB_LABELS[tab.key] ?? tab.title}
                {tab.key === 'equipment' && isEquippable && (
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-emperia-accent"
                    title="Equipment type configured"
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
      {mode === 'details' && activeMainDetailsTab === 'equipment' && equipmentSubTabs.length > 0 && (
        <div
          role="tablist"
          aria-label="Equipment property section"
          className="flex gap-1 overflow-x-auto border-b border-emperia-border px-1"
        >
          {equipmentSubTabs.map((tab) => {
            const active = activeDetailsTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active}
                title={tab.title}
                onClick={() => selectDetailsTab(tab.key)}
                className={`shrink-0 border-b-2 px-2 py-1.5 text-[9px] font-semibold uppercase tracking-wider transition-colors ${
                  active
                    ? 'border-emperia-accent text-emperia-accent'
                    : 'border-transparent text-emperia-muted hover:text-emperia-text'
                }`}
              >
                {DETAILS_TAB_LABELS[tab.key] ?? tab.title}
              </button>
            );
          })}
        </div>
      )}
      {visibleSections.map((sec, index) => (
        <div key={sec.key}>
          {mode !== 'details'
            && sec.group !== 'identity'
            && (index === 0 || visibleSections[index - 1]?.group !== sec.group)
            && (
              <div className="flex items-center gap-2 px-0.5 pt-1">
                <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-emperia-muted/70">
                  {SECTION_GROUP_LABELS[sec.group]}
                </span>
                <span className="h-px flex-1 bg-emperia-border/60" />
              </div>
            )}
          <FieldSection
            title={sec.title}
            fields={sec.fields}
            props={props}
            setProperty={setProperty}
            expanded={expanded.has(sec.key)}
            onToggle={() => toggle(sec.key)}
          />
          {sec.key === 'equipment' && expanded.has('equipment') && !isEquippable && (
            <p className="px-2 pt-1 text-[9px] leading-relaxed text-emperia-muted/70">
              Set Weapon Type or Slot Type to enable combat stats, requirements,
              skill bonuses, absorption, stat bonuses, combat bonuses,
              regeneration, and tool uses.
            </p>
          )}
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

  if (type === 'identity-buttons') {
    const selected = typeof value === 'string' ? value : '';

    return (
      <div className="space-y-2 pt-1">
        <div className="flex items-center gap-1 text-emperia-muted">
          <span>{label}</span>
          <HelpTooltip content={help} />
          <button
            type="button"
            aria-pressed={!selected}
            onClick={() => onChange(undefined)}
            className={`ml-auto rounded border px-2 py-0.5 text-[10px] transition-colors ${
              !selected
                ? 'border-emperia-accent bg-emperia-accent/20 text-emperia-accent'
                : 'border-emperia-border bg-emperia-bg text-emperia-muted hover:border-emperia-text/30 hover:text-emperia-text'
            }`}
          >
            None
          </button>
        </div>
        {ITEM_IDENTITY_GROUPS.map((group) => (
          <div key={group.label} className="space-y-1">
            <div className="text-[9px] font-semibold uppercase tracking-wider text-emperia-muted/80">
              {group.label}
            </div>
            <div className="flex flex-wrap gap-1">
              {group.options.map((option) => {
                const active = selected === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={active}
                    title={option.value}
                    onClick={() => onChange(active ? undefined : option.value)}
                    className={`rounded border px-2 py-1 text-[10px] leading-none transition-colors ${
                      active
                        ? 'border-emperia-accent bg-emperia-accent/20 text-emperia-accent'
                        : 'border-emperia-border bg-emperia-bg text-emperia-muted hover:border-emperia-text/30 hover:bg-emperia-hover hover:text-emperia-text'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
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
    const showItemPreview = field.key === 'harvestResultItemId';
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
        {showItemPreview && (
          <ItemReferenceThumbnail
            itemId={typeof value === 'number' ? value : Number(value)}
          />
        )}
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

function ItemReferenceThumbnail({ itemId }: { itemId: number }) {
  const objectData = useOBStore((state) => state.objectData);
  const spriteData = useOBStore((state) => state.spriteData);
  const spriteOverrides = useOBStore((state) => state.spriteOverrides);
  const itemDefinitions = useOBStore((state) => state.itemDefinitions);
  const editVersion = useOBStore((state) => state.editVersion);

  const preview = useMemo(() => {
    if (!objectData || !spriteData || !Number.isInteger(itemId) || itemId <= 0) {
      return { url: null, valid: false };
    }

    const appearanceId = objectData.itemAppearances.get(itemId);
    const thing = appearanceId == null
      ? undefined
      : objectData.things.get(appearanceId);
    const group = thing?.frameGroups[0];
    if (!thing || !group) return { url: null, valid: false };

    const width = Math.max(1, group.width);
    const height = Math.max(1, group.height);
    const tileCount = width * height;
    return {
      valid: true,
      url: compositeThingDataUrl(
        spriteData,
        thing.id,
        width,
        height,
        group.sprites.slice(0, tileCount),
        spriteOverrides,
      ),
    };
  }, [editVersion, itemId, objectData, spriteData, spriteOverrides]);

  const itemName = itemDefinitions.get(itemId)?.properties?.name;
  const title = preview.valid
    ? `${typeof itemName === 'string' ? `${itemName} — ` : ''}Item #${itemId}`
    : Number.isInteger(itemId) && itemId > 0
      ? `Item #${itemId} has no appearance`
      : 'Enter a valid result item ID';

  return (
    <div
      className={`checkerboard flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded border ${
        preview.valid ? 'border-emperia-border' : 'border-emperia-border/50'
      }`}
      title={title}
      aria-label={title}
    >
      {preview.url ? (
        <img
          src={preview.url}
          alt=""
          draggable={false}
          className="pixelated max-h-full max-w-full"
          style={{ imageRendering: 'pixelated' }}
        />
      ) : (
        <span className="text-[9px] text-emperia-muted/40">
          {preview.valid ? '—' : '?'}
        </span>
      )}
    </div>
  );
}
