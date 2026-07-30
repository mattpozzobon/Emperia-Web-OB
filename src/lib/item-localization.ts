import {
  ITEM_LOCALES,
  type ItemCatalogFile,
  type ItemDefinition,
  type ItemLocale,
  type ItemLocalizedText,
} from './types';
import { readItemProperty } from './item-properties';

export const ITEM_CATALOG_FILE = (locale: ItemLocale) => `item-catalog.${locale}.json`;

export function isItemLocale(value: string): value is ItemLocale {
  return (ITEM_LOCALES as readonly string[]).includes(value);
}

export function sourceTextFromDefinition(definition: ItemDefinition): ItemLocalizedText | null {
  const properties = definition.properties;
  const rawName = readItemProperty(properties, 'name');
  const name = typeof rawName === 'string' ? rawName.trim() : '';
  if (!name) return null;
  const rawArticle = readItemProperty(properties, 'article');
  const rawDescription = readItemProperty(properties, 'description');
  const article = typeof rawArticle === 'string' ? rawArticle.trim() : '';
  const description = typeof rawDescription === 'string' ? rawDescription.trim() : '';
  return {
    name,
    ...(article ? { article } : {}),
    ...(description ? { description } : {}),
  };
}

/** Stable, dependency-free source fingerprint used to detect stale translations. */
export function sourceHash(text: ItemLocalizedText): string {
  const input = `${text.name}\u001f${text.article ?? ''}\u001f${text.description ?? ''}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function parseItemCatalog(value: unknown, expectedLocale?: ItemLocale): ItemCatalogFile {
  if (!value || typeof value !== 'object') throw new Error('Item catalog must be an object.');
  const candidate = value as Partial<ItemCatalogFile>;
  if (candidate.schemaVersion !== 1) throw new Error('Unsupported item catalog schema.');
  if (!candidate.locale || !isItemLocale(candidate.locale)) throw new Error('Invalid item catalog locale.');
  if (expectedLocale && candidate.locale !== expectedLocale) {
    throw new Error(`Catalog locale ${candidate.locale} does not match ${expectedLocale}.`);
  }
  if (!candidate.items || typeof candidate.items !== 'object' || Array.isArray(candidate.items)) {
    throw new Error('Item catalog is missing its items object.');
  }

  const items: Record<string, ItemLocalizedText> = {};
  for (const [id, raw] of Object.entries(candidate.items)) {
    if (!/^\d+$/.test(id) || !raw || typeof raw !== 'object') continue;
    const entry = raw as Partial<ItemLocalizedText>;
    if (typeof entry.name !== 'string' || !entry.name.trim()) continue;
    items[id] = {
      name: entry.name.trim(),
      ...(typeof entry.article === 'string' && entry.article.trim()
        ? { article: entry.article.trim() }
        : {}),
      ...(typeof entry.description === 'string' && entry.description.trim()
        ? { description: entry.description.trim() }
        : {}),
      ...(entry.marketable === true ? { marketable: true } : {}),
      ...(entry.autoLootable === true ? { autoLootable: true } : {}),
      ...(typeof entry.sourceHash === 'string' ? { sourceHash: entry.sourceHash } : {}),
      ...(entry.status === 'draft' || entry.status === 'reviewed' || entry.status === 'stale'
        ? { status: entry.status }
        : {}),
    };
  }
  return { schemaVersion: 1, locale: candidate.locale, fallbackLocale: 'en', items };
}

export function serializeItemCatalog(
  locale: ItemLocale,
  entries: ReadonlyMap<number, ItemLocalizedText>,
): ItemCatalogFile {
  const items: Record<string, ItemLocalizedText> = {};
  for (const itemId of [...entries.keys()].sort((left, right) => left - right)) {
    const entry = entries.get(itemId);
    if (!entry?.name.trim()) continue;
    items[String(itemId)] = {
      name: entry.name.trim(),
      ...(entry.article?.trim() ? { article: entry.article.trim() } : {}),
      ...(entry.description?.trim() ? { description: entry.description.trim() } : {}),
      ...(entry.marketable === true ? { marketable: true } : {}),
      ...(entry.autoLootable === true ? { autoLootable: true } : {}),
      ...(locale !== 'en' && entry.sourceHash ? { sourceHash: entry.sourceHash } : {}),
      ...(locale !== 'en' && entry.status ? { status: entry.status } : {}),
    };
  }
  return { schemaVersion: 1, locale, fallbackLocale: 'en', items };
}
