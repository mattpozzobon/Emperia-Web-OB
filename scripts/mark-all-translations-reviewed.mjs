import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';

const assetRoot = resolve(process.argv[2] || 'C:/Dev/Emperia-Assets/current');
const locales = ['pt', 'es', 'pl'];

function readJson(filename) {
  return JSON.parse(readFileSync(filename, 'utf8'));
}

function sourceHash(text) {
  const input = `${text.name}\u001f${text.article ?? ''}\u001f${text.description ?? ''}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

const english = readJson(join(assetRoot, 'item-catalog.en.json'));
const manifestFilename = join(assetRoot, 'asset-package.json');
const manifest = readJson(manifestFilename);
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = join(assetRoot, 'backup', `before-mark-reviewed-${stamp}`);
mkdirSync(backupRoot, { recursive: true });
copyFileSync(manifestFilename, join(backupRoot, 'asset-package.json'));

const counts = {};
for (const locale of locales) {
  const name = `item-catalog.${locale}.json`;
  const filename = join(assetRoot, name);
  copyFileSync(filename, join(backupRoot, name));
  const catalog = readJson(filename);
  let changed = 0;

  for (const [itemId, source] of Object.entries(english.items)) {
    const entry = catalog.items[itemId];
    if (!entry?.name) continue;
    const nextHash = sourceHash(source);
    if (entry.status !== 'reviewed' || entry.sourceHash !== nextHash) changed += 1;
    entry.status = 'reviewed';
    entry.sourceHash = nextHash;
  }

  writeFileSync(filename, `${JSON.stringify(catalog)}\n`);
  const bytes = readFileSync(filename);
  manifest.files[name] = {
    sha256: createHash('sha256').update(bytes).digest('hex'),
    size: bytes.byteLength,
  };
  counts[locale] = changed;
}

const identity = Object.entries(manifest.files)
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([name, file]) => `${name}:${file.sha256}:${file.size}`)
  .join('\n');
manifest.packageId = createHash('sha256').update(identity).digest('hex');
manifest.generatedAt = new Date().toISOString();
writeFileSync(manifestFilename, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(JSON.stringify({
  backupRoot,
  packageId: manifest.packageId,
  changed: counts,
}, null, 2));
