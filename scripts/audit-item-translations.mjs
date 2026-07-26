import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const assetRoot = resolve(process.argv[2] || 'C:/Dev/Emperia-Assets/current');
const targets = ['pt', 'es', 'pl'];
const cacheFile = resolve('.translation-audit-cache.json');
const reportFile = resolve('.translation-audit-report.json');
const MAX_BATCH_ITEMS = 100;
const MAX_BATCH_CHARACTERS = 12_000;

function readJson(filename) {
  return JSON.parse(readFileSync(filename, 'utf8'));
}

function readEnv(filename) {
  const result = {};
  for (const line of readFileSync(filename, 'utf8').split(/\r?\n/)) {
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
    result[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return result;
}

function decodeEntities(value) {
  const named = { amp: '&', apos: "'", gt: '>', lt: '<', quot: '"' };
  return value.replace(/&(#x[\da-f]+|#\d+|amp|apos|gt|lt|quot);/gi, (match, entity) => {
    if (entity[0] !== '#') return named[entity.toLowerCase()] ?? match;
    const hexadecimal = entity[1].toLowerCase() === 'x';
    const codePoint = Number.parseInt(entity.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
    return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
      ? String.fromCodePoint(codePoint)
      : match;
  });
}

function normalize(value) {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function editDistance(left, right) {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[right.length];
}

function similarity(left, right) {
  const normalizedLeft = normalize(left);
  const normalizedRight = normalize(right);
  const largest = Math.max(normalizedLeft.length, normalizedRight.length);
  return largest === 0 ? 1 : 1 - editDistance(normalizedLeft, normalizedRight) / largest;
}

function makeBatches(values) {
  const batches = [];
  let batch = [];
  let characters = 0;
  for (const value of values) {
    if (batch.length > 0 && (
      batch.length >= MAX_BATCH_ITEMS
      || characters + value.length > MAX_BATCH_CHARACTERS
    )) {
      batches.push(batch);
      batch = [];
      characters = 0;
    }
    batch.push(value);
    characters += value.length;
  }
  if (batch.length > 0) batches.push(batch);
  return batches;
}

async function translateBatch(apiKey, locale, values) {
  const response = await fetch(
    `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: values,
        source: 'en',
        target: locale,
        format: 'text',
        model: 'nmt',
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`Google Translation returned HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`);
  }
  const payload = await response.json();
  const translations = payload.data?.translations;
  if (!Array.isArray(translations) || translations.length !== values.length) {
    throw new Error(`Google returned an incomplete ${locale} batch.`);
  }
  return translations.map((entry) => decodeEntities(entry.translatedText));
}

async function runPool(tasks, concurrency) {
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const task = tasks[next];
      next += 1;
      await task();
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
}

const env = readEnv(resolve('.dev.vars'));
const apiKey = env.GOOGLE_TRANSLATE_API_KEY;
if (!apiKey || apiKey.startsWith('replace-')) {
  throw new Error('GOOGLE_TRANSLATE_API_KEY is not configured in .dev.vars.');
}

const english = readJson(resolve(assetRoot, 'item-catalog.en.json')).items;
const sourceValues = [...new Set(Object.values(english).flatMap((entry) => [
  entry.name,
  ...(entry.article ? [`${entry.article} ${entry.name}`] : []),
  ...(entry.description ? [entry.description] : []),
]))];
const cache = (() => {
  try {
    return readJson(cacheFile);
  } catch {
    return { schemaVersion: 1, translations: {} };
  }
})();

for (const locale of targets) {
  cache.translations[locale] ??= {};
  const missing = sourceValues.filter((value) => typeof cache.translations[locale][value] !== 'string');
  const batches = makeBatches(missing);
  let completed = 0;
  console.log(`${locale}: ${missing.length} unique texts in ${batches.length} batches`);
  await runPool(batches.map((batch) => async () => {
    const translated = await translateBatch(apiKey, locale, batch);
    batch.forEach((source, index) => {
      cache.translations[locale][source] = translated[index];
    });
    completed += batch.length;
    if (completed % 500 < batch.length || completed === missing.length) {
      console.log(`${locale}: ${completed}/${missing.length}`);
      writeFileSync(cacheFile, `${JSON.stringify(cache)}\n`);
    }
  }), 3);
}
writeFileSync(cacheFile, `${JSON.stringify(cache)}\n`);

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  assetRoot,
  sourceItems: Object.keys(english).length,
  uniqueSourceTexts: sourceValues.length,
  locales: {},
};

for (const locale of targets) {
  const localized = readJson(resolve(assetRoot, `item-catalog.${locale}.json`)).items;
  const inconsistencies = [];
  const suspicious = [];
  for (const field of ['name', 'description']) {
    const bySource = new Map();
    for (const [itemId, sourceEntry] of Object.entries(english)) {
      const source = sourceEntry[field];
      if (!source) continue;
      const current = localized[itemId]?.[field] ?? '';
      const row = bySource.get(source) ?? new Map();
      row.set(current, [...(row.get(current) ?? []), Number(itemId)]);
      bySource.set(source, row);
    }
    for (const [source, variants] of bySource) {
      if (variants.size > 1) {
        inconsistencies.push({
          field,
          source,
          reference: cache.translations[locale][source],
          variants: [...variants].map(([text, itemIds]) => ({ text, itemIds })),
        });
      }
    }
  }
  for (const [itemId, sourceEntry] of Object.entries(english)) {
    const targetEntry = localized[itemId] ?? {};
    for (const field of ['name', 'description']) {
      const source = sourceEntry[field];
      if (!source) continue;
      const current = targetEntry[field] ?? '';
      const reference = cache.translations[locale][source] ?? '';
      const score = similarity(current, reference);
      const unchangedEnglish = normalize(current) === normalize(source)
        && normalize(reference) !== normalize(source);
      if (!current || unchangedEnglish || score < 0.35) {
        suspicious.push({
          itemId: Number(itemId),
          field,
          source,
          current,
          reference,
          similarity: Number(score.toFixed(3)),
          reason: !current ? 'missing' : unchangedEnglish ? 'unchanged-english' : 'far-from-reference',
        });
      }
    }
  }
  suspicious.sort((left, right) => left.similarity - right.similarity);
  report.locales[locale] = {
    inconsistentSourceTexts: inconsistencies.length,
    suspiciousEntries: suspicious.length,
    inconsistencies,
    suspicious,
  };
  console.log(`${locale}: ${inconsistencies.length} inconsistent sources, ${suspicious.length} suspicious entries`);
}

writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Audit report written to ${reportFile}`);
