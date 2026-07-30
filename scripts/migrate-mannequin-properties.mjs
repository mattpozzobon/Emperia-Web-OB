import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultTarget = path.resolve(
  scriptDir,
  '..',
  '..',
  'Emperia-Assets',
  'current',
  'items.json',
);
const target = path.resolve(process.argv[2] ?? defaultTarget);
const items = JSON.parse(fs.readFileSync(target, 'utf8'));

const variants = [
  { id: 26579, direction: 2 },
  { id: 26580, direction: 1 },
];

for (const variant of variants) {
  const definition = items[String(variant.id)];
  const properties = definition?.properties;
  if (!properties || Number(properties['4']) !== 1) {
    throw new Error(`Item ${variant.id} is not a container definition.`);
  }
  if (!Array.isArray(properties['144']) || properties['144'].length === 0) {
    throw new Error(`Item ${variant.id} has no exclusive mannequin slots.`);
  }
  properties['293'] = true;
  properties['294'] = variant.direction;
}

fs.writeFileSync(target, `${JSON.stringify(items, null, 4)}\n`);

const packageRoot = path.dirname(target);
const manifestPath = path.join(packageRoot, 'asset-package.json');
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

console.log(
  `Marked mannequin variants ${variants.map(({ id }) => id).join(', ')} in ${target}`,
);
