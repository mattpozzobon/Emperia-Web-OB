/**
 * Core data types for the Object Builder.
 * Standalone — no game dependencies.
 */

export type ThingCategory = 'item' | 'outfit' | 'effect' | 'distance';

export interface FrameGroup {
  type: number;
  width: number;
  height: number;
  layers: number;
  patternX: number;
  patternY: number;
  patternZ: number;
  animationLength: number;
  asynchronous: number;
  nLoop: number;
  start: number;
  animationLengths: { min: number; max: number }[];
  sprites: number[];
}

export interface ThingFlags {
  ground: boolean;
  groundSpeed?: number;
  groundBorder: boolean;
  onBottom: boolean;
  onTop: boolean;
  container: boolean;
  stackable: boolean;
  forceUse: boolean;
  multiUse: boolean;
  writable: boolean;
  writableMaxLen?: number;
  writableOnce: boolean;
  writableOnceMaxLen?: number;
  fluidContainer: boolean;
  splash: boolean;
  notWalkable: boolean;
  notMoveable: boolean;
  blockProjectile: boolean;
  notPathable: boolean;
  pickupable: boolean;
  hangable: boolean;
  hookSouth: boolean;
  hookEast: boolean;
  rotateable: boolean;
  hasLight: boolean;
  lightLevel?: number;
  lightColor?: number;
  dontHide: boolean;
  translucent: boolean;
  hasDisplacement: boolean;
  displacementX?: number;
  displacementY?: number;
  hasElevation: boolean;
  elevation?: number;
  lyingCorpse: boolean;
  animateAlways: boolean;
  hasMinimapColor: boolean;
  minimapColor?: number;
  fullGround: boolean;
  look: boolean;
  cloth: boolean;
  clothSlot?: number;
  lensHelp?: number;
  hasMarket: boolean;
  marketCategory?: number;
  marketTradeAs?: number;
  marketShowAs?: number;
  marketName?: string;
  marketRestrictVocation?: number;
  marketRequiredLevel?: number;
  usable: boolean;
  usableActionId?: number;
  wrapable: boolean;
  unwrapable: boolean;
  topEffect: boolean;
  noMoveAnimation: boolean;
  chargeable: boolean;
}

export interface ThingType {
  id: number;
  category: ThingCategory;
  flags: ThingFlags;
  frameGroups: FrameGroup[];
  /** Original binary bytes (flags + frame groups) for lossless round-trip */
  rawBytes?: Uint8Array;
}

export interface ObjectData {
  version: number;
  itemCount: number;
  outfitCount: number;
  effectCount: number;
  distanceCount: number;
  things: Map<number, ThingType>;
  /** The entire original file buffer for lossless round-trip */
  originalBuffer: ArrayBuffer;
}

export interface SpriteData {
  version: number;
  spriteCount: number;
  addresses: Map<number, number>;
  buffer: Uint8Array;
  /** The entire original file buffer for lossless round-trip */
  originalBuffer: ArrayBuffer;
}

/**
 * OTB bit-flag names in bit-position order (bit 0 = index 0).
 * Must match the server's OTBBitFlag definition exactly.
 */
export const OTB_FLAG_NAMES = [
  'FLAG_BLOCK_SOLID',        // 1
  'FLAG_BLOCK_PROJECTILE',   // 2
  'FLAG_BLOCK_PATHFIND',     // 4
  'FLAG_HAS_HEIGHT',         // 8
  'FLAG_USEABLE',            // 16
  'FLAG_PICKUPABLE',         // 32
  'FLAG_MOVEABLE',           // 64
  'FLAG_STACKABLE',          // 128
  'FLAG_FLOORCHANGEDOWN',    // 256
  'FLAG_FLOORCHANGENORTH',   // 512
  'FLAG_FLOORCHANGEEAST',    // 1024
  'FLAG_FLOORCHANGESOUTH',   // 2048
  'FLAG_FLOORCHANGEWEST',    // 4096
  'FLAG_ALWAYSONTOP',        // 8192
  'FLAG_READABLE',           // 16384
  'FLAG_ROTATABLE',          // 32768
  'FLAG_HANGABLE',           // 65536
  'FLAG_VERTICAL',           // 131072
  'FLAG_HORIZONTAL',         // 262144
  'FLAG_CANNOTDECAY',        // 524288
  'FLAG_ALLOWDISTREAD',      // 1048576
  'FLAG_UNUSED',             // 2097152
  'FLAG_CLIENTCHARGES',      // 4194304
  'FLAG_LOOKTHROUGH',        // 8388608
  'FLAG_ANIMATION',          // 16777216
  'FLAG_FULLTILE',           // 33554432
  'FLAG_FORCEUSE',           // 67108864
] as const;

/**
 * Bitmask of OTB flags that have a direct mapping from visual ThingFlags.
 * Only these bits are updated when visual flags change; all other OTB bits
 * (e.g. FLAG_FULLTILE, FLAG_CANNOTDECAY, FLAG_ALLOWDISTREAD) are preserved.
 */
const VISUAL_MAPPED_BITS =
  (1 << 0) |   // FLAG_BLOCK_SOLID      ← notWalkable
  (1 << 1) |   // FLAG_BLOCK_PROJECTILE ← blockProjectile
  (1 << 2) |   // FLAG_BLOCK_PATHFIND   ← notPathable
  (1 << 3) |   // FLAG_HAS_HEIGHT       ← hasElevation
  (1 << 4) |   // FLAG_USEABLE          ← forceUse | multiUse
  (1 << 5) |   // FLAG_PICKUPABLE       ← pickupable
  (1 << 6) |   // FLAG_MOVEABLE         ← !notMoveable
  (1 << 7) |   // FLAG_STACKABLE        ← stackable
  (1 << 13) |  // FLAG_ALWAYSONTOP      ← onTop
  (1 << 14) |  // FLAG_READABLE         ← writable | writableOnce
  (1 << 15) |  // FLAG_ROTATABLE        ← rotateable
  (1 << 16) |  // FLAG_HANGABLE         ← hangable
  (1 << 17) |  // FLAG_VERTICAL         ← hookSouth
  (1 << 18) |  // FLAG_HORIZONTAL       ← hookEast
  (1 << 22) |  // FLAG_CLIENTCHARGES    ← chargeable
  (1 << 23) |  // FLAG_LOOKTHROUGH      ← translucent
  (1 << 24) |  // FLAG_ANIMATION        ← animateAlways
  (1 << 26);   // FLAG_FORCEUSE         ← forceUse

/**
 * Compute the visual-mapped OTB bits from ThingFlags (only the mapped bits).
 */
function visualToOtbBits(f: ThingFlags): number {
  let bits = 0;
  if (f.notWalkable)      bits |= (1 << 0);
  if (f.blockProjectile)  bits |= (1 << 1);
  if (f.notPathable)      bits |= (1 << 2);
  if (f.hasElevation)     bits |= (1 << 3);
  if (f.forceUse || f.multiUse) bits |= (1 << 4);
  if (f.pickupable)       bits |= (1 << 5);
  if (!f.notMoveable)     bits |= (1 << 6);
  if (f.stackable)        bits |= (1 << 7);
  if (f.onTop)            bits |= (1 << 13);
  if (f.writable || f.writableOnce) bits |= (1 << 14);
  if (f.rotateable)       bits |= (1 << 15);
  if (f.hangable)         bits |= (1 << 16);
  if (f.hookSouth)        bits |= (1 << 17);
  if (f.hookEast)         bits |= (1 << 18);
  if (f.chargeable)       bits |= (1 << 22);
  if (f.translucent)      bits |= (1 << 23);
  if (f.animateAlways)    bits |= (1 << 24);
  if (f.forceUse)         bits |= (1 << 26);
  return bits;
}

/**
 * Sync OTB flags from visual ThingFlags. Updates only the mapped bits,
 * preserving all OTB-only bits (FLAG_FULLTILE, FLAG_CANNOTDECAY, etc.).
 */
export function syncOtbFromVisual(existingOtb: number, f: ThingFlags): number {
  return (existingOtb & ~VISUAL_MAPPED_BITS) | visualToOtbBits(f);
}

/**
 * Derive OTB flags for a brand-new item (no existing OTB data).
 */
export function deriveOtbFlags(f: ThingFlags): number {
  return visualToOtbBits(f);
}

/**
 * Merge floor-change property into OTB flags bitmask.
 */
export function mergeFloorChangeFlags(bits: number, floorchange?: string): number {
  // Clear existing floor change bits
  bits &= ~((1 << 8) | (1 << 9) | (1 << 10) | (1 << 11) | (1 << 12));
  if (!floorchange) return bits;
  switch (floorchange) {
    case 'down':  bits |= (1 << 8); break;   // FLAG_FLOORCHANGEDOWN
    case 'north': bits |= (1 << 9); break;   // FLAG_FLOORCHANGENORTH
    case 'east':  bits |= (1 << 10); break;  // FLAG_FLOORCHANGEEAST
    case 'south': bits |= (1 << 11); break;  // FLAG_FLOORCHANGESOUTH
    case 'west':  bits |= (1 << 12); break;  // FLAG_FLOORCHANGEWEST
  }
  return bits;
}

/**
 * Derive the server group from visual ThingFlags.
 */
export function deriveGroup(f: ThingFlags): number {
  if (f.ground || f.groundBorder) return 1;  // Ground
  if (f.container) return 2;                  // Container
  if (f.splash) return 11;                    // Splash
  if (f.fluidContainer) return 12;            // Fluid Container
  return 0;                                    // Normal
}

// ─── Equipment sprite mapping (item-to-sprite.json) ─────────────────────────

/** A single entry in the item-to-sprite.json file. */
export interface ItemToSpriteEntry {
  name: string;
  id: number;
  sprite_id: number;
}

/** The raw JSON shape of item-to-sprite.json. */
export interface ItemToSpriteFile {
  items: ItemToSpriteEntry[];
}

/** Equipment slot filter keys used in the UI. */
export type EquipSlotFilter =
  | 'all'
  | 'head'
  | 'body'
  | 'legs'
  | 'feet'
  | 'left-hand'
  | 'right-hand'
  | 'backpack'
  | 'belt';

/** Server-side item properties (string-keyed, same as definitions.json "properties"). */
export interface ItemProperties {
  // Identity
  name?: string;
  article?: string;
  description?: string;
  type?: string;

  // Equipment classification
  weaponType?: string;
  slotType?: string;
  ammoType?: string;
  shootType?: string;
  damageElement?: string;

  // Combat stats
  physicalAttack?: number;
  magicalAttack?: number;
  physicalDefense?: number;
  magicalDefense?: number;
  armor?: number;
  extradef?: number;
  hitChance?: number;
  maxHitChance?: number;
  range?: number;

  // Requirements
  level?: number;
  expertise?: number;

  // Container
  containerSize?: number;
  containerSizePotions?: number;
  weightReduction?: number;

  // Weight / Speed
  weight?: number;
  speed?: number;
  friction?: number;
  floorchange?: string;

  // Charges, decay, duration
  charges?: number;
  showcharges?: boolean;
  showduration?: boolean;
  duration?: number;
  decayTo?: number;
  destroyTo?: number;

  // Transform
  transformEquipTo?: number;
  transformDeEquipTo?: number;
  rotateTo?: number;

  // Special
  fluidSource?: string;
  field?: string;
  readable?: boolean;
  writeable?: boolean;
  maxTextLen?: number;
  writeOnceItemId?: number;

  // Regen
  healthGain?: number;
  healthTicks?: number;
  manaGain?: number;
  manaTicks?: number;

  // Skill bonuses
  skillSword?: number;
  skillAxe?: number;
  skillClub?: number;
  skillDist?: number;
  skillShield?: number;
  skillFist?: number;
  magiclevelpoints?: number;

  // Absorb percentages
  absorbPercentPhysical?: number;
  absorbPercentFire?: number;
  absorbPercentIce?: number;
  absorbPercentEnergy?: number;
  absorbPercentEarth?: number;
  absorbPercentDeath?: number;
  absorbPercentHoly?: number;

  // Stat bonuses
  bonusStrength?: number;
  bonusDexterity?: number;
  bonusEndurance?: number;
  bonusAgility?: number;
  bonusIntelligence?: number;
  bonusWisdom?: number;
  bonusFocus?: number;
  bonusSpirit?: number;

  // Combat bonuses
  bonusCritChance?: number;
  bonusCritDamage?: number;
  bonusDodge?: number;
  bonusCDR?: number;
  bonusHealingPower?: number;
  bonusAttackSpeed?: number;
  bonusPhysicalHit?: number;
  bonusSpellHit?: number;
  bonusMaxHealth?: number;
  bonusMaxMana?: number;
  bonusCapacity?: number;
  bonusHealthRegen?: number;
  bonusManaRegen?: number;
  bonusMaxStamina?: number;
  bonusStaminaRegen?: number;
  bonusStatusResist?: number;

  /** Catch-all for unknown properties from the JSON */
  [key: string]: string | number | boolean | undefined;
}

/** Full server-side item definition (one entry in definitions.json).
 *  - `serverId` = the JSON key in definitions.json (server/OTB ID)
 *  - `id` = the inner "id" field (client/.eobj ID) — used to map to the Web OB's things
 */
export interface ServerItemData {
  serverId: number;
  id?: number;
  flags: number;
  group: number;
  properties: ItemProperties | null;
}

// ─── Hair Definitions ────────────────────────────────────────────────────────

/** Race bitmask flags — matches server Race enum values as bit positions. */
export const enum HairRace {
  Human = 1 << 0,  // 1
  Demon = 1 << 1,  // 2
  Orc   = 1 << 2,  // 4
}
export const HAIR_RACE_ALL = HairRace.Human | HairRace.Demon | HairRace.Orc; // 7

/** Gender bitmask flags — matches server Sex enum values as bit positions. */
export const enum HairGender {
  Male   = 1 << 0,  // 1
  Female = 1 << 1,  // 2
}
export const HAIR_GENDER_ALL = HairGender.Male | HairGender.Female; // 3

/** Account tier bitmask flags — matches server AccountTier enum values as bit positions. */
export const enum HairTier {
  Free  = 1 << 0,  // 1 (Commoner)
  Noble = 1 << 1,  // 2
}
export const HAIR_TIER_ALL = HairTier.Free | HairTier.Noble; // 3

/** A single hair definition entry. */
export interface HairDefinition {
  /** Unique numeric hair ID (stable key, used for persistence). */
  hairId: number;
  /** Display name shown in UI and character creator. */
  name: string;
  /** Outfit sprite ID used by the renderer for the hair layer. */
  outfitId: number;
  /** Bitmask of allowed races (HairRace flags). */
  races: number;
  /** Bitmask of allowed genders (HairGender flags). */
  genders: number;
  /** Bitmask of allowed account tiers (HairTier flags). */
  tiers: number;
  /** Sort order for display (lower = first). */
  sortOrder: number;
}

/** The JSON shape of hair-definitions.json (keyed by hairId as string). */
export interface HairDefinitionsFile {
  [hairId: string]: {
    name: string;
    outfitId: number;
    races: number;
    genders: number;
    tiers: number;
    sortOrder: number;
  };
}
