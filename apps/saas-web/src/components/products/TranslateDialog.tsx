'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Languages } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { MultiSelect, MultiSelectOption } from '@/components/ui/multi-select';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getLocaleShortName } from '@/lib/locale-utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LocaleOption {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
}

interface MarketOption {
  id: string;
  name: string;
  is_active: boolean;
}

interface MarketLocaleAssignment {
  market_id: string;
  locale_id: string;
  is_active: boolean;
}

interface GlossarySummary {
  id: string;
  name: string;
  source_language_code: string;
  target_language_code: string;
  provider_glossary_id: string | null;
  is_active: boolean;
}

interface ProductFieldOption {
  id: string;
  code: string;
  name: string;
  is_translatable: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FIELD_CODE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'product_name', label: 'Product Name' },
  { value: 'short_description', label: 'Short Description' },
  { value: 'long_description', label: 'Long Description' },
  { value: 'features', label: 'Features / Bullets' },
  { value: 'meta_title', label: 'Meta Title' },
  { value: 'meta_description', label: 'Meta Description' },
];

const ALL_FIELD_CODES = FIELD_CODE_OPTIONS.map((f) => f.value);
const MAX_PRODUCTS_PER_JOB = 100;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeLocaleCode(value: string): string {
  return value.trim().toLowerCase();
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface TranslateDialogProps {
  tenantSlug: string;
  /** Product IDs to translate — locked from the calling context */
  productIds: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-fill from useMarketContext().selectedLocaleId */
  initialSourceLocaleId?: string;
  /** Called when translation completes — use to open in-context review */
  onTranslationComplete?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TranslateDialog({
  tenantSlug,
  productIds,
  open,
  onOpenChange,
  initialSourceLocaleId,
  onTranslationComplete,
}: TranslateDialogProps) {
  // Fetched data
  const [locales, setLocales] = useState<LocaleOption[]>([]);
  const [markets, setMarkets] = useState<MarketOption[]>([]);
  const [marketLocaleAssignments, setMarketLocaleAssignments] = useState<MarketLocaleAssignment[]>([]);
  const [glossaries, setGlossaries] = useState<GlossarySummary[]>([]);
  const [productFields, setProductFields] = useState<ProductFieldOption[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [secondaryLoading, setSecondaryLoading] = useState(false);

  // Form
  const [resolvedSourceLocaleId, setResolvedSourceLocaleId] = useState('');
  const [selectedMarketIds, setSelectedMarketIds] = useState<string[]>([]);
  const [fieldCodes, setFieldCodes] = useState<string[]>(ALL_FIELD_CODES);
  const [productFieldIds, setProductFieldIds] = useState<string[]>([]);
  const [targetGlossaryIdsByLocaleId, setTargetGlossaryIdsByLocaleId] = useState<
    Record<string, string>
  >({});
  const [showGlossaries, setShowGlossaries] = useState(false);

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Fetch data on open ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) {
      // Reset all state on close
      setLocales([]);
      setMarkets([]);
      setMarketLocaleAssignments([]);
      setGlossaries([]);
      setProductFields([]);
      setResolvedSourceLocaleId('');
      setSelectedMarketIds([]);
      setFieldCodes(ALL_FIELD_CODES);
      setProductFieldIds([]);
      setTargetGlossaryIdsByLocaleId({});
      setShowGlossaries(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setDataLoading(true);
    setSecondaryLoading(true);
    setError(null);

    // Phase 1: load what's needed to render the market picker immediately
    Promise.all([
      fetch(`/api/${tenantSlug}/localization/settings`),
      fetch(`/api/${tenantSlug}/markets`),
      fetch(`/api/${tenantSlug}/market-locales`),
    ])
      .then(async ([settingsRes, marketsRes, marketLocalesRes]) => {
        if (cancelled) return;

        if (!settingsRes.ok) throw new Error('Failed to load locales');
        const settingsPayload = await settingsRes.json();
        const fetchedLocales: LocaleOption[] = settingsPayload?.data?.locales ?? [];
        const fetchedMarkets: MarketOption[] = marketsRes.ok ? await marketsRes.json() : [];
        const fetchedMarketLocales: MarketLocaleAssignment[] = marketLocalesRes.ok
          ? await marketLocalesRes.json()
          : [];

        if (cancelled) return;

        setLocales(fetchedLocales);
        setMarkets(Array.isArray(fetchedMarkets) ? fetchedMarkets : []);
        setMarketLocaleAssignments(Array.isArray(fetchedMarketLocales) ? fetchedMarketLocales : []);

        const preferred =
          initialSourceLocaleId && fetchedLocales.some((l) => l.id === initialSourceLocaleId)
            ? initialSourceLocaleId
            : (fetchedLocales[0]?.id ?? '');
        setResolvedSourceLocaleId(preferred);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load translation options');
        }
      })
      .finally(() => {
        if (!cancelled) setDataLoading(false);
      });

    // Phase 2: load glossaries + custom fields in the background (non-blocking)
    Promise.all([
      fetch(`/api/${tenantSlug}/localization/glossaries`),
      fetch(`/api/${tenantSlug}/product-fields`),
    ])
      .then(async ([glossariesRes, fieldsRes]) => {
        if (cancelled) return;

        const fetchedGlossaries: GlossarySummary[] = glossariesRes.ok
          ? ((await glossariesRes.json())?.data?.glossaries ?? [])
          : [];

        const fieldsRaw = fieldsRes.ok ? await fieldsRes.json() : [];
        const fetchedFields: ProductFieldOption[] = (Array.isArray(fieldsRaw) ? fieldsRaw : []).filter(
          (f: ProductFieldOption) =>
            f && typeof f.id === 'string' && typeof f.code === 'string' && f.is_translatable
        );

        if (cancelled) return;
        setGlossaries(fetchedGlossaries);
        setProductFields(fetchedFields);
      })
      .catch(() => { /* glossaries/fields are non-critical, fail silently */ })
      .finally(() => {
        if (!cancelled) setSecondaryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, tenantSlug, initialSourceLocaleId]);

  // ── Derived ─────────────────────────────────────────────────────────────────

  const localeById = useMemo(() => {
    const map = new Map<string, LocaleOption>();
    for (const l of locales) map.set(l.id, l);
    return map;
  }, [locales]);

  const sourceLocale = localeById.get(resolvedSourceLocaleId);

  // Build locales-per-market lookup
  const localesByMarketId = useMemo(() => {
    const map = new Map<string, LocaleOption[]>();
    for (const ml of marketLocaleAssignments) {
      if (!ml.is_active) continue;
      const locale = localeById.get(ml.locale_id);
      if (!locale) continue;
      if (!map.has(ml.market_id)) map.set(ml.market_id, []);
      map.get(ml.market_id)!.push(locale);
    }
    return map;
  }, [marketLocaleAssignments, localeById]);

  // Source market = market whose locale assignments include the resolved source locale
  const sourceMarket = useMemo(() => {
    if (!resolvedSourceLocaleId) return null;
    return markets.find((m) =>
      (localesByMarketId.get(m.id) ?? []).some((l) => l.id === resolvedSourceLocaleId)
    ) ?? null;
  }, [markets, resolvedSourceLocaleId, localesByMarketId]);

  // Target markets: active, not the source market, must have at least one locale
  // whose language differs from the source (nothing to translate otherwise)
  const targetMarketOptions = useMemo<MultiSelectOption[]>(() => {
    const sourceLang = sourceLocale?.code.split('-')[0] ?? null;
    return markets
      .filter((m) => {
        if (!m.is_active || m.id === sourceMarket?.id) return false;
        const mLocales = localesByMarketId.get(m.id) ?? [];
        return mLocales.some((l) => !sourceLang || l.code.split('-')[0] !== sourceLang);
      })
      .map((m) => ({ value: m.id, label: m.name }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [markets, sourceMarket, localesByMarketId, sourceLocale]);

  // Expand selected markets → locale IDs for API payload and glossary section
  // Skip locales whose language matches the source (e.g. en-MX when source is en-US)
  const targetLocaleIds = useMemo(() => {
    const sourceLang = sourceLocale?.code.split('-')[0] ?? null;
    const ids = new Set<string>();
    for (const marketId of selectedMarketIds) {
      for (const locale of localesByMarketId.get(marketId) ?? []) {
        if (sourceLang && locale.code.split('-')[0] === sourceLang) continue;
        ids.add(locale.id);
      }
    }
    return [...ids];
  }, [selectedMarketIds, localesByMarketId, sourceLocale]);

  // ── Glossary pruning: remove stale entries when target locales change ────────
  useEffect(() => {
    setTargetGlossaryIdsByLocaleId((prev) => {
      const targetSet = new Set(targetLocaleIds);
      const next: Record<string, string> = {};
      for (const [localeId, glossaryId] of Object.entries(prev)) {
        if (!targetSet.has(localeId)) continue;
        next[localeId] = glossaryId;
      }
      const unchanged =
        Object.keys(prev).length === Object.keys(next).length &&
        Object.entries(prev).every(([k, v]) => next[k] === v);
      return unchanged ? prev : next;
    });
  }, [targetLocaleIds]);

  const pairGlossariesByTargetLocaleId = useMemo(() => {
    const map = new Map<string, GlossarySummary[]>();
    if (!sourceLocale) return map;
    const sourceCode = normalizeLocaleCode(sourceLocale.code);
    for (const targetLocaleId of targetLocaleIds) {
      const targetLocale = localeById.get(targetLocaleId);
      if (!targetLocale) continue;
      const targetCode = normalizeLocaleCode(targetLocale.code);
      const matching = glossaries.filter(
        (g) =>
          g.is_active &&
          Boolean(g.provider_glossary_id) &&
          normalizeLocaleCode(g.source_language_code) === sourceCode &&
          normalizeLocaleCode(g.target_language_code) === targetCode
      );
      if (matching.length > 0) map.set(targetLocaleId, matching);
    }
    return map;
  }, [glossaries, sourceLocale, targetLocaleIds, localeById]);

  const customFieldOptions = useMemo<MultiSelectOption[]>(
    () => productFields.map((f) => ({ value: f.id, label: `${f.name} (${f.code})` })),
    [productFields]
  );

  const hasGlossaryOptions = pairGlossariesByTargetLocaleId.size > 0;
  const overLimit = productIds.length > MAX_PRODUCTS_PER_JOB;
  const canSubmit =
    !submitting &&
    !overLimit &&
    Boolean(resolvedSourceLocaleId) &&
    selectedMarketIds.length > 0 &&
    targetLocaleIds.length > 0 &&
    (fieldCodes.length > 0 || productFieldIds.length > 0) &&
    productIds.length > 0;

  // ── Submit ───────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/${tenantSlug}/localization/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobType: 'translate',
          sourceLocaleId: resolvedSourceLocaleId,
          targetLocaleIds,
          targetGlossaryIdsByLocaleId,
          productIds,
          fieldCodes,
          productFieldIds,
          executionMode: 'sync',
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to run translation');
      }

      await response.json();

      // Close dialog first, then open reviewer after Radix has finished its close animation
      onOpenChange(false);
      if (onTranslationComplete) {
        setTimeout(onTranslationComplete, 150);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Translation failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  const productCountLabel =
    productIds.length === 1 ? '1 product' : `${productIds.length} products`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Languages className="h-4 w-4 text-muted-foreground" />
            Translate {productCountLabel}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-2">

            {/* Product count limit warning */}
            {overLimit && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                Maximum {MAX_PRODUCTS_PER_JOB} products per translation run. Please reduce your
                selection to {MAX_PRODUCTS_PER_JOB} or fewer.
              </div>
            )}

            {/* Source locale — read-only context pill */}
            {!dataLoading && sourceLocale && (
              <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3">
                <span className="text-sm text-muted-foreground">Translating from</span>
                <span className="text-sm font-medium text-foreground">
                  {sourceMarket
                    ? `${sourceMarket.name} · ${getLocaleShortName(sourceLocale.name)}`
                    : getLocaleShortName(sourceLocale.name)}
                </span>
              </div>
            )}

            {/* Target markets */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">To markets</label>
              {dataLoading ? (
                <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                  <LoadingSkeleton size="sm" />
                  Loading…
                </div>
              ) : (
                <MultiSelect
                  options={targetMarketOptions}
                  value={selectedMarketIds}
                  onChange={setSelectedMarketIds}
                  placeholder="Select target markets"
                />
              )}
            </div>

            {/* Fields to translate */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-foreground">Fields to translate</label>
              <div className="grid grid-cols-2 gap-3">
                {FIELD_CODE_OPTIONS.map((option) => (
                  <label key={option.value} className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-input accent-primary cursor-pointer"
                      checked={fieldCodes.includes(option.value)}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setFieldCodes((prev) =>
                          checked
                            ? [...prev, option.value]
                            : prev.filter((c) => c !== option.value)
                        );
                      }}
                    />
                    <span className="text-sm text-foreground">{option.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Custom fields */}
            {!secondaryLoading && customFieldOptions.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Custom fields{' '}
                  <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                </label>
                <MultiSelect
                  options={customFieldOptions}
                  value={productFieldIds}
                  onChange={setProductFieldIds}
                  placeholder="Select custom fields"
                />
              </div>
            )}

            {/* Glossaries — advanced, collapsible */}
            {!secondaryLoading && hasGlossaryOptions && (
              <div className="rounded-lg border border-border/60 bg-muted/20">
                <button
                  type="button"
                  onClick={() => setShowGlossaries((v) => !v)}
                  className="flex w-full items-center justify-between px-4 py-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <span className="font-medium">Glossaries</span>
                  {showGlossaries ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
                {showGlossaries && (
                  <div className="border-t border-border/60 px-4 py-4 space-y-4">
                    {targetLocaleIds.map((targetLocaleId) => {
                      const options = pairGlossariesByTargetLocaleId.get(targetLocaleId);
                      if (!options || options.length === 0) return null;
                      const targetLocale = localeById.get(targetLocaleId);
                      return (
                        <div key={targetLocaleId} className="space-y-1.5">
                          <label className="text-xs font-medium text-muted-foreground">
                            {targetLocale ? getLocaleShortName(targetLocale.name) : targetLocaleId}
                          </label>
                          <Select
                            value={targetGlossaryIdsByLocaleId[targetLocaleId] ?? ''}
                            onValueChange={(val) =>
                              setTargetGlossaryIdsByLocaleId((prev) => ({
                                ...prev,
                                [targetLocaleId]: val,
                              }))
                            }
                          >
                            <SelectTrigger className="h-9 text-sm">
                              <SelectValue placeholder="No glossary" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="">No glossary</SelectItem>
                              {options.map((g) => (
                                <SelectItem key={g.id} value={g.id}>
                                  {g.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* Footer */}
            <div className="flex justify-end gap-2 border-t pt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={!canSubmit || dataLoading}>
                {submitting ? (
                  <>
                    <LoadingSkeleton size="sm" className="mr-1.5" />
                    Translating…
                  </>
                ) : (
                  'Run Translation'
                )}
              </Button>
            </div>
          </div>
      </DialogContent>
    </Dialog>
  );
}

