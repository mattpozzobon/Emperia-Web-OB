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
  'windowClosed',
  'wall',
  'readable',
  'trapdoor',
  'taskboard',
  'windowOpen',
] as const;

export type ItemIdentity = Exclude<(typeof ITEM_IDENTITY_OPTIONS)[number], ''>;

export const ITEM_IDENTITY_GROUPS: readonly {
  label: string;
  options: readonly { value: ItemIdentity; label: string }[];
}[] = [
  {
    label: 'Containers & furniture',
    options: [
      { value: 'bed', label: 'Bed' },
      { value: 'container', label: 'Container' },
      { value: 'chest', label: 'Chest' },
      { value: 'depot', label: 'Depot' },
      { value: 'fluidContainer', label: 'Fluid Container' },
      { value: 'trashholder', label: 'Trash Holder' },
    ],
  },
  {
    label: 'Doors & traversal',
    options: [
      { value: 'doorClosed', label: 'Closed Door' },
      { value: 'doorOpen', label: 'Open Door' },
      { value: 'stair', label: 'Stair' },
      { value: 'trapdoor', label: 'Trapdoor' },
      { value: 'teleport', label: 'Teleport' },
    ],
  },
  {
    label: 'Interaction',
    options: [
      { value: 'key', label: 'Key' },
      { value: 'lever', label: 'Lever' },
      { value: 'mailbox', label: 'Mailbox' },
      { value: 'readable', label: 'Readable' },
      { value: 'taskboard', label: 'Task Board' },
    ],
  },
  {
    label: 'Structures',
    options: [
      { value: 'wall', label: 'Wall' },
      { value: 'windowClosed', label: 'Closed Window' },
      { value: 'windowOpen', label: 'Open Window' },
    ],
  },
  {
    label: 'Effects & remains',
    options: [
      { value: 'magicfield', label: 'Magic Field' },
      { value: 'rune', label: 'Rune' },
      { value: 'splash', label: 'Splash' },
      { value: 'corpse', label: 'Corpse' },
    ],
  },
] as const;

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
  'windowClosed',
  'lever',
  'chest',
  'doorClosed',
  'doorOpen',
  'wall',
  'stair',
  'trapdoor',
  'taskboard',
  'windowOpen',
];

function containsWord(name: string, word: string): boolean {
  return new RegExp(`(^|[^a-z0-9])${word}s?([^a-z0-9]|$)`, 'i').test(name);
}

function isNamedDoor(name: string): boolean {
  return containsWord(name, 'door')
    || name.includes('gate of expertise')
    || name.includes('magic gate');
}

function getNamedOpenState(name: string, noun: 'door' | 'window'): boolean | undefined {
  const nounPattern = noun === 'door' ? '(?:door|gate)' : 'window';
  if (
    new RegExp(`(?:open|opened)\\s+${nounPattern}|${nounPattern}\\s+(?:open|opened)`, 'i').test(name)
  ) {
    return true;
  }
  if (
    new RegExp(`(?:closed|shut)\\s+${nounPattern}|${nounPattern}\\s+(?:closed|shut)`, 'i').test(name)
  ) {
    return false;
  }
  return undefined;
}

/**
 * Infers identities that do not have a dedicated visual flag.
 * Door and window state prefer an explicit state in the item name, then fall
 * back to their authoritative collision flag.
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
    const namedOpen = getNamedOpenState(normalizedName, 'door');
    if (namedOpen !== undefined) return namedOpen ? 'doorOpen' : 'doorClosed';
    if (!flags) return undefined;
    return flags.notWalkable ? 'doorClosed' : 'doorOpen';
  }
  if (containsWord(normalizedName, 'window')) {
    const namedOpen = getNamedOpenState(normalizedName, 'window');
    if (namedOpen !== undefined) return namedOpen ? 'windowOpen' : 'windowClosed';
    if (!flags) return undefined;
    return flags.blockProjectile ? 'windowClosed' : 'windowOpen';
  }
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
    case 'windowClosed':
      next.container = false;
      next.fluidContainer = false;
      next.splash = false;
      next.notMoveable = true;
      next.blockProjectile = true;
      break;
    case 'windowOpen':
      next.container = false;
      next.fluidContainer = false;
      next.splash = false;
      next.notMoveable = true;
      next.blockProjectile = false;
      break;
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
 * Explicit numeric identities are preserved. Generic numeric doors are
 * resolved to their open/closed state from names and flags.
 */
export function consolidateItemIdentity(
  properties: ItemProperties | null | undefined,
  flags: ThingFlags | undefined,
): ItemProperties | null {
  const next: ItemProperties = properties ? { ...properties } : {};
  const numericType = typeof next['4'] === 'number'
    ? ITEM_IDENTITY_BY_THING_TYPE_ID[next['4']]
    : undefined;
  const current = numericType;
  const name = typeof next['1'] === 'string' ? next['1'] : undefined;
  const inferred = inferNamedItemIdentity(name, flags);
  const readable = next['150'] === true
    || next['151'] === true;
  const hasAuthoritativeNumericDoorState = numericType === 'doorClosed'
    || numericType === 'doorOpen';
  const hasDoorIdentity = current === 'door'
    || current === 'doorClosed'
    || current === 'doorOpen'
    || inferred === 'doorClosed'
    || inferred === 'doorOpen'
    || next['41'] === true;
  const inferredDoorState = hasDoorIdentity && !hasAuthoritativeNumericDoorState
    ? (
      inferred === 'doorClosed' || inferred === 'doorOpen'
        ? inferred
        : flags
          ? (flags.notWalkable ? 'doorClosed' : 'doorOpen')
          : undefined
    )
    : undefined;
  const hasWindowIdentity = current === 'windowClosed'
    || current === 'windowOpen'
    || inferred === 'windowClosed'
    || inferred === 'windowOpen';
  const inferredWindowState = hasWindowIdentity
    ? (
      inferred === 'windowClosed' || inferred === 'windowOpen'
        ? inferred
        : flags
          ? (flags.blockProjectile ? 'windowClosed' : 'windowOpen')
          : undefined
    )
    : undefined;

  let resolved = current && current !== 'door' ? current : undefined;
  if (flags?.fluidContainer) {
    resolved = 'fluidContainer';
  } else if (flags?.splash) {
    resolved = 'splash';
  } else if (readable && (!current || current === 'readable')) {
    resolved = 'readable';
  } else if (inferredDoorState) {
    resolved = inferredDoorState;
  } else if (inferredWindowState) {
    resolved = inferredWindowState;
  } else if (
    flags?.container
    && inferred === 'chest'
    && (!current || current === 'container' || current === 'chest')
  ) {
    resolved = 'chest';
  } else if (flags?.container && (!current || current === 'container')) {
    resolved = 'container';
  } else if (!current) {
    resolved = inferred;
  }

  delete next.type;
  if (resolved) {
    const typeCode = ITEM_IDENTITY_BY_THING_TYPE_ID.indexOf(resolved);
    if (typeCode >= 0) next['4'] = typeCode;
  }
  return Object.keys(next).length > 0 ? next : null;
}
