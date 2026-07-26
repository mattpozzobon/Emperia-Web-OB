type SupportedTarget = 'pt' | 'es' | 'pl';

interface TranslationItem {
  id: number;
  name: string;
  description?: string;
}

interface TranslationRequest {
  targetLocale: SupportedTarget;
  items: TranslationItem[];
}

interface GoogleTranslation {
  translatedText: string;
}

const MAX_ITEMS = 40;
const MAX_BODY_BYTES = 64 * 1024;
const MAX_SOURCE_CHARACTERS = 12_000;
const TARGETS = new Set<SupportedTarget>(['pt', 'es', 'pl']);

function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}

function corsHeaders(request: Request, env: Env): HeadersInit | null {
  const origin = request.headers.get('Origin');
  if (!origin) return {};
  const allowed = env.ALLOWED_ORIGINS.split(',').map((value) => value.trim());
  if (!allowed.includes(origin)) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

async function secureEqual(left: string, right: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  if (leftBytes.byteLength !== rightBytes.byteLength) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode('emperia-translation-access'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.sign('HMAC', key, leftBytes),
    crypto.subtle.sign('HMAC', key, rightBytes),
  ]);
  const leftView = new Uint8Array(leftDigest);
  const rightView = new Uint8Array(rightDigest);
  let difference = 0;
  for (let index = 0; index < leftView.length; index += 1) {
    difference |= leftView[index] ^ rightView[index];
  }
  return difference === 0;
}

function parseBody(value: unknown): TranslationRequest | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<TranslationRequest>;
  if (!candidate.targetLocale || !TARGETS.has(candidate.targetLocale)) return null;
  if (!Array.isArray(candidate.items) || candidate.items.length === 0 || candidate.items.length > MAX_ITEMS) {
    return null;
  }
  const items: TranslationItem[] = [];
  let sourceCharacters = 0;
  for (const raw of candidate.items) {
    if (!raw || typeof raw !== 'object') return null;
    const item = raw as Partial<TranslationItem>;
    if (!Number.isInteger(item.id) || typeof item.name !== 'string' || !item.name.trim()) return null;
    if (item.name.length > 300 || (item.description?.length ?? 0) > 4_000) return null;
    sourceCharacters += item.name.length + (item.description?.length ?? 0);
    if (sourceCharacters > MAX_SOURCE_CHARACTERS) return null;
    items.push({
      id: item.id,
      name: item.name.trim(),
      ...(item.description?.trim() ? { description: item.description.trim() } : {}),
    });
  }
  return { targetLocale: candidate.targetLocale, items };
}

function decodeTranslationEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    quot: '"',
  };
  return value.replace(/&(#x[\da-f]+|#\d+|amp|apos|gt|lt|quot);/gi, (match, entity: string) => {
    if (entity[0] !== '#') return named[entity.toLowerCase()] ?? match;
    const hexadecimal = entity[1].toLowerCase() === 'x';
    const codePoint = Number.parseInt(entity.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
    return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
      ? String.fromCodePoint(codePoint)
      : match;
  });
}

async function translate(request: TranslationRequest, env: Env): Promise<Response> {
  const phrases: string[] = [];
  const fields: Array<{ id: number; field: 'name' | 'description' }> = [];
  for (const item of request.items) {
    phrases.push(item.name);
    fields.push({ id: item.id, field: 'name' });
    if (item.description) {
      phrases.push(item.description);
      fields.push({ id: item.id, field: 'description' });
    }
  }

  const upstream = await fetch(
    `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(env.GOOGLE_TRANSLATE_API_KEY)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: phrases,
        source: 'en',
        target: request.targetLocale,
        format: 'text',
        model: 'nmt',
      }),
    },
  );
  if (!upstream.ok) {
    const detail = (await upstream.text()).slice(0, 1_000);
    console.error(JSON.stringify({ event: 'google_translate_error', status: upstream.status, detail }));
    return json({ error: 'Translation provider rejected the request.' }, 502);
  }
  const payload = await upstream.json() as { data?: { translations?: GoogleTranslation[] } };
  const translations = payload.data?.translations;
  if (!translations || translations.length !== fields.length) {
    console.error(JSON.stringify({ event: 'google_translate_invalid_response', expected: fields.length }));
    return json({ error: 'Translation provider returned an incomplete response.' }, 502);
  }

  const byId = new Map<number, { id: number; name: string; description?: string }>();
  fields.forEach((field, index) => {
    const output = byId.get(field.id) ?? { id: field.id, name: '' };
    output[field.field] = decodeTranslationEntities(translations[index].translatedText);
    byId.set(field.id, output);
  });
  return json({ targetLocale: request.targetLocale, items: [...byId.values()] });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(request, env);
    if (!cors) return json({ error: 'Origin is not allowed.' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (new URL(request.url).pathname !== '/translate-items' || request.method !== 'POST') {
      return json({ error: 'Not found.' }, 404, cors);
    }
    const length = Number(request.headers.get('Content-Length') ?? 0);
    if (length > MAX_BODY_BYTES) return json({ error: 'Request is too large.' }, 413, cors);

    const authorization = request.headers.get('Authorization');
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!token || !await secureEqual(token, env.TRANSLATION_ACCESS_TOKEN)) {
      return json({ error: 'Unauthorized.' }, 401, cors);
    }

    let raw: unknown;
    try {
      const body = await request.arrayBuffer();
      if (body.byteLength > MAX_BODY_BYTES) return json({ error: 'Request is too large.' }, 413, cors);
      raw = JSON.parse(new TextDecoder().decode(body));
    } catch {
      return json({ error: 'Invalid JSON body.' }, 400, cors);
    }
    const body = parseBody(raw);
    if (!body) return json({ error: 'Invalid translation request.' }, 400, cors);

    try {
      const response = await translate(body, env);
      for (const [key, value] of Object.entries(cors)) response.headers.set(key, String(value));
      return response;
    } catch (error) {
      console.error(JSON.stringify({
        event: 'translation_unhandled_error',
        message: error instanceof Error ? error.message : String(error),
      }));
      return json({ error: 'Translation service failed.' }, 500, cors);
    }
  },
} satisfies ExportedHandler<Env>;
