import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';

const assetRoot = resolve(process.argv[2] || 'C:/Dev/Emperia-Assets/current');
const cacheFile = resolve('.translation-audit-cache.json');
const locales = ['pt', 'es', 'pl'];

function readJson(filename) {
  return JSON.parse(readFileSync(filename, 'utf8'));
}

function normalizedTokens(value) {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase()
    .match(/[a-z]+/g) ?? [];
}

function hasBrokenMachineArtifacts(value) {
  return /\b(?:the|of|and|with|for|from|to|in|some)\b/i.test(value)
    || /\((?:um|uma)\)/i.test(value)
    || /\b\w+\([ao]\)\b/i.test(value);
}

// Google must not reinterpret these Tibia/Emperia names as ordinary English.
const protectedGameTerms = new Set([
  'abyssador',
  'behemoth',
  'bonelord',
  'deepling',
  'dinky',
  'daramian',
  'draken',
  'earthheart',
  'execowtioner',
  'fireheart',
  'glooth',
  'gnomevil',
  'griffinclaw',
  'marid',
  'opticording',
  'quara',
  'rotworm',
  'sparkion',
  'thunderheart',
  'umbral',
  'yalaharian',
  'zaoan',
]);

// Google lacks item context for a few short names. These are deliberately curated.
const portugueseNameOverrides = new Map([
  ['stacke', 'pilha'],
  ['swich', 'interruptor'],
  ['open trapdoor', 'alçapão aberto'],
  ['draw well', 'poço com manivela'],
  ['stone coal basin', 'bacia de pedra com carvão'],
  ['might ring', 'anel do poder'],
  ['life ring', 'anel da vida'],
  ['club ring', 'anel de clava'],
  ['dwarven ring', 'anel anão'],
  ['small fir tree', 'pequeno abeto'],
  ['blueberry bush', 'arbusto de mirtilo'],
  ['iron ore', 'minério de ferro'],
  ['charcoal vein', 'veio de carvão'],
  ['anniversary remains', 'restos de aniversário'],
  ['behemoth trophy', 'troféu de behemoth'],
  ['dead behemoth', 'behemoth morto'],
  ['frozen behemoth', 'behemoth congelado'],
  ['perfect behemoth fang', 'presa perfeita de behemoth'],
  ['behemoth claw', 'garra de behemoth'],
  ['behemoth taming stone', 'pedra de domesticação de behemoth'],
  ['the holy Tible', 'o Tible sagrado'],
  ["Waldo's post horn", 'corneta postal de Waldo'],
  ["Brutus Bloodbeard's hat", 'chapéu de Brutus Bloodbeard'],
  ["the Brutus Bloodbeard's hat", 'o chapéu de Brutus Bloodbeard'],
  ["the Lethal Lissy's shirt", 'a camisa de Lethal Lissy'],
  ["Ron the Ripper's sabre", 'sabre de Ron the Ripper'],
  ["the Ron the Ripper's sabre", 'o sabre de Ron the Ripper'],
  ["Deadeye Devious' eye patch", 'tapa-olho de Deadeye Devious'],
  ["Striker's favourite pillow", 'travesseiro favorito de Striker'],
  ["the Imperor's trident", 'o tridente do Imperor'],
  ["Countess Sorrow's frozen tear", 'lágrima congelada de Countess Sorrow'],
  ["Julius' map", 'mapa de Julius'],
  ["Eclesius' sandals", 'sandálias de Eclesius'],
  ["claw of 'The Noxious Spawn'", "garra de 'The Noxious Spawn'"],
  ['dead Doctor Perhaps', 'Doctor Perhaps morto'],
  ['dead Dirtbeard', 'Dirtbeard morto'],
  ['dead Evil Mastermind', 'Evil Mastermind morto'],
  ['dead Monstor', 'Monstor morto'],
  ['egg of The Many', 'ovo de The Many'],
  ['the remains of the Keeper', 'os restos mortais do Keeper'],
  ['the tail of the Keeper', 'a cauda do Keeper'],
  ["Tanjis's treasure chest", 'baú do tesouro de Tanjis'],
  ['doll of Durin The Almighty', 'boneco de Durin The Almighty'],
  ['the legs of Deathstrike', 'as pernas de Deathstrike'],
  ['Old Nasty', 'Old Nasty'],
  ['Store coin', 'moeda da loja'],
  ['Opticorder analyser', 'analisador de Opticorder'],
]);

const articleOverrides = {
  pt: new Map([
    ['open trapdoor', 'um'],
    ["orc's jaw shredder", 'um'],
    ['ornate legs', 'umas'],
    ['anniversary remains', 'uns'],
  ]),
  es: new Map([
    ["orc's jaw shredder", 'un'],
    ['ornate legs', 'unas'],
    ['anniversary remains', 'unos'],
  ]),
};

function shouldReplacePortugueseName(source, current, reference) {
  const sourceTokens = normalizedTokens(source);
  if (sourceTokens.length < 2) return false;
  if (sourceTokens.some((token) => protectedGameTerms.has(token))) return false;
  // Proper names and named lore objects need human context, not literal NMT.
  if (/\p{Lu}/u.test(source)) return false;

  const currentTokens = new Set(normalizedTokens(current));
  const referenceTokens = new Set(normalizedTokens(reference));
  const untranslated = sourceTokens.filter(
    (token) => currentTokens.has(token) && !referenceTokens.has(token),
  );
  return untranslated.length > 0
    || hasBrokenMachineArtifacts(current)
    || current !== reference;
}

function replaceField(entry, field, value, counters) {
  if (!entry || !value || entry[field] === value) return;
  entry[field] = value;
  entry.status = 'draft';
  counters[field] += 1;
}

function translatedArticle(locale, source, translations) {
  if (!source.article) return '';
  const override = articleOverrides[locale].get(source.name);
  if (override) return override;
  const phrase = translations[`${source.article} ${source.name}`] ?? '';
  const firstWord = phrase.trim().match(/^[\p{L}]+/u)?.[0]?.toLocaleLowerCase() ?? '';
  const accepted = locale === 'pt'
    ? new Set(['um', 'uma', 'o', 'a', 'os', 'as', 'uns', 'umas', 'algum', 'alguma', 'alguns', 'algumas'])
    : new Set(['un', 'una', 'el', 'la', 'los', 'las', 'unos', 'unas', 'algún', 'alguna', 'algunos', 'algunas']);
  return accepted.has(firstWord) ? firstWord : '';
}

const english = readJson(join(assetRoot, 'item-catalog.en.json'));
const catalogs = Object.fromEntries(
  locales.map((locale) => [locale, readJson(join(assetRoot, `item-catalog.${locale}.json`))]),
);
const references = readJson(cacheFile).translations;
const counters = Object.fromEntries(
  locales.map((locale) => [locale, { name: 0, article: 0, description: 0 }]),
);

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = join(assetRoot, 'backup', `translation-audit-${stamp}`);
mkdirSync(backupRoot, { recursive: true });
for (const locale of ['en', ...locales]) {
  copyFileSync(
    join(assetRoot, `item-catalog.${locale}.json`),
    join(backupRoot, `item-catalog.${locale}.json`),
  );
}
copyFileSync(join(assetRoot, 'asset-package.json'), join(backupRoot, 'asset-package.json'));

for (const [itemId, source] of Object.entries(english.items)) {
  const pt = catalogs.pt.items[itemId];
  if (pt) {
    if (source.article) {
      replaceField(
        pt,
        'article',
        translatedArticle('pt', source, references.pt),
        counters.pt,
      );
    }
    if (source.description) {
      replaceField(
        pt,
        'description',
        references.pt[source.description],
        counters.pt,
      );
    }

    const override = portugueseNameOverrides.get(source.name);
    const reference = override ?? references.pt[source.name];
    if (
      override
      || shouldReplacePortugueseName(source.name, pt.name, reference)
    ) {
      replaceField(pt, 'name', reference, counters.pt);
    }
  }

  const es = catalogs.es.items[itemId];
  if (es && source.article) {
    replaceField(
      es,
      'article',
      translatedArticle('es', source, references.es),
      counters.es,
    );
  }
}

const curatedFixes = {
  es: {
    2655: { description: 'La túnica está bordada con gran maestría.' },
    10078: { description: 'La materia del caos está crepitando.' },
    15426: { description: 'La identidad de algún ser de las profundidades está escrita allí.' },
    15434: { description: 'La identidad de algún ser de las profundidades está escrita allí.' },
    15435: { description: 'La identidad de algún ser de las profundidades está escrita allí.' },
    15436: { description: 'La identidad de algún ser de las profundidades está escrita allí.' },
  },
  pl: {
    7442: { description: 'Widoczny jest zarys głowy.' },
    7445: { description: 'Widać tu przybliżony kształt mamuta.' },
  },
};

for (const [locale, fixes] of Object.entries(curatedFixes)) {
  for (const [itemId, fields] of Object.entries(fixes)) {
    const entry = catalogs[locale].items[itemId];
    for (const [field, value] of Object.entries(fields)) {
      replaceField(entry, field, value, counters[locale]);
    }
  }
}

for (const locale of locales) {
  writeFileSync(
    join(assetRoot, `item-catalog.${locale}.json`),
    `${JSON.stringify(catalogs[locale])}\n`,
  );
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

const result = {
  generatedAt: new Date().toISOString(),
  backupRoot,
  packageId: manifest.packageId,
  changed: counters,
};
writeFileSync(
  resolve('.translation-audit-fixes.json'),
  `${JSON.stringify(result, null, 2)}\n`,
);
console.log(JSON.stringify(result, null, 2));
