import type { ItemProperties } from './types';

export const ITEM_PROPERTY_CODE_BY_KEY: Readonly<Record<string, number>> = {
  name: 1,
  article: 2,
  description: 3,
  type: 4,
  weaponType: 10,
  slotType: 11,
  ammoType: 12,
  shootType: 13,
  itemType: 14,
  damageElement: 15,
  physicalAttack: 20,
  magicalAttack: 21,
  physicalDefense: 22,
  magicalDefense: 23,
  armor: 26,
  // 27-29 are reserved retired combat attributes. Physical Hit uses 186.
  range: 30,
  level: 40,
  expertise: 41,
  skillSword: 50,
  skillAxe: 51,
  skillClub: 52,
  skillDist: 53,
  skillShield: 54,
  skillFist: 55,
  magiclevelpoints: 56,
  absorbPercentPhysical: 70,
  absorbPercentFire: 71,
  absorbPercentIce: 72,
  absorbPercentEnergy: 73,
  absorbPercentEarth: 74,
  absorbPercentDeath: 75,
  absorbPercentHoly: 76,
  containerSize: 90,
  containerSizePotions: 91,
  weightReduction: 92,
  healthGain: 100,
  healthTicks: 101,
  manaGain: 102,
  manaTicks: 103,
  speed: 110,
  friction: 111,
  floorchange: 112,
  charges: 120,
  showcharges: 121,
  showduration: 122,
  duration: 123,
  decayTo: 124,
  destroyTo: 125,
  transformEquipTo: 130,
  transformDeEquipTo: 131,
  rotateTo: 132,
  exclusiveSlots: 144,
  fluidSource: 147,
  field: 149,
  readable: 150,
  writeable: 151,
  weight: 160,
  maxTextLen: 165,
  writeOnceItemId: 166,
  bonusStrength: 170,
  bonusDexterity: 171,
  bonusEndurance: 172,
  bonusAgility: 173,
  bonusIntelligence: 174,
  bonusWisdom: 175,
  bonusFocus: 176,
  bonusSpirit: 177,
  bonusCritChance: 180,
  bonusCritDamage: 181,
  bonusDodge: 182,
  bonusCDR: 183,
  bonusHealingPower: 184,
  bonusAttackSpeed: 185,
  bonusPhysicalHit: 186,
  bonusSpellHit: 187,
  bonusMaxHealth: 188,
  bonusMaxMana: 189,
  bonusCapacity: 190,
  bonusHealthRegen: 191,
  bonusManaRegen: 192,
  bonusMaxStamina: 193,
  bonusStaminaRegen: 194,
  maxUses: 200,
  uses: 201,
  bonusStatusResist: 249,
  harvestType: 270,
  harvestResultItemId: 271,
  harvestQuantityMin: 272,
  harvestQuantityMax: 273,
  harvestTier: 274,
  harvestRequiredMasteryLevel: 275,
  harvestRequiredToolType: 276,
  harvestRequiredToolTier: 277,
  harvestToolUseCost: 278,
  harvestBaseChanceBps: 279,
  harvestChancePerLevelBps: 280,
  harvestMaxChanceBps: 281,
  harvestAttemptXp: 282,
  harvestSuccessXp: 283,
  harvestBonusYieldPerLevelBps: 284,
  harvestBonusYieldMaxBps: 285,
  harvestSizeMultiplierBps: 286,
  harvestMode: 287,
  harvestTransformItemId: 288,
  harvestRespawnSeconds: 289,
  toolTier: 290,
  marketable: 291,
  autoLootable: 292,
  mannequin: 293,
  mannequinDirection: 294,
};

const WEAPON_TYPES = [
  '', 'sword', 'axe', 'club', 'distance', 'orb', 'shield',
  'ammunition', 'fist', 'melee', 'ranged',
] as const;
const SLOT_TYPES = [
  '', 'head', 'body', 'legs', 'feet', 'left-hand', 'right-hand',
  'hand', 'two-handed', 'ring', 'necklace', 'backpack', 'belt', 'ammo',
  'quiver', 'torch', 'pet',
] as const;
const DAMAGE_ELEMENTS = [
  '', 'fire', 'earth', 'water', 'wind', 'ice', 'death', 'arcane', 'holy',
] as const;
const AMMO_TYPES = ['', 'arrow', 'bolt'] as const;
const FLOOR_CHANGES = [
  '', 'north', 'east', 'south', 'west', 'down', 'southalt', 'eastalt',
] as const;
const FIELD_TYPES = ['', 'fire', 'poison', 'energy'] as const;
const FLUID_SOURCES: readonly (string | undefined)[] = [
  '', 'water', 'blood', 'beer', 'slime', 'lemonade',
  undefined, undefined, undefined, undefined, undefined, undefined, undefined,
  undefined, undefined, 'wine', undefined, undefined, undefined, 'mud',
  undefined, undefined, undefined, undefined, undefined, undefined, 'lava',
  'rum',
];
const ITEM_CATEGORIES: readonly (string | undefined)[] = [
  '', 'rope', 'shovel', 'pick', 'knife', 'fishingRod', 'potion', 'machete',
  undefined, undefined, 'head', 'body', 'legs', 'feet', 'left-hand',
  'right-hand', 'hand', 'two-handed', 'ring', 'necklace', 'backpack', 'belt',
  'quiver', 'food', 'rune', 'key', 'shield',
];
const THING_TYPES = [
  'bed', 'container', 'corpse', 'depot', 'door', 'fluidContainer', 'key',
  'magicfield', 'mailbox', 'readable', 'rune', 'splash', 'teleport',
  'trashholder', 'windowClosed', 'lever', 'chest', 'doorClosed', 'doorOpen',
  'wall', 'stair', 'trapdoor', 'taskboard', 'windowOpen',
] as const;
const HARVEST_TYPES = ['', 'mining', 'herbalism', 'skinning', 'fishing', 'chopping'] as const;
const HARVEST_MODES = ['keep', 'remove', 'transform', 'mark'] as const;

const ENUMS_BY_KEY: Readonly<Record<string, readonly (string | undefined)[]>> = {
  weaponType: WEAPON_TYPES,
  slotType: SLOT_TYPES,
  damageElement: DAMAGE_ELEMENTS,
  ammoType: AMMO_TYPES,
  itemType: ITEM_CATEGORIES,
  floorchange: FLOOR_CHANGES,
  field: FIELD_TYPES,
  fluidSource: FLUID_SOURCES,
  type: THING_TYPES,
  harvestType: HARVEST_TYPES,
  harvestRequiredToolType: ITEM_CATEGORIES,
  harvestMode: HARVEST_MODES,
};

/**
 * Equipment modifiers are additive values. Zero has the same gameplay meaning
 * as no modifier, so keep the canonical JSON clean by removing the attribute.
 * Do not apply this rule to every numeric property: zero is a valid value for
 * fields such as mannequinDirection.
 */
function isNeutralEquipmentModifier(key: string, value: unknown): boolean {
  return value === 0 && (
    key.startsWith('skill')
    || key === 'magiclevelpoints'
    || key.startsWith('absorbPercent')
    || key.startsWith('bonus')
  );
}

function decodePropertyValue(key: string, value: unknown): unknown {
  const values = ENUMS_BY_KEY[key];
  if (!values || typeof value !== 'number') return value;
  return values[value] ?? value;
}

function encodePropertyValue(key: string, value: unknown): unknown {
  const values = ENUMS_BY_KEY[key];
  if (!values || typeof value !== 'string') return value;
  const index = values.indexOf(value);
  if (index < 0) throw new Error(`Unknown canonical ${key} value "${value}"`);
  return index;
}

export function readItemProperty(
  properties: ItemProperties | null | undefined,
  key: string,
): unknown {
  if (!properties) return undefined;
  const code = ITEM_PROPERTY_CODE_BY_KEY[key];
  if (code == null) return undefined;
  return decodePropertyValue(key, properties[String(code)]);
}

export function normalizeItemPropertiesForEditor(
  properties: ItemProperties | null | undefined,
): ItemProperties {
  if (!properties) return {};
  const normalized: ItemProperties = { ...properties };
  for (const key of Object.keys(ITEM_PROPERTY_CODE_BY_KEY)) {
    const value = readItemProperty(properties, key);
    if (value !== undefined) normalized[key] = value as ItemProperties[string];
  }
  return normalized;
}

export function writeItemProperty(
  properties: ItemProperties,
  key: string,
  value: ItemProperties[string],
): void {
  const code = ITEM_PROPERTY_CODE_BY_KEY[key];
  const numericKey = code == null ? undefined : String(code);
  const remove = value === undefined
    || value === ''
    || value === false
    || isNeutralEquipmentModifier(key, value);
  delete properties[key];

  if (remove) {
    if (numericKey) delete properties[numericKey];
    return;
  }

  if (!numericKey) throw new Error(`Unknown canonical item property "${key}"`);
  properties[numericKey] = encodePropertyValue(key, value) as ItemProperties[string];
}

export function hasEquipmentClassification(
  properties: ItemProperties | null | undefined,
): boolean {
  const weaponType = readItemProperty(properties, 'weaponType');
  const slotType = readItemProperty(properties, 'slotType');
  return (
    (typeof weaponType === 'string' && weaponType.trim() !== '')
    || (typeof slotType === 'string' && slotType.trim() !== '')
  );
}
