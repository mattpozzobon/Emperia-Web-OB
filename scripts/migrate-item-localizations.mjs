import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const assetRoot = resolve(process.argv[2] || 'C:/Dev/Emperia-Assets/current');
const legacyRoot = resolve(process.argv[3] || 'C:/Dev/Emperia-Server/data/items');
const locales = ['en', 'pt', 'es', 'pl'];

function readJson(filename) {
  return JSON.parse(readFileSync(filename, 'utf8'));
}

function readLegacyJson(filename) {
  try {
    return readJson(join(legacyRoot, filename));
  } catch {
    return JSON.parse(execFileSync(
      'git',
      ['show', `HEAD:data/items/${filename}`],
      { cwd: resolve(legacyRoot, '..', '..'), encoding: 'utf8' },
    ));
  }
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

const definitions = readJson(join(assetRoot, 'items.json'));
const catalogs = Object.fromEntries(locales.map((locale) => [locale, {
  schemaVersion: 1,
  locale,
  fallbackLocale: 'en',
  items: {},
}]));

for (const [itemId, definition] of Object.entries(definitions)) {
  const properties = definition?.properties;
  const name = typeof properties?.name === 'string' ? properties.name.trim() : '';
  if (!name) continue;
  catalogs.en.items[itemId] = {
    name,
    ...(typeof properties.article === 'string' && properties.article.trim()
      ? { article: properties.article.trim() }
      : {}),
    ...(typeof properties.description === 'string' && properties.description.trim()
      ? { description: properties.description.trim() }
      : {}),
  };
}

const previousEnglishDescriptions = readLegacyJson('descriptions-en.json');
for (const locale of locales.filter((locale) => locale !== 'en')) {
  const names = readLegacyJson(`names-${locale}.json`);
  const descriptions = readLegacyJson(`descriptions-${locale}.json`);
  for (const [itemId, source] of Object.entries(catalogs.en.items)) {
    const name = typeof names[itemId] === 'string' ? names[itemId].trim() : '';
    if (!name) continue;
    const description = typeof descriptions[itemId] === 'string'
      ? descriptions[itemId].trim()
      : '';
    const previousSource = {
      ...source,
      ...(typeof previousEnglishDescriptions[itemId] === 'string'
        ? { description: previousEnglishDescriptions[itemId].trim() }
        : {}),
    };
    const missingDescription = Boolean(source.description) && !description;
    const sourceChanged = sourceHash(previousSource) !== sourceHash(source);
    catalogs[locale].items[itemId] = {
      name,
      ...(description ? { description } : {}),
      sourceHash: sourceHash(sourceChanged ? previousSource : source),
      status: missingDescription || sourceChanged ? 'stale' : 'reviewed',
    };
  }
}

for (const locale of locales) {
  const filename = join(assetRoot, `item-catalog.${locale}.json`);
  writeFileSync(filename, `${JSON.stringify(catalogs[locale])}\n`);
  console.log(`${filename}: ${Object.keys(catalogs[locale].items).length} items`);
}

const manifestFilename = join(assetRoot, 'asset-package.json');
const manifest = readJson(manifestFilename);
for (const locale of locales) {
  const name = `item-catalog.${locale}.json`;
  const bytes = readFileSync(join(assetRoot, name));
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
writeFileSync(manifestFilename, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`${manifestFilename}: package ${manifest.packageId.slice(0, 12)}`);
