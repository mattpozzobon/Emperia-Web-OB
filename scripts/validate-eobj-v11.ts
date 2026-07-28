import {
  consolidateItemIdentity,
  inferNamedItemIdentity,
  ITEM_IDENTITY_OPTIONS,
  type ItemIdentity,
} from '../src/lib/item-identity';
import { compileObjectData } from '../src/lib/object-writer';
import { parseObjectData } from '../src/lib/object-parser';
import type { FrameGroup, ObjectData, ThingFlags } from '../src/lib/types';

const identities = ITEM_IDENTITY_OPTIONS.filter(
  (identity): identity is ItemIdentity => identity !== '',
);

const flags: ThingFlags = {
  ground: false,
  groundBorder: false,
  onBottom: false,
  onTop: false,
  container: false,
  stackable: false,
  forceUse: false,
  multiUse: false,
  writable: false,
  writableOnce: false,
  fluidContainer: false,
  splash: false,
  notWalkable: false,
  notMoveable: false,
  blockProjectile: false,
  notPathable: false,
  pickupable: false,
  hangable: false,
  hookSouth: false,
  hookEast: false,
  rotateable: false,
  hasLight: false,
  translucent: false,
  hasDisplacement: false,
  hasElevation: false,
  animateAlways: false,
  hasMinimapColor: false,
  renderBelowCreatures: false,
};

const frameGroup: FrameGroup = {
  type: 0,
  width: 1,
  height: 1,
  layers: 1,
  patternX: 1,
  patternY: 1,
  patternZ: 1,
  animationLength: 1,
  asynchronous: 0,
  nLoop: 0,
  start: 0,
  animationLengths: [{ min: 100, max: 100 }],
  sprites: [0],
};

const itemCount = 99 + identities.length;
const itemAppearances = new Map<number, number>();
const itemIdentities = new Map<number, string>();
const things: ObjectData['things'] = new Map();

identities.forEach((identity, index) => {
  const itemId = 1000 + index;
  const appearanceId = 100 + index;
  itemAppearances.set(itemId, appearanceId);
  itemIdentities.set(itemId, identity);
  things.set(appearanceId, {
    id: appearanceId,
    category: 'item',
    flags: { ...flags },
    frameGroups: [{ ...frameGroup, animationLengths: [{ min: 100, max: 100 }], sprites: [0] }],
  });
});

const source: ObjectData = {
  formatVersion: 11,
  version: 1098,
  itemCount,
  outfitCount: 0,
  equipmentCount: 0,
  hairCount: 0,
  effectCount: 0,
  distanceCount: 0,
  itemAppearances,
  outfitAppearances: new Map(),
  itemSlotTypes: new Map(),
  itemIdentities,
  itemSeatDefinitions: new Map(),
  poseSets: new Map(),
  seatPoseProfiles: new Map(),
  equipmentAppearances: new Map(),
  visualEquipmentAppearances: new Map(),
  hairDefinitions: new Map(),
  things,
  originalBuffer: new ArrayBuffer(0),
};

const parsed = parseObjectData(compileObjectData(source));
if (parsed.formatVersion !== 11) throw new Error(`Expected EOBJ v11, got v${parsed.formatVersion}`);
for (const [itemId, identity] of itemIdentities) {
  if (parsed.itemIdentities.get(itemId) !== identity) {
    throw new Error(`Identity round-trip failed for item ${itemId}: ${identity}`);
  }
}
if (inferNamedItemIdentity('wooden ladder', flags) !== 'stair') {
  throw new Error('Ladder names must infer the stair identity');
}
const closedGateFlags = { ...flags, notWalkable: true };
if (inferNamedItemIdentity('magic gate', closedGateFlags) !== 'doorClosed') {
  throw new Error('Closed magic gates must infer the doorClosed identity');
}
if (inferNamedItemIdentity('magic gate', flags) !== 'doorOpen') {
  throw new Error('Open magic gates must infer the doorOpen identity');
}
if (consolidateItemIdentity(
  { name: 'gate of expertise', type: 'door', expertise: true },
  closedGateFlags,
)?.type !== 'doorClosed') {
  throw new Error('Legacy gates of expertise must migrate to doorClosed');
}
if (consolidateItemIdentity(
  { name: 'gate of expertise', type: 'door', expertise: true },
  flags,
)?.type !== 'doorOpen') {
  throw new Error('Legacy gates of expertise must migrate to doorOpen');
}
if (consolidateItemIdentity(
  { name: 'sign', readable: true },
  { ...flags, notMoveable: true },
)?.type !== 'readable') {
  throw new Error('Readable server properties must migrate to the readable identity');
}
if (consolidateItemIdentity(
  { '150': true },
  { ...flags, notMoveable: true },
)?.type !== 'readable') {
  throw new Error('Numeric ItemAttr.Readable must migrate to the readable identity');
}
if (consolidateItemIdentity(
  { '151': true },
  flags,
)?.type !== 'readable') {
  throw new Error('Numeric ItemAttr.Writeable must also be readable');
}
const enumIdentityCases = [
  [15, 'lever'],
  [16, 'chest'],
  [17, 'doorClosed'],
  [18, 'doorOpen'],
  [20, 'stair'],
  [21, 'trapdoor'],
  [22, 'taskboard'],
] as const;
for (const [thingTypeId, expected] of enumIdentityCases) {
  if (consolidateItemIdentity({ '4': thingTypeId }, flags)?.type !== expected) {
    throw new Error(`ThingTypeId ${thingTypeId} must project to ${expected}`);
  }
}
if (consolidateItemIdentity(
  { '1': 'closed door', '4': 4 },
  closedGateFlags,
)?.type !== 'doorClosed') {
  throw new Error('Generic numeric door types must resolve their visual state');
}
if (inferNamedItemIdentity('open trapdoor', flags) !== 'trapdoor') {
  throw new Error('Trapdoor names must infer the trapdoor identity');
}
if (inferNamedItemIdentity('sewer grate', flags) !== 'trapdoor') {
  throw new Error('The exact sewer grate name must infer the trapdoor identity');
}
if (inferNamedItemIdentity('jammed sewer grate', flags) === 'trapdoor') {
  throw new Error('Jammed sewer grates must not infer the trapdoor identity');
}
if (inferNamedItemIdentity('task board', flags) !== 'taskboard') {
  throw new Error('The exact task board name must infer the taskboard identity');
}
if (inferNamedItemIdentity('taskboard', flags) !== 'taskboard') {
  throw new Error('The compact taskboard name must infer the taskboard identity');
}
if (inferNamedItemIdentity('arena leaderboard', flags) === 'taskboard') {
  throw new Error('Unrelated leaderboards must not infer the taskboard identity');
}

console.log(`Validated EOBJ v11 round-trip for ${identities.length} item identities.`);
