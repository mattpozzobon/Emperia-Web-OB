import type { ItemProperties, ThingFlags } from './types';

export const ITEM_IDENTITY_OPTIONS = [
  '',
  'bed',
  'container',
  'corpse',
  'depot',
  'doorClosed',
  'doorOpen',
  'fluidContainer',
  'key',
  'magicfield',
  'mailbox',
  'rune',
  'splash',
  'stair',
  'teleport',
  'trashholder',
  'lever',
  'chest',
  'window',
  'wall',
  'readable',
  'trapdoor',
  'taskboard',
] as const;

export type ItemIdentity = Exclude<(typeof ITEM_IDENTITY_OPTIONS)[number], ''>;

// Numerically aligned with the server's ThingTypeId enum. The generic Door
// value is resolved from the visual collision flags below.
const ITEM_IDENTITY_BY_THING_TYPE_ID: readonly (ItemIdentity | 'door' | undefined)[] = [
  'bed',
  'container',
  'corpse',
  'depot',
  'door',
  'fluidContainer',
  'key',
  'magicfield',
  'mailbox',
  'readable',
  'rune',
  'splash',
  'teleport',
  'trashholder',
  'window',
  'lever',
  'chest',
  'doorClosed',
  'doorOpen',
  'wall',
  'stair',
  'trapdoor',
  'taskboard',
];

function containsWord(name: string, word: string): boolean {
  return new RegExp(`(^|[^a-z0-9])${word}s?([^a-z0-9]|$)`, 'i').test(name);
}

function isNamedDoor(name: string): boolean {
  return containsWord(name, 'door')
    || name.includes('gate of expertise')
    || name.includes('magic gate');
}

/**
 * Infers identities that do not have a dedicated visual flag.
 * Door state is derived from collision: a non-walkable door is closed.
 */
export function inferNamedItemIdentity(
  name: string | undefined,
  flags: ThingFlags | undefined,
): ItemIdentity | undefined {
  const normalizedName = name?.trim().toLowerCase();
  if (!normalizedName) return undefined;

  if (containsWord(normalizedName, 'lever')) return 'lever';
  if (containsWord(normalizedName, 'chest')) return 'chest';
  if (isNamedDoor(normalizedName)) {
    if (!flags) return undefined;
    return flags.notWalkable ? 'doorClosed' : 'doorOpen';
  }
  if (containsWord(normalizedName, 'window')) return 'window';
  if (containsWord(normalizedName, 'wall')) return 'wall';
  if (
    containsWord(normalizedName, 'stair')
    || containsWord(normalizedName, 'staircase')
    || containsWord(normalizedName, 'stairway')
    || containsWord(normalizedName, 'ladder')
  ) return 'stair';
  if (
    containsWord(normalizedName, 'trapdoor')
    || normalizedName === 'sewer grate'
  ) return 'trapdoor';
  if (normalizedName === 'task board' || normalizedName === 'taskboard') {
    return 'taskboard';
  }

  return undefined;
}

/**
 * Applies visual flags that are intrinsic to a selected identity.
 * Other flags remain editable and are not reset unless they conflict with the
 * selected identity.
 */
export function inferVisualFlagsFromIdentity(
  identity: string | undefined,
  flags: ThingFlags,
): ThingFlags {
  const next = { ...flags };

  switch (identity) {
    case 'container':
    case 'chest':
      next.container = true;
      next.fluidContainer = false;
      next.splash = false;
      break;
    case 'fluidContainer':
      next.container = false;
      next.fluidContainer = true;
      next.splash = false;
      break;
    case 'splash':
      next.container = false;
      next.fluidContainer = false;
      next.splash = true;
      break;
    case 'wall':
      next.container = false;
      next.fluidContainer = false;
      next.splash = false;
      next.notWalkable = true;
      next.notMoveable = true;
      next.blockProjectile = true;
      next.notPathable = true;
      break;
    case 'doorClosed':
      next.container = false;
      next.fluidContainer = false;
      next.splash = false;
      next.notWalkable = true;
      next.notMoveable = true;
      next.blockProjectile = true;
      next.notPathable = true;
      break;
    case 'doorOpen':
      next.container = false;
      next.fluidContainer = false;
      next.splash = false;
      next.notWalkable = false;
      next.notMoveable = true;
      next.blockProjectile = false;
      next.notPathable = false;
      break;
    case 'window':
    case 'lever':
    case 'stair':
    case 'trapdoor':
    case 'taskboard':
      next.container = false;
      next.fluidContainer = false;
      next.splash = false;
      next.notMoveable = true;
      break;
  }

  return next;
}

/**
 * Produces one canonical identity without requiring users to repeat visual
 * classification in Server Properties.
 *
 * Explicit specialized identities are preserved. Legacy `door` values are
 * promoted to `doorClosed`/`doorOpen` as soon as visual flags are available.
 */
export function consolidateItemIdentity(
  properties: ItemProperties | null | undefined,
  flags: ThingFlags | undefined,
): ItemProperties | null {
  const next: ItemProperties = properties ? { ...properties } : {};
  const numericType = typeof next['4'] === 'number'
    ? ITEM_IDENTITY_BY_THING_TYPE_ID[next['4']]
    : undefined;
  const current = numericType
    ?? (typeof next.type === 'string' ? next.type : undefined);
  const legacyName = typeof next['1'] === 'string' ? next['1'] : undefined;
  const inferred = inferNamedItemIdentity(next.name ?? legacyName, flags);
  const readable = next.readable === true
    || next.writeable === true
    || next['150'] === true
    || next['151'] === true;
  const hasAuthoritativeNumericDoorState = numericType === 'doorClosed'
    || numericType === 'doorOpen';
  const hasDoorIdentity = current === 'door'
    || current === 'doorClosed'
    || current === 'doorOpen'
    || inferred === 'doorClosed'
    || inferred === 'doorOpen'
    || next.expertise === true;
  const inferredDoorState = flags && hasDoorIdentity && !hasAuthoritativeNumericDoorState
    ? (flags.notWalkable ? 'doorClosed' : 'doorOpen')
    : undefined;

  if (current && current !== 'door') {
    next.type = current;
  }

  if (flags?.fluidContainer) {
    next.type = 'fluidContainer';
  } else if (flags?.splash) {
    next.type = 'splash';
  } else if (readable && (!current || current === 'readable')) {
    next.type = 'readable';
  } else if (inferredDoorState) {
    next.type = inferredDoorState;
  } else if (
    flags?.container
    && inferred === 'chest'
    && (!current || current === 'container' || current === 'chest')
  ) {
    next.type = 'chest';
  } else if (flags?.container && (!current || current === 'container')) {
    next.type = 'container';
  } else if (!current) {
    if (inferred) next.type = inferred;
  }

  return Object.keys(next).length > 0 ? next : null;
}
