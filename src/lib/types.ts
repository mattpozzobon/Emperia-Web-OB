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
