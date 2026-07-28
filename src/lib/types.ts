/**
 * Core data types for the Object Builder.
 * Standalone — no game dependencies.
 */

export type ThingCategory = 'item' | 'outfit' | 'equipment' | 'hair' | 'effect' | 'distance';
export type LibraryCategory = ThingCategory;

export interface FrameGroup {
  type: number;
  width: number;
  height: number;
  exactSizeHint?: number;
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
  writableOnce: boolean;
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
  translucent: boolean;
  hasDisplacement: boolean;
  displacementX?: number;
  displacementY?: number;
  hasElevation: boolean;
  elevation?: number;
  animateAlways: boolean;
  hasMinimapColor: boolean;
  minimapColor?: number;
  renderBelowCreatures: boolean;
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
  /** Emperia container format version (0 for legacy Tibia .dat files). */
  formatVersion: number;
  version: number;
  itemCount: number;
  outfitCount: number;
  equipmentCount: number;
  hairCount: number;
  effectCount: number;
  distanceCount: number;
  /** Public item ID -> internal sequential appearance ID, embedded in EOBJ. */
  itemAppearances: Map<number, number>;
  /** Stable public outfit ID -> zero-based outfit appearance ID. */
  outfitAppearances: Map<number, number>;
  /** Public item ID -> compact slot/category metadata, embedded in EOBJ. */
  itemSlotTypes: Map<number, string>;
  /** Public item ID -> semantic identity used by interaction and lighting. */
  itemIdentities: Map<number, string>;
  /** Public item ID -> client-only seated-pose metadata, embedded in EOBJ. */
  itemSeatDefinitions: Map<number, ItemSeatDefinition>;
  /** Stable pose-set ID -> reusable action/variant metadata, embedded in EOBJ. */
  poseSets: Map<number, PoseSetDefinition>;
  /** Pose-set ID + direction -> Pose Lab rig, embedded in EOBJ. */
  seatPoseProfiles: Map<string, SeatPoseProfile>;
  /** Public item ID -> zero-based equipment appearances, embedded in EOBJ. */
  equipmentAppearances: Map<number, EquipmentAppearance>;
  /** Stable visual equipment ID -> zero-based equipment appearance, without an item. */
  visualEquipmentAppearances: Map<number, VisualEquipmentAppearance>;
  /** Stable hair ID -> zero-based hair appearance and eligibility metadata. */
  hairDefinitions: Map<number, HairDefinition>;
  things: Map<number, ThingType>;
  /** The entire original file buffer for lossless round-trip */
  originalBuffer: ArrayBuffer;
}

export type SeatType = 'chair' | 'bench';
export type SeatDirection = 'north' | 'east' | 'south' | 'west';
export type PoseAction = 'sit' | 'sit-ground' | 'attack';

export interface SeatOffset {
  x: number;
  y: number;
}

export interface ItemSeatDefinition {
  /** Reusable Pose Set selected for this furniture item. */
  poseSetId: number;
  /** Direction bits use north=1, east=2, south=4, west=8. */
  directionMask: number;
  offsets: Record<SeatDirection, SeatOffset>;
}

export interface PoseSetDefinition {
  id: number;
  name: string;
  action: PoseAction;
}

export interface PoseSegmentTransform {
  translate: SeatOffset;
  /** Percentage where 100 means the original size. */
  scale: SeatOffset;
  /** Shear angles in degrees. */
  skew: SeatOffset;
}

export type BodyPartId =
  | 'torso' | 'head'
  | 'upper-arm-left' | 'forearm-left' | 'hand-left'
  | 'upper-arm-right' | 'forearm-right' | 'hand-right'
  | 'thigh-left' | 'shin-left' | 'foot-left'
  | 'thigh-right' | 'shin-right' | 'foot-right';

export interface BodyPartPose {
  id: BodyPartId;
  parentId: BodyPartId | null;
  anchor: SeatOffset;
  rotation: number;
  offset: SeatOffset;
  visible: boolean;
}

export interface AnatomicalRig {
  version: 1;
  parts: BodyPartPose[];
  drawOrder: BodyPartId[];
  maskRanges: Partial<Record<BodyPartId, string>>;
}

export interface SeatPoseProfile {
  /** Stable parent set. action/variant/seatType remain for v8 migration compatibility. */
  poseSetId?: number;
  action?: PoseAction;
  variant?: string;
  seatType?: SeatType;
  direction: SeatDirection;
  width: number;
  height: number;
  horizontal: boolean;
  hip: { start: SeatOffset; end: SeatOffset };
  knee: { start: SeatOffset; end: SeatOffset };
  ankle: { start: SeatOffset; end: SeatOffset };
  torsoAngle: number;
  hipAngle: number;
  kneeAngle: number;
  bend: number;
  shinBend: number;
  hipSplitOffset: number;
  kneeSplitOffset: number;
  torsoCut: SeatOffset;
  thighCut: SeatOffset;
  shinCut: SeatOffset;
  torsoLean: number;
  segmentTransforms?: {
    torso: PoseSegmentTransform;
    thigh: PoseSegmentTransform;
    shin: PoseSegmentTransform;
  };
  drawLayers: Array<{ region: 1 | 2 | 3; visible: boolean }>;
  playerOffset: SeatOffset;
  benchOffset: SeatOffset;
  maskRanges: Record<1 | 2 | 3 | 4 | 5, string>;
  /** Optional articulated rig. Legacy torso/thigh/shin profiles remain valid. */
  anatomicalRig?: AnatomicalRig;
}

export function poseSetProfileKey(poseSetId: number, direction: SeatDirection): string {
  return `${poseSetId}:${direction}`;
}

export interface EquipmentAppearance {
  default?: number;
  left?: number;
  right?: number;
}

export interface VisualEquipmentAppearance {
  visualEquipmentId: number;
  equipmentAppearanceId: number;
  name: string;
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
 * Item-definition bits that still have a direct server/editor consumer.
 */
const VISUAL_MAPPED_BITS =
  (1 << 0) |   // FLAG_BLOCK_SOLID      ← notWalkable
  (1 << 1) |   // FLAG_BLOCK_PROJECTILE ← blockProjectile
  (1 << 2) |   // FLAG_BLOCK_PATHFIND   ← notPathable
  (1 << 3) |   // FLAG_HAS_HEIGHT       ← hasElevation
  (1 << 5) |   // FLAG_PICKUPABLE       ← pickupable
  (1 << 6) |   // FLAG_MOVEABLE         ← !notMoveable
  (1 << 7) |   // FLAG_STACKABLE        ← stackable
  (1 << 13) |  // FLAG_ALWAYSONTOP      ← groundBorder | onBottom | onTop
  (1 << 14) |  // FLAG_READABLE         ← writable | writableOnce
  (1 << 15) |  // FLAG_ROTATABLE        ← rotateable
  (1 << 16) |  // FLAG_HANGABLE         ← hangable
  (1 << 17) |  // FLAG_VERTICAL         ← hookSouth
  (1 << 18) |  // FLAG_HORIZONTAL       ← hookEast
  (1 << 23);   // FLAG_LOOKTHROUGH      ← translucent

export const RETIRED_ITEM_FLAG_MASK =
  (1 << 4) |
  (1 << 8) | (1 << 9) | (1 << 10) | (1 << 11) | (1 << 12) |
  (1 << 19) |
  (1 << 21) |
  (1 << 22) |
  (1 << 24) |
  (1 << 25) |
  (1 << 26);

/**
 * Compute the visual-mapped OTB bits from ThingFlags (only the mapped bits).
 */
function visualToOtbBits(f: ThingFlags): number {
  let bits = 0;
  if (f.notWalkable)      bits |= (1 << 0);
  if (f.blockProjectile)  bits |= (1 << 1);
  if (f.notPathable)      bits |= (1 << 2);
  if (f.hasElevation)     bits |= (1 << 3);
  if (f.pickupable)       bits |= (1 << 5);
  if (!f.notMoveable && !f.ground && !f.groundBorder) bits |= (1 << 6);
  if (f.stackable)        bits |= (1 << 7);
  if (f.groundBorder || f.onBottom || f.onTop) bits |= (1 << 13);
  if (f.writable || f.writableOnce) bits |= (1 << 14);
  if (f.rotateable)       bits |= (1 << 15);
  if (f.hangable)         bits |= (1 << 16);
  if (f.hookSouth)        bits |= (1 << 17);
  if (f.hookEast)         bits |= (1 << 18);
  if (f.translucent)      bits |= (1 << 23);
  return bits;
}

/**
 * Sync the server/editor item flags derived from visual flags.
 */
export function syncItemFlagsFromVisual(existingFlags: number, f: ThingFlags): number {
  return ((existingFlags & ~VISUAL_MAPPED_BITS & ~RETIRED_ITEM_FLAG_MASK) | visualToOtbBits(f)) >>> 0;
}

export function stripRetiredItemFlags(flags: number): number {
  return (flags & ~RETIRED_ITEM_FLAG_MASK) >>> 0;
}

/**
 * Derive OTB topOrder from visual ThingFlags.
 * groundBorder → 1, onBottom → 2, onTop → 3, else 0.
 * This matches the map editor's ITEM_ATTR_TOPORDER convention.
 */
export function deriveTopOrder(f: ThingFlags): number {
  if (f.groundBorder) return 1;
  if (f.onBottom) return 2;
  if (f.onTop) return 3;
  return 0;
}

/**
 * Derive the server group from visual ThingFlags.
 */
export function deriveGroup(f: ThingFlags): number {
  if (f.ground) return 1;                    // Ground
  if (f.container) return 2;                  // Container
  if (f.splash) return 11;                    // Splash
  if (f.fluidContainer) return 12;            // Fluid Container
  return 0;                                    // Normal
}

// ─── Equipment appearance mapping ────────────────────────────────────────────

/** UI view of one equipment appearance variant embedded in EOBJ. */
export interface EquipmentCatalogEntry {
  name: string;
  itemId: number;
  equipmentAppearanceId: number;
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

/** Server-side item properties (string-keyed, same as items.json "properties"). */
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
  /** Numeric item requirement, or the legacy boolean marker used by expertise gates. */
  expertise?: number | boolean;

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

  // Tool uses
  maxUses?: number;
  uses?: number;

  // Exclusive slots (for containers)
  exclusiveSlots?: ExclusiveSlotDef[];

  /** Catch-all for unknown properties from the JSON */
  [key: string]: string | number | boolean | ExclusiveSlotDef[] | undefined;
}

/** One exclusive-slot entry inside a container's properties. */
export interface ExclusiveSlotDef {
  slotIndex: number;
  allowedItemTypes: string[];
  allowedItemIds?: number[];
}

/** Full public item definition paired with its EOBJ appearance.
 *  - `itemId` = the stable public ID used by tools, server and client.
 *  - `appearanceId` = the internal EOBJ appearance reference.
 */
export interface ItemDefinition {
  itemId: number;
  appearanceId: number;
  flags: number;
  group: number;
  topOrder?: number;
  properties: ItemProperties | null;
}

export const ITEM_LOCALES = ['en', 'pt', 'es', 'pl'] as const;
export type ItemLocale = typeof ITEM_LOCALES[number];
export type ItemTranslationStatus = 'draft' | 'reviewed' | 'stale';

export interface ItemLocalizedText {
  name: string;
  article?: string;
  description?: string;
  /** Fingerprint of the English source used to create this translation. */
  sourceHash?: string;
  status?: ItemTranslationStatus;
}

export interface ItemCatalogFile {
  schemaVersion: 1;
  locale: ItemLocale;
  fallbackLocale: 'en';
  items: Record<string, ItemLocalizedText>;
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
  /** Zero-based appearance ID in the dedicated hair section. */
  appearanceId: number;
  /** Bitmask of allowed races (HairRace flags). */
  races: number;
  /** Bitmask of allowed genders (HairGender flags). */
  genders: number;
  /** Bitmask of allowed account tiers (HairTier flags). */
  tiers: number;
  /** Sort order for display (lower = first). */
  sortOrder: number;
}
