import type { ItemLocale, ItemLocalizedText } from './types';

export interface TranslationInput {
  id: number;
  name: string;
  description?: string;
}

interface TranslationResponse {
  targetLocale: Exclude<ItemLocale, 'en'>;
  items: Array<TranslationInput>;
}

export async function translateItems(
  targetLocale: Exclude<ItemLocale, 'en'>,
  items: TranslationInput[],
  accessToken: string,
  signal?: AbortSignal,
): Promise<TranslationResponse['items']> {
  const endpoint = import.meta.env.VITE_TRANSLATION_API_URL;
  if (!endpoint) throw new Error('VITE_TRANSLATION_API_URL is not configured.');
  if (!accessToken.trim()) throw new Error('Translation access token is required.');
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ targetLocale, items }),
      signal,
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new Error(`Translation Worker is unavailable at ${endpoint}. Restart npm run dev.`);
  }
  const payload = await response.json().catch(() => null) as
    | TranslationResponse
    | { error?: string }
    | null;
  if (!response.ok) {
    throw new Error(payload && 'error' in payload && payload.error
      ? payload.error
      : `Translation request failed with HTTP ${response.status}.`);
  }
  if (!payload || !('items' in payload) || !Array.isArray(payload.items)) {
    throw new Error('Translation service returned an invalid response.');
  }
  return payload.items;
}

export function translatedItemText(
  translated: TranslationInput,
  sourceHash: string,
  previous?: ItemLocalizedText,
): ItemLocalizedText {
  return {
    name: translated.name.trim(),
    ...(previous?.article?.trim() ? { article: previous.article.trim() } : {}),
    ...(translated.description?.trim() ? { description: translated.description.trim() } : {}),
    sourceHash,
    status: 'draft',
  };
}
