import { useMemo, useRef, useState } from 'react';
import { Check, ChevronRight, Languages, Loader2, RefreshCw, RotateCcw } from 'lucide-react';
import { useOBStore } from '../store';
import { ITEM_LOCALES, type ItemLocale, type ItemLocalizedText } from '../lib/types';
import { sourceHash } from '../lib/item-localization';
import { translateItems, translatedItemText, type TranslationInput } from '../lib/translation-api';

const LABELS: Record<ItemLocale, string> = {
  en: 'English',
  pt: 'Português',
  es: 'Español',
  pl: 'Polski',
};

type TargetLocale = Exclude<ItemLocale, 'en'>;
const TARGET_LOCALES = ITEM_LOCALES.filter(
  (locale): locale is TargetLocale => locale !== 'en',
);
const MAX_BATCH_ITEMS = 40;
const MAX_BATCH_CHARACTERS = 10_000;

function translationClass(status: ItemLocalizedText['status'] | 'missing'): string {
  if (status === 'reviewed') return 'text-green-400 border-green-500/30 bg-green-500/10';
  if (status === 'stale') return 'text-amber-300 border-amber-500/30 bg-amber-500/10';
  if (status === 'draft') return 'text-cyan-300 border-cyan-500/30 bg-cyan-500/10';
  return 'text-red-300 border-red-500/30 bg-red-500/10';
}

export function LocalizationEditor() {
  const selectedAppearanceId = useOBStore((state) => state.selectedThingId);
  const activeCategory = useOBStore((state) => state.activeCategory);
  const appearanceToItemIds = useOBStore((state) => state.appearanceToItemIds);
  const itemLocalizations = useOBStore((state) => state.itemLocalizations);
  const updateItemLocalization = useOBStore((state) => state.updateItemLocalization);
  const markReviewed = useOBStore((state) => state.markItemTranslationReviewed);
  const resetReviews = useOBStore((state) => state.resetItemTranslationReviews);
  const setSelectedThingId = useOBStore((state) => state.setSelectedThingId);
  useOBStore((state) => state.editVersion);

  const itemId = selectedAppearanceId == null
    ? null
    : (appearanceToItemIds.get(selectedAppearanceId) ?? null);
  const source = itemId == null ? null : itemLocalizations.en.get(itemId) ?? null;
  const [token, setToken] = useState(
    () => sessionStorage.getItem('emperia-translation-token')
      ?? import.meta.env.VITE_TRANSLATION_ACCESS_TOKEN
      ?? '',
  );
  const [busyLocale, setBusyLocale] = useState<TargetLocale | null>(null);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const controllerRef = useRef<AbortController | null>(null);

  const pendingIds = useMemo(() => Object.fromEntries(
    TARGET_LOCALES.map((locale) => {
      const ids: number[] = [];
      for (const [candidateId, candidateSource] of itemLocalizations.en) {
        const candidate = itemLocalizations[locale].get(candidateId);
        if (!candidate || candidate.status === 'stale' || candidate.sourceHash !== sourceHash(candidateSource)) {
          ids.push(candidateId);
        }
      }
      return [locale, ids];
    }),
  ) as Record<TargetLocale, number[]>, [itemLocalizations]);

  const reviewIds = useMemo(() => {
    const ids: number[] = [];
    for (const [candidateId, candidateSource] of itemLocalizations.en) {
      const currentHash = sourceHash(candidateSource);
      const needsReview = TARGET_LOCALES.some((locale) => {
        const candidate = itemLocalizations[locale].get(candidateId);
        return !candidate
          || candidate.status !== 'reviewed'
          || candidate.sourceHash !== currentHash;
      });
      if (needsReview) ids.push(candidateId);
    }
    return ids;
  }, [itemLocalizations]);

  const saveToken = (value: string) => {
    setToken(value);
    if (value) sessionStorage.setItem('emperia-translation-token', value);
    else sessionStorage.removeItem('emperia-translation-token');
  };

  const updateField = (
    locale: TargetLocale,
    field: keyof Pick<ItemLocalizedText, 'name' | 'article' | 'description'>,
    value: string,
  ) => {
    if (itemId == null || !source) return;
    const translated = itemLocalizations[locale].get(itemId);
    const next: ItemLocalizedText = {
      name: field === 'name' ? value : (translated?.name ?? ''),
      article: field === 'article' ? value : translated?.article,
      description: field === 'description' ? value : translated?.description,
      sourceHash: translated?.sourceHash ?? sourceHash(source),
      status: translated?.status === 'reviewed' ? 'draft' : (translated?.status ?? 'draft'),
    };
    updateItemLocalization(itemId, locale, next);
  };

  const translateBatch = async (locale: TargetLocale, ids: number[]) => {
    if (ids.length === 0) return;
    setBusyLocale(locale);
    setError('');
    controllerRef.current = new AbortController();
    try {
      const batches: number[][] = [];
      let current: number[] = [];
      let currentCharacters = 0;
      for (const candidateId of ids) {
        const candidateSource = itemLocalizations.en.get(candidateId);
        if (!candidateSource) continue;
        const characters = candidateSource.name.length + (candidateSource.description?.length ?? 0);
        if (current.length > 0 && (
          current.length >= MAX_BATCH_ITEMS
          || currentCharacters + characters > MAX_BATCH_CHARACTERS
        )) {
          batches.push(current);
          current = [];
          currentCharacters = 0;
        }
        current.push(candidateId);
        currentCharacters += characters;
      }
      if (current.length > 0) batches.push(current);

      let completed = 0;
      for (const batchIds of batches) {
        setProgress(`${LABELS[locale]}: translating ${Math.min(completed + batchIds.length, ids.length)} / ${ids.length}`);
        const inputs: TranslationInput[] = batchIds.flatMap((candidateId) => {
          const candidateSource = itemLocalizations.en.get(candidateId);
          return candidateSource ? [{
            id: candidateId,
            name: candidateSource.name,
            ...(candidateSource.description ? { description: candidateSource.description } : {}),
          }] : [];
        });
        const results = await translateItems(locale, inputs, token, controllerRef.current.signal);
        for (const result of results) {
          const candidateSource = itemLocalizations.en.get(result.id);
          if (!candidateSource) continue;
          updateItemLocalization(
            result.id,
            locale,
            translatedItemText(
              result,
              sourceHash(candidateSource),
              itemLocalizations[locale].get(result.id),
            ),
          );
        }
        completed += batchIds.length;
      }
      setProgress(`${LABELS[locale]}: translated ${ids.length} item${ids.length === 1 ? '' : 's'}.`);
    } catch (reason) {
      if ((reason as Error).name !== 'AbortError') {
        setProgress('Translation stopped.');
        setError(reason instanceof Error ? reason.message : String(reason));
      }
    } finally {
      controllerRef.current = null;
      setBusyLocale(null);
    }
  };

  const resetAllReviews = () => {
    const confirmed = window.confirm(
      'Mark every existing Portuguese, Spanish, and Polish translation as draft for a new manual review? Text will not be changed.',
    );
    if (!confirmed) return;
    const changed = resetReviews();
    setProgress(`${changed} translations marked for re-review. No text was overwritten.`);
    setError('');
  };

  const goToNextReview = () => {
    if (reviewIds.length === 0) return;
    const currentIndex = itemId == null ? -1 : reviewIds.indexOf(itemId);
    const nextItemId = reviewIds[(currentIndex + 1) % reviewIds.length];
    for (const [appearanceId, mappedItemId] of appearanceToItemIds) {
      if (mappedItemId === nextItemId) {
        setSelectedThingId(appearanceId);
        return;
      }
    }
  };

  if (activeCategory !== 'item' || itemId == null || !source) {
    return (
      <div className="p-8 text-center text-sm text-emperia-muted">
        Select a named public item to edit its translations.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1800px] space-y-5 p-5">
      <section className="rounded-lg border border-emperia-border bg-emperia-surface p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Languages className="h-4 w-4 text-emperia-accent" />
          <h2 className="text-sm font-semibold text-emperia-text">Item #{itemId} Localization</h2>
          {TARGET_LOCALES.map((locale) => {
            const status = itemLocalizations[locale].get(itemId)?.status ?? 'missing';
            return (
              <span
                key={locale}
                className={`rounded border px-2 py-0.5 text-[10px] uppercase ${translationClass(status)}`}
              >
                {locale}: {status}
              </span>
            );
          })}
          <div className="flex-1" />
          <button
            disabled={busyLocale !== null}
            onClick={resetAllReviews}
            className="flex items-center gap-1.5 rounded border border-amber-500/30 px-3 py-1.5 text-xs text-amber-300 disabled:opacity-40"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Re-review all translations
          </button>
          <button
            disabled={reviewIds.length === 0}
            onClick={goToNextReview}
            className="flex items-center gap-1.5 rounded border border-emperia-border px-3 py-1.5 text-xs text-emperia-text disabled:opacity-40"
          >
            Next to review ({reviewIds.length})
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <TextPanel title="English source" text={source} readOnly />
        {TARGET_LOCALES.map((locale) => {
          const translated = itemLocalizations[locale].get(itemId);
          const status = translated?.status ?? 'missing';
          const busy = busyLocale === locale;
          return (
            <div key={locale} className="space-y-2">
              <TextPanel
                title={LABELS[locale]}
                text={translated ?? { name: '' }}
                status={status}
                onChange={(field, value) => updateField(locale, field, value)}
              />
              <div className="flex flex-wrap gap-2 rounded-lg border border-emperia-border bg-emperia-surface p-3">
                <button
                  disabled={busyLocale !== null}
                  onClick={() => translateBatch(locale, [itemId])}
                  className="flex items-center gap-1 rounded bg-emperia-accent/20 px-2 py-1 text-[10px] text-emperia-accent disabled:opacity-40"
                >
                  {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  Translate
                </button>
                <button
                  disabled={busyLocale !== null || pendingIds[locale].length === 0}
                  onClick={() => translateBatch(locale, pendingIds[locale])}
                  className="rounded border border-emperia-border px-2 py-1 text-[10px] text-emperia-text disabled:opacity-40"
                >
                  Missing/stale ({pendingIds[locale].length})
                </button>
                <button
                  disabled={busyLocale !== null || !translated || status === 'reviewed'}
                  onClick={() => markReviewed(itemId, locale)}
                  className="flex items-center gap-1 rounded border border-green-500/30 px-2 py-1 text-[10px] text-green-400 disabled:opacity-40"
                >
                  <Check className="h-3 w-3" />
                  Reviewed
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <section className="space-y-3 rounded-lg border border-emperia-border bg-emperia-surface p-4">
        <div>
          <h3 className="text-xs font-semibold text-emperia-text">Automatic translation</h3>
          <p className="mt-1 text-[10px] text-emperia-muted">
            Google Cloud Translation creates drafts. Re-reviewing changes only status; it never overwrites text.
          </p>
        </div>
        <label className="block text-[10px] uppercase tracking-wide text-emperia-muted">
          Worker access token
          <input
            type="password"
            value={token}
            onChange={(event) => saveToken(event.target.value)}
            placeholder="Configured automatically for local development"
            className="mt-1 w-full rounded border border-emperia-border bg-emperia-bg px-2 py-1.5 text-xs text-emperia-text"
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          {busyLocale && (
            <button
              onClick={() => controllerRef.current?.abort()}
              className="text-xs text-red-300"
            >
              Cancel
            </button>
          )}
          <span className="text-[10px] text-emperia-muted">{progress}</span>
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </section>
    </div>
  );
}

function TextPanel({
  title,
  text,
  status,
  readOnly = false,
  onChange,
}: {
  title: string;
  text: ItemLocalizedText;
  status?: ItemLocalizedText['status'] | 'missing';
  readOnly?: boolean;
  onChange?: (field: 'name' | 'article' | 'description', value: string) => void;
}) {
  const inputClass = 'mt-1 w-full rounded border border-emperia-border bg-emperia-bg px-2 py-1.5 text-xs text-emperia-text disabled:opacity-70';
  return (
    <section className="space-y-3 rounded-lg border border-emperia-border bg-emperia-surface p-4">
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-semibold text-emperia-text">{title}</h3>
        {status && (
          <span className={`rounded border px-1.5 py-0.5 text-[9px] uppercase ${translationClass(status)}`}>
            {status}
          </span>
        )}
      </div>
      <label className="block text-[10px] uppercase tracking-wide text-emperia-muted">
        Name
        <input
          className={inputClass}
          disabled={readOnly}
          value={text.name}
          onChange={(event) => onChange?.('name', event.target.value)}
        />
      </label>
      <label className="block text-[10px] uppercase tracking-wide text-emperia-muted">
        Article
        <input
          className={inputClass}
          disabled={readOnly}
          value={text.article ?? ''}
          onChange={(event) => onChange?.('article', event.target.value)}
        />
      </label>
      <label className="block text-[10px] uppercase tracking-wide text-emperia-muted">
        Description
        <textarea
          className={`${inputClass} min-h-28 resize-y`}
          disabled={readOnly}
          value={text.description ?? ''}
          onChange={(event) => onChange?.('description', event.target.value)}
        />
      </label>
    </section>
  );
}
