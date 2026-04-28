'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import NextImage from 'next/image';
import { CheckCheck, ChevronDown, ChevronUp, Languages, Package } from 'lucide-react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { Skeleton } from '@/components/ui/skeleton';
import { MultiSelect, MultiSelectOption } from '@/components/ui/multi-select';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { getLocaleShortName } from '@/lib/locale-utils';
import { toast } from '@/components/ui/toast';
import { fetchJsonWithDedupe } from '@/lib/client-request-cache';

// ─── Shared types ────────────────────────────────────────────────────────────

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

type ItemStatus =
  | 'queued' | 'generated' | 'reviewed' | 'approved'
  | 'rejected' | 'applied' | 'failed' | 'stale';

interface TranslationItem {
  id: string;
  job_id: string;
  product_id: string;
  field_code: string;
  source_value: Record<string, unknown> | null;
  suggested_value: Record<string, unknown> | null;
  edited_value: Record<string, unknown> | null;
  final_value: Record<string, unknown> | null;
  status: ItemStatus;
  target_scope: Record<string, unknown> | null;
  error_message: string | null;
  created_at?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_PRODUCTS_PER_JOB = 100;
const REVIEWABLE = new Set<ItemStatus>(['generated', 'reviewed', 'approved', 'stale']);
const TRANSLATION_OPTIONS_CACHE_TTL_MS = 60_000;
const AVAILABLE_FIELDS_CACHE_TTL_MS = 5_000;
const REVIEW_JOBS_CACHE_TTL_MS = 5_000;

const FIELD_LABELS: Record<string, string> = {
  product_name: 'Product Name',
  short_description: 'Short Description',
  long_description: 'Long Description',
  features: 'Features',
  meta_title: 'Meta Title',
  meta_description: 'Meta Description',
  keywords: 'Keywords',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeLocaleCode(value: string): string {
  return value.trim().toLowerCase();
}

function getFieldLabel(code: string) {
  return FIELD_LABELS[code] ?? code.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function extractText(value: Record<string, unknown> | null | undefined): string {
  if (!value) return '';
  if (typeof value.text === 'string') return value.text;
  return '';
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

export interface ProductInfo {
  name: string;
  thumbnailUrl?: string;
}

export interface TranslationPanelMarketContextData {
  locales: LocaleOption[];
  markets: MarketOption[];
  marketLocaleAssignments: MarketLocaleAssignment[];
  selectedMarketId?: string | null;
  selectedChannelId?: string | null;
  selectedDestinationId?: string | null;
}

export interface TranslationPanelProps {
  tenantSlug: string;
  productId: string;
  productIds: string[];
  productName?: string;
  productFamilyId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSourceLocaleId?: string;
  productInfoById?: Record<string, ProductInfo>;
  marketContextData?: TranslationPanelMarketContextData;
}

// ─── Main component ───────────────────────────────────────────────────────────

type Step = 'configure' | 'translating' | 'review';

export function TranslationPanel({
  tenantSlug,
  productId,
  productIds,
  productName,
  open,
  onOpenChange,
  initialSourceLocaleId,
  productInfoById,
  marketContextData,
}: TranslationPanelProps) {
  const contextLocales = marketContextData?.locales ?? [];
  const contextMarkets = marketContextData?.markets ?? [];
  const contextAssignments = marketContextData?.marketLocaleAssignments ?? [];
  const contextSelectedMarketId = marketContextData?.selectedMarketId ?? null;
  const contextSelectedChannelId = marketContextData?.selectedChannelId ?? null;
  const contextSelectedDestinationId = marketContextData?.selectedDestinationId ?? null;

  // ── Configure step state ──────────────────────────────────────────────────
  const [step, setStep] = useState<Step>('configure');

  const [locales, setLocales] = useState<LocaleOption[]>([]);
  const [markets, setMarkets] = useState<MarketOption[]>([]);
  const [marketLocaleAssignments, setMarketLocaleAssignments] = useState<MarketLocaleAssignment[]>([]);
  const [glossaries, setGlossaries] = useState<GlossarySummary[]>([]);
  const [availableSystemFields, setAvailableSystemFields] = useState<SystemFieldOption[]>([]);
  const [productFields, setProductFields] = useState<ProductFieldOption[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [secondaryLoading, setSecondaryLoading] = useState(false);
  const [availableFieldsError, setAvailableFieldsError] = useState<string | null>(null);

  const [resolvedSourceLocaleId, setResolvedSourceLocaleId] = useState('');
  const [selectedMarketIds, setSelectedMarketIds] = useState<string[]>([]);
  const [fieldCodes, setFieldCodes] = useState<string[]>([]);
  const [productFieldIds, setProductFieldIds] = useState<string[]>([]);
  const [targetGlossaryIdsByLocaleId, setTargetGlossaryIdsByLocaleId] = useState<Record<string, string>>({});
  const [showGlossaries, setShowGlossaries] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ── Review step state ─────────────────────────────────────────────────────
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  type JobWithItems = { job: Record<string, unknown>; items: TranslationItem[] };
  const [jobsWithItems, setJobsWithItems] = useState<JobWithItems[]>([]);
  const [reviewLocales, setReviewLocales] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [reviewMarkets, setReviewMarkets] = useState<Array<{ id: string; name: string }>>([]);
  const [editedTexts, setEditedTexts] = useState<Record<string, string>>({});

  // Selected product for left-rail navigation (future multi-product support)
  const [selectedProductId, setSelectedProductId] = useState<string>(productId);

  // ── Reset on close ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) {
      setStep('configure');
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
      setSubmitError(null);
      setJobsWithItems([]);
      setEditedTexts({});
      setReviewError(null);
      setApplying(false);
      setSelectedProductId(productId);
    }
  }, [open, productId]);

  // ── Phase 1 fetch on open ─────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

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
          if (!marketContextRes.ok) throw new Error('Failed to load locales');
          const fetchedLocales: LocaleOption[] = Array.isArray(marketContextRes.data?.locales)
            ? marketContextRes.data.locales
            : [];
          const fetchedMarkets: MarketOption[] = Array.isArray(marketContextRes.data?.markets)
            ? marketContextRes.data.markets
            : [];
          const fetchedMarketLocales: MarketLocaleAssignment[] = Array.isArray(
            marketContextRes.data?.marketLocales
          )
            ? marketContextRes.data.marketLocales
            : [];
          setLocales(fetchedLocales);
          setMarkets(fetchedMarkets);
          setMarketLocaleAssignments(fetchedMarketLocales);
          setResolvedSourceLocaleId(getPreferredSourceLocaleId(fetchedLocales, initialSourceLocaleId));
        })
        .catch((err) => {
          if (!cancelled) setSubmitError(err instanceof Error ? err.message : 'Failed to load options');
        })
        .finally(() => { if (!cancelled) setDataLoading(false); });
    }

    fetchJsonWithDedupe<{ data?: { glossaries?: GlossarySummary[] } }>(`/api/${tenantSlug}/localization/glossaries`, {
      ttlMs: TRANSLATION_OPTIONS_CACHE_TTL_MS,
    })
      .then((glossariesRes) => {
        if (cancelled) return;
        const fetchedGlossaries: GlossarySummary[] = glossariesRes.ok
          ? (glossariesRes.data?.data?.glossaries ?? [])
          : [];
        setGlossaries(fetchedGlossaries);
      })
      .catch(() => { /* non-critical */ });

    return () => { cancelled = true; };
  }, [open, tenantSlug, initialSourceLocaleId, contextLocales, contextMarkets, contextAssignments]);

  // ── Configure derived ─────────────────────────────────────────────────────
  const localeById = useMemo(() => {
    const map = new Map<string, LocaleOption>();
    for (const l of locales) map.set(l.id, l);
    return map;
  }, [locales]);

  const sourceLocale = localeById.get(resolvedSourceLocaleId);

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

  useEffect(() => {
    setTargetGlossaryIdsByLocaleId((prev) => {
      const targetSet = new Set(targetLocaleIds);
      const next: Record<string, string> = {};
      for (const [localeId, glossaryId] of Object.entries(prev)) {
        if (targetSet.has(localeId)) next[localeId] = glossaryId;
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
    !overLimit &&
    Boolean(resolvedSourceLocaleId) &&
    selectedMarketIds.length > 0 &&
    targetLocaleIds.length > 0 &&
    (fieldCodes.length > 0 || productFieldIds.length > 0) &&
    productIds.length > 0;

  // ── Submit translation job ────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitError(null);
    setStep('translating');

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

      const payload = await response.json();
      const jobId: string = payload?.data?.jobId;
      if (!jobId) throw new Error('No job ID returned');

      await loadReviewData(jobId);
      setStep('review');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Translation failed. Please try again.');
      setStep('configure');
    }
  };

  // ── Load review data for a job ────────────────────────────────────────────
  const loadReviewData = useCallback(async (jobId: string) => {
    setReviewLoading(true);
    setReviewError(null);
    try {
      const jobRes = await fetchJsonWithDedupe<{ data?: { job?: Record<string, unknown>; items?: TranslationItem[] } }>(
        `/api/${tenantSlug}/localization/jobs/${jobId}`,
        {
          ttlMs: REVIEW_JOBS_CACHE_TTL_MS,
        }
      );
      const jobData = jobRes.ok ? jobRes.data : null;

      setReviewLocales(locales.map((locale) => ({ id: locale.id, code: locale.code, name: locale.name })));
      setReviewMarkets(markets.map((market) => ({ id: market.id, name: market.name })));

      const items: TranslationItem[] = (jobData?.data?.items ?? []).filter(
        (item: TranslationItem) => productIds.includes(item.product_id)
      );

      setJobsWithItems([{ job: jobData?.data?.job ?? {}, items }]);

      const initialTexts: Record<string, string> = {};
      for (const item of items) {
        initialTexts[item.id] =
          extractText(item.edited_value) ||
          extractText(item.final_value) ||
          extractText(item.suggested_value);
      }
      setEditedTexts(initialTexts);
    } catch (err) {
      console.error('Failed to load review data:', err);
      setReviewError('Failed to load translations.');
    } finally {
      setReviewLoading(false);
    }
  }, [tenantSlug, productIds, locales, markets]);

  // ── Review derived ────────────────────────────────────────────────────────
  const localeById2 = useMemo(() => new Map(reviewLocales.map((l) => [l.id, l])), [reviewLocales]);
  const marketById = useMemo(() => new Map(reviewMarkets.map((m) => [m.id, m])), [reviewMarkets]);

  const deduplicatedItems = useMemo<TranslationItem[]>(() => {
    const allItems = jobsWithItems.flatMap((j) => j.items);
    const pending = allItems.filter((i) => REVIEWABLE.has(i.status));
    const latest = new Map<string, TranslationItem>();
    for (const item of pending) {
      const scope = item.target_scope ?? {};
      const localeId = (scope.localeId ?? scope.locale_id ?? '') as string;
      const marketId = (scope.marketId ?? scope.market_id ?? '') as string;
      const key = `${item.field_code}::${localeId}::${marketId}::${item.product_id}`;
      const existing = latest.get(key);
      if (!existing || (item.created_at ?? '') > (existing.created_at ?? '')) {
        latest.set(key, item);
      }
    }
    return [...latest.values()];
  }, [jobsWithItems]);

  // Items for the currently selected product
  const visibleItems = useMemo(
    () => deduplicatedItems.filter((i) => i.product_id === selectedProductId),
    [deduplicatedItems, selectedProductId]
  );

  // Unique product IDs in the result set (for the left rail)
  const resultProductIds = useMemo(
    () => [...new Set(deduplicatedItems.map((i) => i.product_id))],
    [deduplicatedItems]
  );

  const getScopeLabel = useCallback((item: TranslationItem) => {
    const scope = item.target_scope ?? {};
    const localeId = (scope.localeId ?? scope.locale_id ?? '') as string;
    const marketId = (scope.marketId ?? scope.market_id ?? '') as string;
    const market = marketId ? marketById.get(marketId) : null;
    const locale = localeId ? localeById2.get(localeId) : null;
    const localeName = locale ? getLocaleShortName(locale.name) : '';
    return [market?.name, localeName].filter(Boolean).join(' · ');
  }, [localeById2, marketById]);

  // ── Apply all action ──────────────────────────────────────────────────────
  const applyAll = useCallback(async () => {
    const itemsToApply = deduplicatedItems;
    if (itemsToApply.length === 0) return;
    setApplying(true);
    try {
      const byJob = new Map<string, TranslationItem[]>();
      for (const item of itemsToApply) {
        if (!byJob.has(item.job_id)) byJob.set(item.job_id, []);
        byJob.get(item.job_id)!.push(item);
      }
      for (const [jobId, items] of byJob.entries()) {
        const itemIds = items.map((i) => i.id);
        const editedValues: Record<string, string> = {};
        for (const item of items) {
          const text = (editedTexts[item.id] ?? '').trim() || extractText(item.suggested_value);
          if (text) editedValues[item.id] = text;
        }
        const approveRes = await fetch(
          `/api/${tenantSlug}/localization/jobs/${jobId}/items/bulk`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'approve', itemIds, editedValues }),
          }
        );
        if (!approveRes.ok) continue;
        await fetch(
          `/api/${tenantSlug}/localization/jobs/${jobId}/items/bulk`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'apply', itemIds }),
          }
        );
      }
      toast.success(itemsToApply.length === 1 ? 'Translation applied' : 'Translations applied');
      onOpenChange(false);
    } catch (err) {
      console.error('Apply all failed:', err);
    } finally {
      setApplying(false);
    }
  }, [tenantSlug, deduplicatedItems, editedTexts, onOpenChange]);

  // ── Render helpers ────────────────────────────────────────────────────────
  const productCountLabel = productIds.length === 1 ? '1 product' : `${productIds.length} products`;

  // ── Configure step ────────────────────────────────────────────────────────
  function renderConfigure() {
    const selectedFieldCount = fieldCodes.length + productFieldIds.length;
    const totalFieldCount = availableSystemFields.length + productFields.length;
    const allSelected = selectedFieldCount === totalFieldCount;

    const toggleAllFields = () => {
      if (allSelected) {
        setFieldCodes([]);
        setProductFieldIds([]);
      } else {
        setFieldCodes(availableSystemFields.map((field) => field.code));
        setProductFieldIds(productFields.map((f) => f.id));
      }
    };

    const toggleCoreField = (value: string) => {
      setFieldCodes((prev) =>
        prev.includes(value) ? prev.filter((c) => c !== value) : [...prev, value]
      );
    };

    const toggleCustomField = (id: string) => {
      setProductFieldIds((prev) =>
        prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
      );
    };

    return (
      <>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="max-w-lg space-y-6">
          {overLimit && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              Maximum {MAX_PRODUCTS_PER_JOB} products per run. Reduce to {MAX_PRODUCTS_PER_JOB} or fewer.
            </div>
          )}

          {!dataLoading && sourceLocale && (
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-muted-foreground">Translating from</span>
              <span className="text-sm font-medium text-foreground">
                {sourceMarket
                  ? `${sourceMarket.name} · ${getLocaleShortName(sourceLocale.name)}`
                  : getLocaleShortName(sourceLocale.name)}
              </span>
            </div>
          )}

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

          {/* Fields list */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Fields to translate</label>
            <div className="overflow-hidden rounded-lg border border-gray-200">
              {secondaryLoading ? (
                <div className="px-4 py-3">
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
              ) : (
                <>
                  {/* Header */}
                  <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2.5">
                    <span className="text-xs text-muted-foreground">
                      {selectedFieldCount} of {totalFieldCount} selected
                    </span>
                    <button
                      type="button"
                      onClick={toggleAllFields}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {allSelected ? 'Deselect all' : 'Select all'}
                    </button>
                  </div>

                  {/* Core fields */}
                  {availableSystemFields.map((field, index) => (
                    <div
                      key={field.code}
                      role="button"
                      onClick={() => toggleCoreField(field.code)}
                      className="group relative flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30"
                    >
                      {index > 0 && <div className="absolute left-4 right-4 top-0 h-px bg-gray-100" />}
                      <span className="flex-1 text-sm text-foreground">{field.label}</span>
                      <input
                        type="checkbox"
                        checked={fieldCodes.includes(field.code)}
                        onChange={() => toggleCoreField(field.code)}
                        onClick={(e) => e.stopPropagation()}
                        className="h-4 w-4 cursor-pointer rounded border-input accent-primary"
                      />
                    </div>
                  ))}
                </>
              )}

              {!secondaryLoading && totalFieldCount === 0 && (
                <div
                  className={cn(
                    'px-4 py-3 text-sm',
                    availableFieldsError ? 'text-destructive' : 'text-muted-foreground'
                  )}
                >
                  {availableFieldsError ??
                    'No translatable content fields are available for the selected products.'}
                </div>
              )}
              {!secondaryLoading && productFields.length > 0 && (
                <>
                  <div className="flex items-center border-y border-gray-200 bg-gray-50/80 px-4 py-2">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Custom fields
                    </span>
                  </div>
                  {productFields.map((field) => (
                    <div
                      key={field.id}
                      role="button"
                      onClick={() => toggleCustomField(field.id)}
                      className="group relative flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30"
                    >
                      <div className="absolute left-4 right-4 top-0 h-px bg-gray-100" />
                      <span className="flex-1 text-sm text-foreground">{field.name}</span>
                      <input
                        type="checkbox"
                        checked={productFieldIds.includes(field.id)}
                        onChange={() => toggleCustomField(field.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="h-4 w-4 cursor-pointer rounded border-input accent-primary"
                      />
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

          {!secondaryLoading && hasGlossaryOptions && (
            <div className="rounded-lg border border-border/60 bg-muted/20">
              <button
                type="button"
                onClick={() => setShowGlossaries((v) => !v)}
                className="flex w-full items-center justify-between px-4 py-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <span className="font-medium">Glossaries</span>
                {showGlossaries ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
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
                              <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
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

          {submitError && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {submitError}
            </div>
          )}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-200 px-6 py-3.5">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || dataLoading}>
            Run Translation
          </Button>
        </div>
      </>
    );
  }

  // ── Translating step ──────────────────────────────────────────────────────
  function renderTranslating() {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center px-6">
        <LoadingSkeleton size="lg" />
        <div>
          <p className="text-sm font-medium text-foreground">Translating…</p>
          <p className="text-xs text-muted-foreground mt-1">This usually takes a few seconds.</p>
        </div>
      </div>
    );
  }

  // ── Review step ───────────────────────────────────────────────────────────
  function renderReview() {
    return (
      <div className="flex flex-1 overflow-hidden">

        {/* Left product rail */}
        <div className="w-52 shrink-0 border-r border-gray-100 flex flex-col overflow-hidden bg-gray-50/50">
          <div className="px-3.5 py-2.5 border-b border-gray-100">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Products
            </span>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {reviewLoading ? (
              <div className="flex items-center justify-center py-8">
                <LoadingSkeleton size="sm" />
              </div>
            ) : resultProductIds.length === 0 ? (
              <div className="px-3.5 py-3 text-xs text-muted-foreground">No products</div>
            ) : (
              resultProductIds.map((pid) => {
                const isSelected = pid === selectedProductId;
                const itemCount = deduplicatedItems.filter((i) => i.product_id === pid).length;
                const info = productInfoById?.[pid];
                const name = info?.name ?? (pid === productId ? (productName || pid.slice(0, 8)) : pid.slice(0, 8));
                const thumbnailUrl = info?.thumbnailUrl;
                return (
                  <button
                    key={pid}
                    type="button"
                    onClick={() => setSelectedProductId(pid)}
                    className={cn(
                      'w-full text-left px-3 py-2.5 flex items-center gap-2.5 transition-colors',
                      isSelected
                        ? 'bg-white border-r-2 border-primary'
                        : 'text-muted-foreground hover:bg-white hover:text-foreground'
                    )}
                  >
                    {thumbnailUrl ? (
                      <NextImage
                        src={thumbnailUrl}
                        alt=""
                        className="h-8 w-8 rounded object-cover shrink-0"
                        width={32}
                        height={32}
                        unoptimized
                      />
                    ) : (
                      <div className="h-8 w-8 rounded bg-muted/30 flex items-center justify-center shrink-0">
                        <Package className="h-4 w-4 text-muted-foreground/40" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className={cn('text-xs font-medium truncate', isSelected ? 'text-foreground' : '')}>{name}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {itemCount} field{itemCount !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Main review area */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Shopify-style product header */}
          {(() => {
            const info = productInfoById?.[selectedProductId];
            const name = info?.name ?? (selectedProductId === productId ? productName : undefined);
            const thumbnailUrl = info?.thumbnailUrl;
            if (!name && !thumbnailUrl) return null;
            return (
              <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 bg-white shrink-0">
                {thumbnailUrl ? (
                  <NextImage
                    src={thumbnailUrl}
                    alt=""
                    className="h-12 w-12 rounded-md object-cover shrink-0"
                    width={48}
                    height={48}
                    unoptimized
                  />
                ) : (
                  <div className="h-12 w-12 rounded-md bg-muted/20 flex items-center justify-center shrink-0">
                    <Package className="h-6 w-6 text-muted-foreground/25" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 line-clamp-2">{name}</p>
                </div>
              </div>
            );
          })()}

          {/* Column headers */}
          <div className="grid grid-cols-[160px_1fr_1fr] border-b border-gray-100 bg-gray-50/30">
            <div className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Content
            </div>
            <div className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground border-l border-gray-100">
              Reference
            </div>
            <div className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground border-l border-gray-100">
              Language
            </div>
          </div>

          {/* Rows */}
          <div className="flex-1 overflow-y-auto">
            {reviewLoading && (
              <div className="flex items-center justify-center py-16">
                <LoadingSkeleton size="md" />
              </div>
            )}

            {reviewError && !reviewLoading && (
              <div className="mx-4 mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                {reviewError}
              </div>
            )}

            {!reviewLoading && !reviewError && visibleItems.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center px-6">
                <Languages className="h-8 w-8 text-muted-foreground/25 mb-3" />
                <p className="text-sm font-medium text-foreground">No pending translations</p>
                <p className="text-xs text-muted-foreground mt-1">
                  All items were applied or none were generated.
                </p>
              </div>
            )}

            {!reviewLoading && visibleItems.map((item, index) => {
              const sourceText = extractText(item.source_value);
              const scopeLabel = getScopeLabel(item);
              const isLast = index === visibleItems.length - 1;
              return (
                <div
                  key={item.id}
                  className={cn(
                    'grid grid-cols-[160px_1fr_1fr] min-h-[72px]',
                    !isLast && 'border-b border-gray-100'
                  )}
                >
                  {/* Field / Content column */}
                  <div className="px-4 py-3 flex flex-col justify-start">
                    <span className="text-xs font-medium text-foreground leading-tight">
                      {getFieldLabel(item.field_code)}
                    </span>
                    {scopeLabel && (
                      <span className="text-[11px] text-muted-foreground mt-0.5">{scopeLabel}</span>
                    )}
                  </div>

                  {/* Reference / Source column */}
                  <div className="px-4 py-3 border-l border-gray-100">
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {sourceText || <span className="italic">No source text</span>}
                    </p>
                  </div>

                  {/* Language / Translation column */}
                  <div className="px-4 py-3 border-l border-gray-100">
                    <textarea
                      value={editedTexts[item.id] ?? ''}
                      onChange={(e) =>
                        setEditedTexts((prev) => ({ ...prev, [item.id]: e.target.value }))
                      }
                      placeholder="Translation…"
                      rows={3}
                      disabled={applying}
                      className="w-full resize-none rounded-md border border-input bg-transparent px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                    />
                    {item.error_message && (
                      <p className="mt-1 text-[11px] text-red-500">{item.error_message}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-5 py-3.5">
            {deduplicatedItems.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {deduplicatedItems.length} field{deduplicatedItems.length !== 1 ? 's' : ''}
              </span>
            )}
            <Button
              size="sm"
              onClick={applyAll}
              disabled={applying || deduplicatedItems.length === 0}
            className="h-8 text-xs"
          >
            {applying
                ? <LoadingSkeleton size="sm" className="mr-1.5" />
                : <CheckCheck className="h-3.5 w-3.5 mr-1.5" />}
              Apply All
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Panel header ──────────────────────────────────────────────────────────
  function renderHeader() {
    const subtitle =
      step === 'configure'
        ? productCountLabel
        : step === 'translating'
        ? 'Running…'
        : deduplicatedItems.length > 0
        ? `${deduplicatedItems.length} field${deduplicatedItems.length !== 1 ? 's' : ''} to review`
        : 'Complete';

    const title = step === 'review' ? 'Review Translations' : 'Translate';

    return (
      <div className="flex items-center gap-3 border-b border-gray-200 px-5 py-3.5 shrink-0">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/8 shrink-0">
          <Languages className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <SheetTitle className="text-sm font-semibold text-foreground leading-none">{title}</SheetTitle>
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
        {/* Step indicator */}
        <div className="flex items-center gap-1 shrink-0">
          <span className={cn('h-1.5 w-4 rounded-full transition-colors', step === 'configure' ? 'bg-primary' : 'bg-muted-foreground/25')} />
          <span className={cn('h-1.5 rounded-full transition-colors', step === 'translating' ? 'w-4 bg-primary animate-pulse' : 'w-1.5 bg-muted-foreground/25')} />
          <span className={cn('h-1.5 w-4 rounded-full transition-colors', step === 'review' ? 'bg-primary' : 'bg-muted-foreground/25')} />
        </div>
      </div>
    );
  }

  // ── Root render ───────────────────────────────────────────────────────────
  const isBusy = step === 'translating' || applying;

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!isBusy) onOpenChange(next); }}>
      <SheetContent
        side="right"
        size="panel"
        className="flex flex-col overflow-hidden p-0 max-w-5xl"
      >
        {renderHeader()}
        {step === 'configure' && renderConfigure()}
        {step === 'translating' && renderTranslating()}
        {step === 'review' && renderReview()}
      </SheetContent>
    </Sheet>
  );
}

