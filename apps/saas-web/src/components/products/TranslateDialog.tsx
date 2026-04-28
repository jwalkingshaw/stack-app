'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Languages } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { Skeleton } from '@/components/ui/skeleton';
import { MultiSelect, MultiSelectOption } from '@/components/ui/multi-select';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getLocaleShortName } from '@/lib/locale-utils';
import { fetchJsonWithDedupe } from '@/lib/client-request-cache';
import type { TranslationPanelMarketContextData } from '@/components/products/TranslationPanel';

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

interface SystemFieldOption {
  code: string;
  label: string;
}

interface ProductFieldOption {
  id: string;
  code: string;
  name: string;
}

interface MarketContextResponse {
  locales?: LocaleOption[];
  markets?: MarketOption[];
  marketLocales?: MarketLocaleAssignment[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_PRODUCTS_PER_JOB = 100;
const TRANSLATION_OPTIONS_CACHE_TTL_MS = 60_000;
const AVAILABLE_FIELDS_CACHE_TTL_MS = 5_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeLocaleCode(value: string): string {
  return value.trim().toLowerCase();
}

function getPreferredSourceLocaleId(
  locales: LocaleOption[],
  initialSourceLocaleId?: string
): string {
  if (initialSourceLocaleId && locales.some((locale) => locale.id === initialSourceLocaleId)) {
    return initialSourceLocaleId;
  }
  return locales[0]?.id ?? '';
}

function getSourceMarketIdForLocale(params: {
  localeId: string;
  markets: MarketOption[];
  marketLocaleAssignments: MarketLocaleAssignment[];
}): string | null {
  if (!params.localeId) return null;

  for (const market of params.markets) {
    const matchesLocale = params.marketLocaleAssignments.some(
      (assignment) =>
        assignment.is_active &&
        assignment.market_id === market.id &&
        assignment.locale_id === params.localeId
    );
    if (matchesLocale) return market.id;
  }

  return null;
}

function buildAvailableFieldsRequest(params: {
  tenantSlug: string;
  productIds: string[];
  sourceLocaleId: string;
  sourceMarketId: string | null;
  sourceChannelId: string | null;
  sourceDestinationId: string | null;
}) {
  const requestBody = {
    productIds: params.productIds,
    sourceLocaleId: params.sourceLocaleId,
    sourceMarketId: params.sourceMarketId,
    sourceChannelId: params.sourceChannelId,
    sourceDestinationId: params.sourceDestinationId,
  };

  return {
    requestBody,
    cacheKey: `/api/${params.tenantSlug}/localization/available-fields::${JSON.stringify(requestBody)}`,
  };
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
  marketContextData?: TranslationPanelMarketContextData;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TranslateDialog({
  tenantSlug,
  productIds,
  open,
  onOpenChange,
  initialSourceLocaleId,
  onTranslationComplete,
  marketContextData,
}: TranslateDialogProps) {
  const contextLocales = marketContextData?.locales ?? [];
  const contextMarkets = marketContextData?.markets ?? [];
  const contextAssignments = marketContextData?.marketLocaleAssignments ?? [];
  const contextSelectedMarketId = marketContextData?.selectedMarketId ?? null;
  const contextSelectedChannelId = marketContextData?.selectedChannelId ?? null;
  const contextSelectedDestinationId = marketContextData?.selectedDestinationId ?? null;

  // Fetched data
  const [locales, setLocales] = useState<LocaleOption[]>([]);
  const [markets, setMarkets] = useState<MarketOption[]>([]);
  const [marketLocaleAssignments, setMarketLocaleAssignments] = useState<MarketLocaleAssignment[]>([]);
  const [glossaries, setGlossaries] = useState<GlossarySummary[]>([]);
  const [availableSystemFields, setAvailableSystemFields] = useState<SystemFieldOption[]>([]);
  const [productFields, setProductFields] = useState<ProductFieldOption[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [secondaryLoading, setSecondaryLoading] = useState(false);
  const [availableFieldsError, setAvailableFieldsError] = useState<string | null>(null);

  // Form
  const [resolvedSourceLocaleId, setResolvedSourceLocaleId] = useState('');
  const [selectedMarketIds, setSelectedMarketIds] = useState<string[]>([]);
  const [fieldCodes, setFieldCodes] = useState<string[]>([]);
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
      setAvailableSystemFields([]);
      setProductFields([]);
      setAvailableFieldsError(null);
      setResolvedSourceLocaleId('');
      setSelectedMarketIds([]);
      setFieldCodes([]);
      setProductFieldIds([]);
      setTargetGlossaryIdsByLocaleId({});
      setShowGlossaries(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setError(null);
    const hasContextData =
      contextLocales.length > 0 || contextMarkets.length > 0 || contextAssignments.length > 0;

    if (hasContextData) {
      setDataLoading(false);
      setLocales(contextLocales);
      setMarkets(contextMarkets);
      setMarketLocaleAssignments(contextAssignments);
      setResolvedSourceLocaleId(getPreferredSourceLocaleId(contextLocales, initialSourceLocaleId));
    } else {
      setDataLoading(true);
      fetchJsonWithDedupe<MarketContextResponse>(`/api/${tenantSlug}/market-context`, {
        ttlMs: TRANSLATION_OPTIONS_CACHE_TTL_MS,
      })
        .then((marketContextRes) => {
          if (cancelled) return;
          if (!marketContextRes.ok) throw new Error('Failed to load translation options');

          const fetchedLocales: LocaleOption[] = Array.isArray(marketContextRes.data?.locales)
            ? marketContextRes.data.locales
            : [];
          const fetchedMarkets: MarketOption[] = Array.isArray(marketContextRes.data?.markets)
            ? marketContextRes.data.markets
            : [];
          const fetchedAssignments: MarketLocaleAssignment[] = Array.isArray(
            marketContextRes.data?.marketLocales
          )
            ? marketContextRes.data.marketLocales
            : [];

          setLocales(fetchedLocales);
          setMarkets(fetchedMarkets);
          setMarketLocaleAssignments(fetchedAssignments);
          setResolvedSourceLocaleId(getPreferredSourceLocaleId(fetchedLocales, initialSourceLocaleId));
        })
        .catch((err) => {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : 'Failed to load translation options');
          }
        })
        .finally(() => {
          if (!cancelled) setDataLoading(false);
        });
    }

    fetchJsonWithDedupe<{ data?: { glossaries?: GlossarySummary[] } }>(
      `/api/${tenantSlug}/localization/glossaries`,
      {
        ttlMs: TRANSLATION_OPTIONS_CACHE_TTL_MS,
      }
    )
      .then((glossariesRes) => {
        if (cancelled) return;
        setGlossaries(glossariesRes.ok ? (glossariesRes.data?.data?.glossaries ?? []) : []);
      })
      .catch(() => { /* glossaries are non-critical, fail silently */ });

    return () => {
      cancelled = true;
    };
  }, [
    open,
    tenantSlug,
    initialSourceLocaleId,
    contextLocales,
    contextMarkets,
    contextAssignments,
  ]);

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
  const sourceMarketFromLocale = useMemo(() => {
    if (!resolvedSourceLocaleId) return null;
    return markets.find((m) =>
      (localesByMarketId.get(m.id) ?? []).some((l) => l.id === resolvedSourceLocaleId)
    ) ?? null;
  }, [markets, resolvedSourceLocaleId, localesByMarketId]);

  const sourceMarket = useMemo(() => {
    if (contextSelectedMarketId) {
      return markets.find((market) => market.id === contextSelectedMarketId) ?? sourceMarketFromLocale;
    }
    return sourceMarketFromLocale;
  }, [markets, contextSelectedMarketId, sourceMarketFromLocale]);

  const productIdsKey = useMemo(() => productIds.join(','), [productIds]);

  useEffect(() => {
    if (!open || !resolvedSourceLocaleId || !productIdsKey) return;

    let cancelled = false;
    const requestedProductIds = productIdsKey.split(',').filter(Boolean);
    setSecondaryLoading(true);
    setAvailableFieldsError(null);

    const { requestBody, cacheKey } = buildAvailableFieldsRequest({
      tenantSlug,
      productIds: requestedProductIds,
      sourceLocaleId: resolvedSourceLocaleId,
      sourceMarketId: sourceMarket?.id ?? contextSelectedMarketId,
      sourceChannelId: contextSelectedChannelId,
      sourceDestinationId: contextSelectedDestinationId,
    });

    fetchJsonWithDedupe<{ data?: { systemFields?: SystemFieldOption[]; customFields?: ProductFieldOption[] } }>(
      `/api/${tenantSlug}/localization/available-fields`,
      {
        ttlMs: AVAILABLE_FIELDS_CACHE_TTL_MS,
        cacheKey,
        requestInit: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        },
      }
    )
      .then((response) => {
        if (cancelled) return;
        if (!response.ok) {
          throw new Error('Failed to load available fields');
        }

        const payload = response.data;
        const nextSystemFields: SystemFieldOption[] = Array.isArray(payload?.data?.systemFields)
          ? payload.data.systemFields.filter(
              (field: SystemFieldOption) =>
                field && typeof field.code === 'string' && typeof field.label === 'string'
            )
          : [];
        const nextProductFields: ProductFieldOption[] = Array.isArray(payload?.data?.customFields)
          ? payload.data.customFields.filter(
              (field: ProductFieldOption) =>
                field &&
                typeof field.id === 'string' &&
                typeof field.code === 'string' &&
                typeof field.name === 'string'
            )
          : [];

        if (cancelled) return;

        setAvailableSystemFields(nextSystemFields);
        setProductFields(nextProductFields);

        const availableSystemFieldCodes = nextSystemFields.map((field) => field.code);
        const availableCustomFieldIds = new Set(nextProductFields.map((field) => field.id));

        setFieldCodes((prev) =>
          prev.length === 0
            ? availableSystemFieldCodes
            : prev.filter((code) => availableSystemFieldCodes.includes(code))
        );
        setProductFieldIds((prev) => prev.filter((id) => availableCustomFieldIds.has(id)));
      })
      .catch((err) => {
        if (cancelled) return;
        setAvailableSystemFields([]);
        setProductFields([]);
        setFieldCodes([]);
        setProductFieldIds([]);
        setAvailableFieldsError(
          err instanceof Error ? err.message : 'Failed to load translatable fields.'
        );
      })
      .finally(() => {
        if (!cancelled) setSecondaryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    open,
    tenantSlug,
    productIdsKey,
    resolvedSourceLocaleId,
    sourceMarket?.id,
    contextSelectedMarketId,
    contextSelectedChannelId,
    contextSelectedDestinationId,
  ]);

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

  useEffect(() => {
    setTargetGlossaryIdsByLocaleId((prev) => {
      let changed = false;
      const next = { ...prev };

      for (const targetLocaleId of targetLocaleIds) {
        const options = pairGlossariesByTargetLocaleId.get(targetLocaleId) ?? [];
        const current = next[targetLocaleId] ?? '';

        if (options.length === 1) {
          const onlyGlossaryId = options[0].id;
          if (current !== onlyGlossaryId) {
            next[targetLocaleId] = onlyGlossaryId;
            changed = true;
          }
          continue;
        }

        if (current && !options.some((option) => option.id === current)) {
          delete next[targetLocaleId];
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [pairGlossariesByTargetLocaleId, targetLocaleIds]);

  const customFieldOptions = useMemo<MultiSelectOption[]>(
    () => productFields.map((f) => ({ value: f.id, label: `${f.name} (${f.code})` })),
    [productFields]
  );

  const glossarySelectionLocaleIds = useMemo(
    () =>
      targetLocaleIds.filter((targetLocaleId) => {
        const options = pairGlossariesByTargetLocaleId.get(targetLocaleId) ?? [];
        return options.length > 1;
      }),
    [pairGlossariesByTargetLocaleId, targetLocaleIds]
  );

  const hasGlossaryOptions = pairGlossariesByTargetLocaleId.size > 0;
  const hasGlossaryChoices = glossarySelectionLocaleIds.length > 0;
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
          sourceMarketId: sourceMarket?.id ?? contextSelectedMarketId,
          sourceChannelId: contextSelectedChannelId,
          sourceDestinationId: contextSelectedDestinationId,
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
                <div className="space-y-2 py-1">
                  <Skeleton className="h-11 w-full rounded-md" />
                  <Skeleton className="h-4 w-28" />
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
              {secondaryLoading ? (
                <div className="rounded-lg border border-gray-200 px-4 py-3">
                  <div className="flex items-center justify-between border-b border-gray-200 pb-3">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                  <div className="space-y-3 py-3">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-5 w-44" />
                    <Skeleton className="h-5 w-36" />
                  </div>
                </div>
              ) : availableSystemFields.length > 0 ? (
                <div className="grid grid-cols-2 gap-3">
                  {availableSystemFields.map((option) => (
                    <label key={option.code} className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-input accent-primary cursor-pointer"
                        checked={fieldCodes.includes(option.code)}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setFieldCodes((prev) =>
                            checked
                              ? [...prev, option.code]
                              : prev.filter((c) => c !== option.code)
                          );
                        }}
                      />
                      <span className="text-sm text-foreground">{option.label}</span>
                    </label>
                  ))}
                </div>
              ) : productFields.length === 0 ? (
                <div
                  className={availableFieldsError ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}
                >
                  {availableFieldsError ??
                    'No translatable content fields are available for the selected products.'}
                </div>
              ) : null}
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
                  <div className="border-t border-gray-200 px-4 py-4 space-y-4">
                    {!hasGlossaryChoices ? (
                      <div className="text-sm text-muted-foreground">
                        Matching glossaries will be applied automatically for the selected locale pairs.
                      </div>
                    ) : null}
                    {glossarySelectionLocaleIds.map((targetLocaleId) => {
                      const options = pairGlossariesByTargetLocaleId.get(targetLocaleId);
                      if (!options || options.length === 0) return null;
                      const targetLocale = localeById.get(targetLocaleId);
                      return (
                        <div key={targetLocaleId} className="space-y-1.5">
                          <label className="text-xs font-medium text-muted-foreground">
                            {targetLocale ? getLocaleShortName(targetLocale.name) : targetLocaleId}
                          </label>
                          <Select
                            value={targetGlossaryIdsByLocaleId[targetLocaleId] ?? '__none__'}
                            onValueChange={(val) =>
                              setTargetGlossaryIdsByLocaleId((prev) => ({
                                ...prev,
                                [targetLocaleId]: val === '__none__' ? '' : val,
                              }))
                            }
                          >
                            <SelectTrigger className="h-9 text-sm">
                              <SelectValue placeholder="No glossary" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">No glossary</SelectItem>
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

