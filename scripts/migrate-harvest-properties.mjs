import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const target = path.resolve(process.argv[2] ?? '../Emperia-Assets/current/items.json');
const items = JSON.parse(fs.readFileSync(target, 'utf8'));

const A = Object.freeze({
  harvestType: '270',
  result: '271',
  min: '272',
  max: '273',
  tier: '274',
  requiredLevel: '275',
  toolType: '276',
  requiredToolTier: '277',
  toolCost: '278',
  baseChance: '279',
  perLevel: '280',
  maxChance: '281',
  attemptXp: '282',
  successXp: '283',
  bonusYieldPerLevel: '284',
  bonusYieldMax: '285',
  size: '286',
  mode: '287',
  transform: '288',
  respawn: '289',
  toolTier: '290',
  marketable: '291',
  autoLootable: '292',
});

const ITEM_TYPE = Object.freeze({
  rope: 1,
  shovel: 2,
  pick: 3,
  knife: 4,
  fishingRod: 5,
  potion: 6,
  machete: 7,
});

// Repair packages produced during the short-lived experiment which encoded
// gameplay item categories with protocol slot codes. Restrict the repair by
// item name so legitimate equipment categories using these numbers are kept.
const EXPERIMENTAL_ITEM_TYPE = new Map([
  [15, { type: ITEM_TYPE.rope, pattern: /rope/i }],
  [16, { type: ITEM_TYPE.shovel, pattern: /shovel/i }],
  [17, { type: ITEM_TYPE.pick, pattern: /pick/i }],
  [18, { type: ITEM_TYPE.knife, pattern: /knife/i }],
  [19, { type: ITEM_TYPE.machete, pattern: /machete/i }],
  [20, { type: ITEM_TYPE.fishingRod, pattern: /fishing rod/i }],
  [21, { type: ITEM_TYPE.potion, pattern: /potion|dead dragon hatchling/i }],
]);

function properties(itemId) {
  const item = items[String(itemId)];
  if (!item) throw new Error(`Missing item ${itemId}`);
  return (item.properties ??= {});
}

for (const item of Object.values(items)) {
  const itemType = item.properties?.['14'];
  const repair = EXPERIMENTAL_ITEM_TYPE.get(itemType);
  const name = item.properties?.['1'];
  if (repair && typeof name === 'string' && repair.pattern.test(name)) {
    item.properties['14'] = repair.type;
  }
}

function set(itemId, values) {
  Object.assign(properties(itemId), values);
}

// Explicit availability defaults: only portable, pickupable objects.
for (const item of Object.values(items)) {
  const flags = Number(item.flags ?? 0);
  const portable = (flags & (1 << 5)) !== 0 && (flags & (1 << 6)) !== 0;
  const props = (item.properties ??= {});
  const isCorpse = props['4'] === 2;
  if (isCorpse) {
    delete props[A.marketable];
    delete props[A.autoLootable];
  } else if (portable) {
    props[A.marketable] ??= 1;
    props[A.autoLootable] ??= 1;
  }
}

const picks = new Map([
  [2553, 0], [26583, 0], [26585, 1], [26582, 2], [26587, 3],
  [26584, 4], [26586, 5], [26588, 6], [26589, 7],
]);
for (const [itemId, tier] of picks) set(itemId, { [A.toolTier]: tier });

const ores = [
  { tier: 1, result: 26643, base: 3500, per: 190, attempt: 15, success: 24, groups: [[26654,26690,26693],[26660,26691,26694],[26666,26692,26695]] },
  { tier: 2, result: 26645, base: 3000, per: 160, attempt: 20, success: 36, groups: [[26655,26696,26699],[26661,26697,26700],[26667,26698,26701]] },
  { tier: 3, result: 26642, base: 2500, per: 140, attempt: 30, success: 60, groups: [[26656,26702,26705],[26662,26703,26706],[26668,26704,26707]] },
  { tier: 4, result: 26646, base: 2000, per: 120, attempt: 45, success: 90, groups: [[26657,26726,26729],[26663,26727,26730],[26669,26728,26731]] },
  { tier: 5, result: 26647, base: 1500, per: 100, attempt: 65, success: 135, groups: [[26658,26708,26711],[26664,26709,26712],[26670,26710,26713]] },
  { tier: 6, result: 26648, base: 1200, per: 90, attempt: 95, success: 180, groups: [[26659,26714,26717],[26665,26715,26718],[26671,26716,26719]] },
  { tier: 7, result: 26649, base: 1000, per: 80, attempt: 120, success: 240, groups: [[26651,26720,26723],[26652,26721,26724],[26653,26722,26725]] },
];
const sizes = [10000, 15000, 20000];
for (const ore of ores) {
  ore.groups.forEach((ids, sizeIndex) => ids.forEach((itemId) => set(itemId, {
    [A.harvestType]: 1,
    [A.result]: ore.result,
    [A.tier]: ore.tier,
    [A.toolType]: ITEM_TYPE.pick,
    [A.requiredToolTier]: 0,
    [A.toolCost]: Math.max(1, ore.tier),
    [A.baseChance]: ore.base,
    [A.perLevel]: ore.per,
    [A.maxChance]: 8500,
    [A.attemptXp]: ore.attempt,
    [A.successXp]: ore.success,
    [A.bonusYieldPerLevel]: 100,
    [A.bonusYieldMax]: 5000,
    [A.size]: sizes[sizeIndex],
    [A.mode]: 1,
  })));
}

set(2813, {
  [A.harvestType]: 3, [A.result]: 26557, [A.min]: 1, [A.max]: 1,
  [A.toolType]: ITEM_TYPE.knife, [A.toolCost]: 1, [A.baseChance]: 1500, [A.perLevel]: 100,
  [A.maxChance]: 8500, [A.attemptXp]: 5, [A.successXp]: 15,
  [A.size]: 10000, [A.mode]: 3,
});
set(2763, {
  [A.harvestType]: 2, [A.result]: 2747, [A.min]: 1, [A.max]: 1,
  [A.toolType]: ITEM_TYPE.knife, [A.toolCost]: 1, [A.baseChance]: 2000, [A.perLevel]: 100,
  [A.maxChance]: 8500, [A.attemptXp]: 4, [A.successXp]: 12,
  [A.size]: 10000, [A.mode]: 1,
});

// Fishing currently accepts water tiles and always yields one fish.
for (const [itemId, item] of Object.entries(items)) {
  const name = item.properties?.['1'];
  if (item.group !== 1 || (name !== 'water' && name !== 'shallow water')) continue;
  set(Number(itemId), {
    [A.harvestType]: 4, [A.result]: 2667, [A.min]: 1, [A.max]: 1,
    [A.toolType]: ITEM_TYPE.fishingRod, [A.toolCost]: 1, [A.baseChance]: 10000,
    [A.maxChance]: 10000, [A.size]: 10000, [A.mode]: 0,
  });
}

// Existing pickupable torches were classified as ammo. Give them their own slot.
for (const item of Object.values(items)) {
  const name = item.properties?.['1'];
  if (item.properties?.['11'] === 13 && typeof name === 'string' && name.toLowerCase().includes('torch')) {
    item.properties['11'] = 15;
  }
}

fs.writeFileSync(target, `${JSON.stringify(items, null, 2)}\n`);

for (const locale of ['en', 'pt', 'es', 'pl']) {
  const catalogPath = path.join(path.dirname(target), `item-catalog.${locale}.json`);
  if (!fs.existsSync(catalogPath)) continue;
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  for (const [itemId, entry] of Object.entries(catalog.items ?? {})) {
    const props = items[itemId]?.properties;
    if (!props) continue;
    if (props[A.marketable] === 1) entry.marketable = true;
    else delete entry.marketable;
    if (props[A.autoLootable] === 1) entry.autoLootable = true;
    else delete entry.autoLootable;
  }
  fs.writeFileSync(catalogPath, `${JSON.stringify(catalog)}\n`);
}

const packageRoot = path.dirname(target);
const manifestPath = path.join(packageRoot, 'asset-package.json');
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  for (const name of Object.keys(manifest.files ?? {})) {
    const filename = path.join(packageRoot, name);
    if (!fs.existsSync(filename)) {
      throw new Error(`Asset package manifest references missing file ${filename}`);
    }
    const bytes = fs.readFileSync(filename);
    manifest.files[name] = {
      sha256: createHash('sha256').update(bytes).digest('hex'),
      size: bytes.byteLength,
    };
  }
  const identity = Object.entries(manifest.files)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, file]) => `${name}:${file.sha256}:${file.size}`)
    .join('\n');
  manifest.packageId = createHash('sha256').update(identity).digest('hex');
  manifest.generatedAt = new Date().toISOString();
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}
console.log(`Migrated canonical harvest, availability, and slot properties in ${target}`);
