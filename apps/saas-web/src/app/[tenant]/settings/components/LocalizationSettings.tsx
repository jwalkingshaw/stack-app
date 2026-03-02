'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Globe2, Languages, Loader2, RefreshCw, Sparkles, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageLoader } from '@/components/ui/loading-spinner';
import { MultiSelect, MultiSelectOption } from '@/components/ui/multi-select';
import { PageContentContainer } from '@/components/ui/page-content-container';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

interface LocalizationSettingsProps {
  tenantSlug: string;
}

interface LocaleOption {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
}

interface LocalizationSettingsData {
  organization_id: string;
  translation_enabled: boolean;
  write_assist_enabled: boolean;
  auto_create_pending_tasks_for_new_locale: boolean;
  default_source_locale_id: string | null;
  default_target_locale_ids: string[];
  deepl_glossary_id: string | null;
  brand_instructions: string;
  preferred_tone: 'neutral' | 'formal' | 'informal' | 'professional' | 'friendly';
  metadata: Record<string, unknown>;
}

interface LocalizationProviderStatus {
  key: string;
  configured: boolean;
}

interface LocalizationSettingsResponse {
  success: boolean;
  data: {
    settings: LocalizationSettingsData;
    locales: LocaleOption[];
    provider: LocalizationProviderStatus;
  };
}

interface LocalizationEligibilityResponse {
  success: boolean;
  data: {
    planId: string;
    canTranslateProduct: boolean;
    restrictions?: {
      translateProduct?: string | null;
    };
  };
}

interface LocalizationJobSummary {
  id: string;
  job_type: 'translate' | 'write_assist';
  status: string;
  estimated_chars: number;
  actual_chars: number;
  created_at: string;
  source_locale_id?: string | null;
  target_locale_ids?: string[];
  product_ids?: string[];
  error_summary?: string | null;
  item_counts?: Record<string, number>;
}

interface JobsResponse {
  success: boolean;
  data: {
    jobs: LocalizationJobSummary[];
  };
}

interface GlossarySummary {
  id: string;
  name: string;
  source_language_code: string;
  target_language_code: string;
  provider: string;
  provider_glossary_id: string | null;
  is_active: boolean;
  entry_count: number;
  updated_at: string;
}

interface GlossariesResponse {
  success: boolean;
  data: {
    glossaries: GlossarySummary[];
  };
}

interface ProductOption {
  id: string;
  sku: string | null;
  productName: string | null;
}

interface ProductsResponse {
  success: boolean;
  data: ProductOption[];
}

interface ProductFieldOption {
  id: string;
  code: string;
  name: string;
  field_type: string;
  is_translatable: boolean;
  is_write_assist_enabled: boolean;
}

interface ScopeOption {
  id: string;
  name: string;
  code?: string;
  is_active?: boolean;
}

type ItemStatus =
  | 'queued'
  | 'generated'
  | 'reviewed'
  | 'approved'
  | 'rejected'
  | 'applied'
  | 'failed'
  | 'stale';

interface TranslationJobItem {
  id: string;
  job_id: string;
  product_id: string;
  product_field_id: string | null;
  field_code: string;
  source_scope: Record<string, unknown> | null;
  target_scope: Record<string, unknown> | null;
  source_value: Record<string, unknown> | string | null;
  suggested_value: Record<string, unknown> | string | null;
  edited_value: Record<string, unknown> | string | null;
  final_value: Record<string, unknown> | string | null;
  status: ItemStatus;
  error_message: string | null;
  updated_at: string;
}

interface LocalizationJobDetail {
  job: LocalizationJobSummary;
  items: TranslationJobItem[];
}

interface LocalizationJobDetailResponse {
  success: boolean;
  data: LocalizationJobDetail;
}

type JobType = 'translate' | 'write_assist';

interface CreateJobState {
  jobType: JobType;
  executionMode: 'sync' | 'async';
  sourceLocaleId: string;
  targetLocaleIds: string[];
  productIds: string[];
  fieldCodes: string[];
  productFieldIds: string[];
  sourceMarketId: string;
  sourceChannelId: string;
  sourceDestinationId: string;
  targetMarketId: string;
  targetChannelId: string;
  targetDestinationId: string;
}

const FIELD_CODE_OPTIONS: MultiSelectOption[] = [
  { value: 'product_name', label: 'Product Name' },
  { value: 'short_description', label: 'Short Description' },
  { value: 'long_description', label: 'Long Description' },
  { value: 'features', label: 'Features / Bullets' },
  { value: 'meta_title', label: 'Meta Title' },
  { value: 'meta_description', label: 'Meta Description' },
];

const CANCELLABLE_JOB_STATUSES = new Set(['queued', 'running', 'review_required']);
const IMMUTABLE_ITEM_STATUSES = new Set<ItemStatus>(['applied', 'rejected', 'failed']);
const APPLIABLE_ITEM_STATUSES = new Set<ItemStatus>(['approved', 'reviewed', 'generated']);
const RUNNABLE_JOB_STATUSES = new Set(['queued', 'running', 'review_required']);

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '-';
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function formatChars(value: number): string {
  return new Intl.NumberFormat('en-US').format(Math.max(0, Number(value || 0)));
}

function statusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' {
  if (status === 'failed' || status === 'cancelled' || status === 'rejected') return 'destructive';
  if (status === 'review_required' || status === 'running' || status === 'queued') return 'secondary';
  return 'default';
}

function toOptionalString(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toTextValue(value: Record<string, unknown> | string | null | undefined): string {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object' && !Array.isArray(value)) {
    const textValue = value.text;
    if (typeof textValue === 'string') return textValue.trim();
  }
  return '';
}

function preferredItemText(item: TranslationJobItem): string {
  return (
    toTextValue(item.final_value) ||
    toTextValue(item.edited_value) ||
    toTextValue(item.suggested_value) ||
    toTextValue(item.source_value)
  );
}

function scopeIdFrom(scope: Record<string, unknown> | null, key: string): string | null {
  if (!scope) return null;
  const value = scope[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function fieldLabelFromCode(fieldCode: string): string {
  const match = FIELD_CODE_OPTIONS.find((option) => option.value === fieldCode);
  return match?.label || fieldCode;
}

function fieldLabelForItem(
  item: Pick<TranslationJobItem, 'field_code' | 'product_field_id'>,
  productFieldById: Map<string, ProductFieldOption>
): string {
  if (item.product_field_id) {
    const field = productFieldById.get(item.product_field_id);
    if (field) return field.name;
  }
  return fieldLabelFromCode(item.field_code);
}

export default function LocalizationSettings({ tenantSlug }: LocalizationSettingsProps) {
  const searchParams = useSearchParams();
  const prefillProductId = (searchParams.get('productId') || '').trim();
  const prefillMode = (searchParams.get('mode') || '').trim().toLowerCase();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshingJobs, setRefreshingJobs] = useState(false);
  const [refreshingGlossaries, setRefreshingGlossaries] = useState(false);
  const [creatingJob, setCreatingJob] = useState(false);
  const [creatingGlossary, setCreatingGlossary] = useState(false);
  const [loadingJobDetail, setLoadingJobDetail] = useState(false);
  const [refreshingJobDetail, setRefreshingJobDetail] = useState(false);
  const [jobActionLoading, setJobActionLoading] = useState(false);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [itemLoading, setItemLoading] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  const [locales, setLocales] = useState<LocaleOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [productFields, setProductFields] = useState<ProductFieldOption[]>([]);
  const [markets, setMarkets] = useState<ScopeOption[]>([]);
  const [channels, setChannels] = useState<ScopeOption[]>([]);
  const [destinations, setDestinations] = useState<ScopeOption[]>([]);
  const [provider, setProvider] = useState<LocalizationProviderStatus>({
    key: 'deepl',
    configured: false,
  });
  const [settings, setSettings] = useState<LocalizationSettingsData>({
    organization_id: '',
    translation_enabled: false,
    write_assist_enabled: false,
    auto_create_pending_tasks_for_new_locale: false,
    default_source_locale_id: null,
    default_target_locale_ids: [],
    deepl_glossary_id: null,
    brand_instructions: '',
    preferred_tone: 'neutral',
    metadata: {},
  });
  const [jobs, setJobs] = useState<LocalizationJobSummary[]>([]);
  const [glossaries, setGlossaries] = useState<GlossarySummary[]>([]);
  const [canTranslateProduct, setCanTranslateProduct] = useState(true);
  const [planId, setPlanId] = useState<string>('free');
  const [translateRestrictionMessage, setTranslateRestrictionMessage] = useState<string | null>(null);
  const [queryPrefillApplied, setQueryPrefillApplied] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedJobDetail, setSelectedJobDetail] = useState<LocalizationJobDetail | null>(null);
  const [itemDrafts, setItemDrafts] = useState<Record<string, string>>({});
  const [newGlossaryName, setNewGlossaryName] = useState('');
  const [newGlossarySourceLocaleId, setNewGlossarySourceLocaleId] = useState('');
  const [newGlossaryTargetLocaleId, setNewGlossaryTargetLocaleId] = useState('');
  const [newGlossaryEntriesText, setNewGlossaryEntriesText] = useState('');
  const [createProviderGlossary, setCreateProviderGlossary] = useState(true);
  const [jobForm, setJobForm] = useState<CreateJobState>({
    jobType: 'translate',
    executionMode: 'sync',
    sourceLocaleId: '',
    targetLocaleIds: [],
    productIds: [],
    fieldCodes: FIELD_CODE_OPTIONS.map((option) => option.value),
    productFieldIds: [],
    sourceMarketId: '',
    sourceChannelId: '',
    sourceDestinationId: '',
    targetMarketId: '',
    targetChannelId: '',
    targetDestinationId: '',
  });

  const localeById = useMemo(() => {
    const map = new Map<string, LocaleOption>();
    for (const locale of locales) {
      map.set(locale.id, locale);
    }
    return map;
  }, [locales]);

  const productById = useMemo(() => {
    const map = new Map<string, ProductOption>();
    for (const product of products) {
      map.set(product.id, product);
    }
    return map;
  }, [products]);

  const marketById = useMemo(() => {
    const map = new Map<string, ScopeOption>();
    for (const market of markets) {
      map.set(market.id, market);
    }
    return map;
  }, [markets]);

  const channelById = useMemo(() => {
    const map = new Map<string, ScopeOption>();
    for (const channel of channels) {
      map.set(channel.id, channel);
    }
    return map;
  }, [channels]);

  const destinationById = useMemo(() => {
    const map = new Map<string, ScopeOption>();
    for (const destination of destinations) {
      map.set(destination.id, destination);
    }
    return map;
  }, [destinations]);

  const productFieldById = useMemo(() => {
    const map = new Map<string, ProductFieldOption>();
    for (const field of productFields) {
      map.set(field.id, field);
    }
    return map;
  }, [productFields]);

  const productOptions = useMemo<MultiSelectOption[]>(
    () =>
      products.map((product) => ({
        value: product.id,
        label: `${product.productName || 'Untitled product'}${product.sku ? ` (${product.sku})` : ''}`,
      })),
    [products]
  );

  const localeOptions = useMemo<MultiSelectOption[]>(
    () =>
      locales.map((locale) => ({
        value: locale.id,
        label: `${locale.name} (${locale.code})`,
      })),
    [locales]
  );

  const targetLocaleOptions = useMemo(
    () => localeOptions.filter((locale) => locale.value !== jobForm.sourceLocaleId),
    [jobForm.sourceLocaleId, localeOptions]
  );

  const customFieldOptions = useMemo<MultiSelectOption[]>(
    () =>
      productFields
        .filter((field) => field.is_translatable || field.is_write_assist_enabled)
        .map((field) => ({
          value: field.id,
          label: `${field.name} (${field.code})`,
        })),
    [productFields]
  );

  const fetchSettings = useCallback(async () => {
    const response = await fetch(`/api/${tenantSlug}/localization/settings`);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || 'Failed to load localization settings');
    }

    const payload = (await response.json()) as LocalizationSettingsResponse;
    setSettings(payload.data.settings);
    setLocales(payload.data.locales || []);
    setProvider(payload.data.provider || { key: 'deepl', configured: false });
    setJobForm((prev) => ({
      ...prev,
      sourceLocaleId:
        prev.sourceLocaleId ||
        payload.data.settings.default_source_locale_id ||
        payload.data.locales[0]?.id ||
        '',
      targetLocaleIds:
        prev.targetLocaleIds.length > 0
          ? prev.targetLocaleIds
          : (payload.data.settings.default_target_locale_ids || []).filter(
              (localeId) => localeId !== payload.data.settings.default_source_locale_id
            ),
    }));
  }, [tenantSlug]);

  const fetchJobs = useCallback(async () => {
    const response = await fetch(`/api/${tenantSlug}/localization/jobs?limit=10`);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || 'Failed to load localization jobs');
    }

    const payload = (await response.json()) as JobsResponse;
    setJobs(payload.data.jobs || []);
  }, [tenantSlug]);

  const fetchGlossaries = useCallback(async () => {
    const response = await fetch(`/api/${tenantSlug}/localization/glossaries`);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || 'Failed to load translation glossaries');
    }

    const payload = (await response.json()) as GlossariesResponse;
    setGlossaries(payload.data.glossaries || []);
  }, [tenantSlug]);

  const fetchProducts = useCallback(async () => {
    const response = await fetch(`/api/${tenantSlug}/products/basic`);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || 'Failed to load products');
    }

    const payload = (await response.json()) as ProductsResponse;
    setProducts(Array.isArray(payload.data) ? payload.data : []);
  }, [tenantSlug]);

  const fetchProductFields = useCallback(async () => {
    const response = await fetch(`/api/${tenantSlug}/product-fields`);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || 'Failed to load product fields');
    }

    const payload = (await response.json()) as ProductFieldOption[];
    const normalized = (Array.isArray(payload) ? payload : []).filter(
      (field) =>
        field &&
        typeof field.id === 'string' &&
        typeof field.code === 'string' &&
        typeof field.name === 'string'
    );
    setProductFields(normalized);
  }, [tenantSlug]);

  const fetchScopeOptions = useCallback(async () => {
    const [marketsResponse, channelsResponse, destinationsResponse] = await Promise.all([
      fetch(`/api/${tenantSlug}/markets`),
      fetch(`/api/${tenantSlug}/channels`),
      fetch(`/api/${tenantSlug}/destinations`),
    ]);

    if (!marketsResponse.ok) {
      const payload = await marketsResponse.json().catch(() => ({}));
      throw new Error(payload.error || 'Failed to load markets');
    }
    if (!channelsResponse.ok) {
      const payload = await channelsResponse.json().catch(() => ({}));
      throw new Error(payload.error || 'Failed to load channels');
    }
    if (!destinationsResponse.ok) {
      const payload = await destinationsResponse.json().catch(() => ({}));
      throw new Error(payload.error || 'Failed to load destinations');
    }

    const [marketsPayload, channelsPayload, destinationsPayload] = (await Promise.all([
      marketsResponse.json(),
      channelsResponse.json(),
      destinationsResponse.json(),
    ])) as [ScopeOption[], ScopeOption[], ScopeOption[]];

    setMarkets(Array.isArray(marketsPayload) ? marketsPayload : []);
    setChannels(Array.isArray(channelsPayload) ? channelsPayload : []);
    setDestinations(Array.isArray(destinationsPayload) ? destinationsPayload : []);
  }, [tenantSlug]);

  const fetchJobDetail = useCallback(
    async (jobId: string) => {
      const response = await fetch(`/api/${tenantSlug}/localization/jobs/${jobId}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to load localization job detail');
      }

      const payload = (await response.json()) as LocalizationJobDetailResponse;
      const detail = payload.data;
      setSelectedJobDetail(detail);
      setItemDrafts(() =>
        (detail.items || []).reduce(
          (acc, item) => {
            acc[item.id] = preferredItemText(item);
            return acc;
          },
          {} as Record<string, string>
        )
      );
    },
    [tenantSlug]
  );

  const fetchEligibility = useCallback(async () => {
    const response = await fetch(`/api/${tenantSlug}/localization/eligibility`);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || 'Failed to load localization eligibility');
    }

    const payload = (await response.json()) as LocalizationEligibilityResponse;
    setCanTranslateProduct(Boolean(payload.data.canTranslateProduct));
    setPlanId(payload.data.planId || 'free');
    setTranslateRestrictionMessage(payload.data.restrictions?.translateProduct || null);
  }, [tenantSlug]);

  const refreshAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setSaveNotice(null);
      await Promise.all([
        fetchSettings(),
        fetchJobs(),
        fetchProducts(),
        fetchProductFields(),
        fetchScopeOptions(),
        fetchEligibility(),
      ]);
      await fetchGlossaries();
    } catch (fetchError) {
      console.error('Failed to load localization settings page:', fetchError);
      setError(fetchError instanceof Error ? fetchError.message : 'Failed to load localization settings');
    } finally {
      setLoading(false);
    }
  }, [fetchEligibility, fetchGlossaries, fetchJobs, fetchProductFields, fetchProducts, fetchScopeOptions, fetchSettings]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    if (queryPrefillApplied) return;
    if (!prefillProductId && prefillMode !== 'translate') return;
    if (!loading && prefillProductId && products.length > 0 && !products.some((product) => product.id === prefillProductId)) {
      setQueryPrefillApplied(true);
      return;
    }
    if (loading) return;

    setJobForm((prev) => {
      const nextProductIds =
        prefillProductId && products.some((product) => product.id === prefillProductId)
          ? Array.from(new Set([prefillProductId, ...prev.productIds]))
          : prev.productIds;

      const requestedTranslateMode = prefillMode === 'translate' && canTranslateProduct;
      return {
        ...prev,
        jobType: requestedTranslateMode ? 'translate' : prev.jobType,
        productIds: nextProductIds,
      };
    });

    if (prefillMode === 'translate' && !canTranslateProduct && translateRestrictionMessage) {
      setError(translateRestrictionMessage);
    }
    setQueryPrefillApplied(true);
  }, [
    canTranslateProduct,
    loading,
    prefillMode,
    prefillProductId,
    products,
    queryPrefillApplied,
    translateRestrictionMessage,
  ]);

  useEffect(() => {
    if (canTranslateProduct) return;
    setJobForm((prev) => (prev.jobType === 'translate' ? { ...prev, jobType: 'write_assist' } : prev));
  }, [canTranslateProduct]);

  const toggleTargetLocale = (localeId: string) => {
    setSaveNotice(null);
    setSettings((prev) => {
      const existing = new Set(prev.default_target_locale_ids || []);
      if (existing.has(localeId)) {
        existing.delete(localeId);
      } else {
        existing.add(localeId);
      }
      return {
        ...prev,
        default_target_locale_ids: Array.from(existing),
      };
    });
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSaveNotice(null);

      const response = await fetch(`/api/${tenantSlug}/localization/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          translationEnabled: settings.translation_enabled,
          writeAssistEnabled: settings.write_assist_enabled,
          autoCreatePendingTasksForNewLocale: settings.auto_create_pending_tasks_for_new_locale,
          defaultSourceLocaleId: settings.default_source_locale_id,
          defaultTargetLocaleIds: settings.default_target_locale_ids,
          deeplGlossaryId: settings.deepl_glossary_id,
          brandInstructions: settings.brand_instructions,
          preferredTone: settings.preferred_tone,
          metadata: settings.metadata || {},
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to save localization settings');
      }

      await fetchSettings();
      setSaveNotice('Localization settings saved.');
    } catch (saveError) {
      console.error('Failed to save localization settings:', saveError);
      setError(saveError instanceof Error ? saveError.message : 'Failed to save localization settings');
    } finally {
      setSaving(false);
    }
  };

  const handleRefreshJobs = async () => {
    try {
      setRefreshingJobs(true);
      setError(null);
      await fetchJobs();
    } catch (jobsError) {
      console.error('Failed to refresh localization jobs:', jobsError);
      setError(jobsError instanceof Error ? jobsError.message : 'Failed to refresh localization jobs');
    } finally {
      setRefreshingJobs(false);
    }
  };

  const handleRefreshGlossaries = async () => {
    try {
      setRefreshingGlossaries(true);
      setError(null);
      await fetchGlossaries();
    } catch (glossaryError) {
      console.error('Failed to refresh translation glossaries:', glossaryError);
      setError(glossaryError instanceof Error ? glossaryError.message : 'Failed to refresh translation glossaries');
    } finally {
      setRefreshingGlossaries(false);
    }
  };

  const parseGlossaryEntries = (raw: string): Array<{ sourceTerm: string; targetTerm: string }> => {
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        const [sourceTerm, targetTerm] = line.split('\t');
        return {
          sourceTerm: (sourceTerm || '').trim(),
          targetTerm: (targetTerm || '').trim(),
        };
      })
      .filter((entry) => entry.sourceTerm.length > 0 && entry.targetTerm.length > 0);
  };

  const handleCreateGlossary = async () => {
    if (!newGlossaryName.trim()) {
      setError('Glossary name is required.');
      return;
    }
    if (!newGlossarySourceLocaleId || !newGlossaryTargetLocaleId) {
      setError('Select source and target locales for the glossary.');
      return;
    }
    const parsedEntries = parseGlossaryEntries(newGlossaryEntriesText);
    if (parsedEntries.length === 0) {
      setError('Add at least one glossary term pair using "source<TAB>target" format.');
      return;
    }

    try {
      setCreatingGlossary(true);
      setError(null);

      const response = await fetch(`/api/${tenantSlug}/localization/glossaries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newGlossaryName.trim(),
          sourceLocaleId: newGlossarySourceLocaleId,
          targetLocaleId: newGlossaryTargetLocaleId,
          entries: parsedEntries,
          createProviderGlossary,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to create glossary');
      }

      await fetchGlossaries();
      setSaveNotice('Glossary created.');
      setNewGlossaryName('');
      setNewGlossaryEntriesText('');
      setNewGlossarySourceLocaleId('');
      setNewGlossaryTargetLocaleId('');
    } catch (createError) {
      console.error('Failed to create glossary:', createError);
      setError(createError instanceof Error ? createError.message : 'Failed to create glossary');
    } finally {
      setCreatingGlossary(false);
    }
  };

  const handleSelectJob = async (jobId: string) => {
    try {
      setSelectedJobId(jobId);
      setLoadingJobDetail(true);
      setError(null);
      await fetchJobDetail(jobId);
    } catch (jobError) {
      console.error('Failed to load localization job detail:', jobError);
      setError(jobError instanceof Error ? jobError.message : 'Failed to load localization job detail');
    } finally {
      setLoadingJobDetail(false);
    }
  };

  const handleRefreshSelectedJob = async () => {
    if (!selectedJobId) return;
    try {
      setRefreshingJobDetail(true);
      setError(null);
      await Promise.all([fetchJobs(), fetchJobDetail(selectedJobId)]);
    } catch (jobError) {
      console.error('Failed to refresh localization job detail:', jobError);
      setError(jobError instanceof Error ? jobError.message : 'Failed to refresh localization job detail');
    } finally {
      setRefreshingJobDetail(false);
    }
  };

  const handleCreateJob = async () => {
    if (!jobForm.sourceLocaleId) {
      setError('Select a source locale before creating a job.');
      return;
    }
    if (jobForm.jobType === 'translate' && !canTranslateProduct) {
      setError(
        translateRestrictionMessage ||
          `Translate this product is disabled on ${planId}. Upgrade to continue.`
      );
      return;
    }
    if (jobForm.productIds.length === 0) {
      setError('Select at least one product for the job.');
      return;
    }
    if (jobForm.fieldCodes.length === 0 && jobForm.productFieldIds.length === 0) {
      setError('Select at least one system field or custom field to generate localization content.');
      return;
    }
    if (jobForm.jobType === 'translate' && jobForm.targetLocaleIds.length === 0) {
      setError('Select at least one target locale for translation jobs.');
      return;
    }

    try {
      setCreatingJob(true);
      setError(null);
      setSaveNotice(null);

      const response = await fetch(`/api/${tenantSlug}/localization/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobType: jobForm.jobType,
          sourceLocaleId: jobForm.sourceLocaleId,
          targetLocaleIds: jobForm.jobType === 'translate' ? jobForm.targetLocaleIds : [],
          productIds: jobForm.productIds,
          fieldCodes: jobForm.fieldCodes,
          productFieldIds: jobForm.productFieldIds,
          executionMode: jobForm.executionMode,
          sourceMarketId: toOptionalString(jobForm.sourceMarketId),
          sourceChannelId: toOptionalString(jobForm.sourceChannelId),
          sourceDestinationId: toOptionalString(jobForm.sourceDestinationId),
          targetMarketId: toOptionalString(jobForm.targetMarketId),
          targetChannelId: toOptionalString(jobForm.targetChannelId),
          targetDestinationId: toOptionalString(jobForm.targetDestinationId),
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to create localization job');
      }

      const payload = (await response.json()) as {
        success: boolean;
        data?: {
          jobId: string;
          status?: string;
          executionMode?: 'sync' | 'async';
          generatedItems: number;
          failedItems: number;
        };
      };

      const createdJobId = payload.data?.jobId;
      setSaveNotice(
        createdJobId
          ? payload.data?.status === 'queued'
            ? 'Localization job queued. Click Run when ready.'
            : `Localization job created (${payload.data?.generatedItems || 0} generated, ${payload.data?.failedItems || 0} failed).`
          : 'Localization job created.'
      );

      await fetchJobs();
      if (createdJobId) {
        await handleSelectJob(createdJobId);
      }
    } catch (createError) {
      console.error('Failed to create localization job:', createError);
      setError(createError instanceof Error ? createError.message : 'Failed to create localization job');
    } finally {
      setCreatingJob(false);
    }
  };

  const runItemAction = async (itemId: string, action: 'edit' | 'approve' | 'reject') => {
    if (!selectedJobId) return;
    const editedText = (itemDrafts[itemId] || '').trim();
    if ((action === 'edit' || action === 'approve') && !editedText) {
      setError('Edited value is required before editing or approving an item.');
      return;
    }

    try {
      setItemLoading((prev) => ({ ...prev, [itemId]: true }));
      setError(null);

      const response = await fetch(`/api/${tenantSlug}/localization/jobs/${selectedJobId}/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:
          action === 'reject'
            ? JSON.stringify({ action })
            : JSON.stringify({ action, editedValue: { text: editedText } }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `Failed to ${action} localization item`);
      }

      await Promise.all([fetchJobs(), fetchJobDetail(selectedJobId)]);
    } catch (actionError) {
      console.error(`Failed to ${action} localization item:`, actionError);
      setError(actionError instanceof Error ? actionError.message : `Failed to ${action} localization item`);
    } finally {
      setItemLoading((prev) => ({ ...prev, [itemId]: false }));
    }
  };

  const handleApplyItem = async (itemId: string) => {
    if (!selectedJobId) return;
    try {
      setItemLoading((prev) => ({ ...prev, [itemId]: true }));
      setError(null);
      const response = await fetch(`/api/${tenantSlug}/localization/jobs/${selectedJobId}/items/${itemId}/apply`, {
        method: 'POST',
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to apply localization item');
      }

      await Promise.all([fetchJobs(), fetchJobDetail(selectedJobId)]);
    } catch (applyError) {
      console.error('Failed to apply localization item:', applyError);
      setError(applyError instanceof Error ? applyError.message : 'Failed to apply localization item');
    } finally {
      setItemLoading((prev) => ({ ...prev, [itemId]: false }));
    }
  };

  const handleCancelJob = async (jobId: string) => {
    try {
      setJobActionLoading(true);
      setError(null);
      const response = await fetch(`/api/${tenantSlug}/localization/jobs/${jobId}/cancel`, {
        method: 'POST',
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to cancel localization job');
      }

      await fetchJobs();
      if (selectedJobId === jobId) {
        await fetchJobDetail(jobId);
      }
      setSaveNotice('Localization job cancelled.');
    } catch (cancelError) {
      console.error('Failed to cancel localization job:', cancelError);
      setError(cancelError instanceof Error ? cancelError.message : 'Failed to cancel localization job');
    } finally {
      setJobActionLoading(false);
    }
  };

  const handleRunJob = async (jobId: string) => {
    try {
      setJobActionLoading(true);
      setError(null);
      const response = await fetch(`/api/${tenantSlug}/localization/jobs/${jobId}/run`, {
        method: 'POST',
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to run localization job');
      }
      await fetchJobs();
      if (selectedJobId === jobId) {
        await fetchJobDetail(jobId);
      }
      setSaveNotice('Localization job executed.');
    } catch (runError) {
      console.error('Failed to run localization job:', runError);
      setError(runError instanceof Error ? runError.message : 'Failed to run localization job');
    } finally {
      setJobActionLoading(false);
    }
  };

  const runBulkAction = async (action: 'approve' | 'reject' | 'apply') => {
    if (!selectedJobId || selectedItems.length === 0) return;
    try {
      setBulkActionLoading(true);
      setError(null);
      const editedValues =
        action === 'approve'
          ? selectedItems.reduce(
              (acc, item) => {
                acc[item.id] = itemDrafts[item.id] ?? preferredItemText(item);
                return acc;
              },
              {} as Record<string, string>
            )
          : undefined;

      const response = await fetch(`/api/${tenantSlug}/localization/jobs/${selectedJobId}/items/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          itemIds: selectedItems.map((item) => item.id),
          editedValues,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `Failed to ${action} items`);
      }

      const payload = (await response.json()) as {
        data?: { successCount?: number; failureCount?: number };
      };
      await Promise.all([fetchJobs(), fetchJobDetail(selectedJobId)]);
      setSaveNotice(
        `Bulk ${action} completed (${payload.data?.successCount || 0} succeeded, ${payload.data?.failureCount || 0} failed).`
      );
    } catch (bulkError) {
      console.error(`Failed to run bulk ${action}:`, bulkError);
      setError(bulkError instanceof Error ? bulkError.message : `Failed to ${action} items`);
    } finally {
      setBulkActionLoading(false);
    }
  };

  const scopeLabelForItem = useCallback(
    (scope: Record<string, unknown> | null) => {
      const localeId = scopeIdFrom(scope, 'localeId');
      const marketId = scopeIdFrom(scope, 'marketId');
      const channelId = scopeIdFrom(scope, 'channelId');
      const destinationId = scopeIdFrom(scope, 'destinationId');

      const locale = localeId ? localeById.get(localeId) : null;
      const market = marketId ? marketById.get(marketId) : null;
      const channel = channelId ? channelById.get(channelId) : null;
      const destination = destinationId ? destinationById.get(destinationId) : null;

      const chunks: string[] = [];
      if (locale) chunks.push(`${locale.name} (${locale.code})`);
      if (market) chunks.push(market.name);
      if (channel) chunks.push(channel.name);
      if (destination) chunks.push(destination.name);
      return chunks.length > 0 ? chunks.join(' • ') : 'Global';
    },
    [channelById, destinationById, localeById, marketById]
  );

  const selectedJob = selectedJobDetail?.job || null;
  const selectedItems = selectedJobDetail?.items || [];
  const selectedItemCounts = useMemo(
    () =>
      selectedItems.reduce(
        (acc, item) => {
          acc[item.status] = (acc[item.status] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      ),
    [selectedItems]
  );

  if (loading) {
    return (
      <div className="h-full bg-background">
        <PageLoader text="Loading localization..." size="lg" />
      </div>
    );
  }

  return (
    <PageContentContainer mode="content" className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Localization</h1>
          <p className="text-sm text-muted-foreground">
            Configure translation defaults, Write Assist, and review recent localization jobs.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refreshAll} disabled={loading}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {saveNotice && (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {saveNotice}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Provider</CardTitle>
          <CardDescription>Current machine translation provider status for this workspace.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-md border border-border/60 p-2">
              <Globe2 className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <div className="text-sm font-medium uppercase tracking-wide">{provider.key}</div>
              <div className="text-xs text-muted-foreground">Server-side only. API key is never exposed to clients.</div>
            </div>
          </div>
          <Badge variant={provider.configured ? 'default' : 'destructive'}>
            {provider.configured ? 'Configured' : 'Not configured'}
          </Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Workspace Localization Defaults</CardTitle>
          <CardDescription>These settings apply to new translation jobs and locale onboarding behavior.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-md border border-border/60 p-3">
              <div>
                <div className="text-sm font-medium">Enable Translation</div>
                <div className="text-xs text-muted-foreground">Allow translation job creation and DeepL generation.</div>
              </div>
              <Switch
                checked={settings.translation_enabled}
                onCheckedChange={(checked) =>
                  setSettings((prev) => ({ ...prev, translation_enabled: Boolean(checked) }))
                }
              />
            </div>

            <div className="flex items-center justify-between rounded-md border border-border/60 p-3">
              <div>
                <div className="text-sm font-medium">Enable Write Assist</div>
                <div className="text-xs text-muted-foreground">
                  Allow creation of field-level copy improvement suggestions.
                </div>
              </div>
              <Switch
                checked={settings.write_assist_enabled}
                onCheckedChange={(checked) =>
                  setSettings((prev) => ({ ...prev, write_assist_enabled: Boolean(checked) }))
                }
              />
            </div>

            <div className="flex items-center justify-between rounded-md border border-border/60 p-3">
              <div>
                <div className="text-sm font-medium">Auto-create pending tasks for new locales</div>
                <div className="text-xs text-muted-foreground">
                  Creates pending translation tasks when a new market locale is introduced.
                </div>
              </div>
              <Switch
                checked={settings.auto_create_pending_tasks_for_new_locale}
                onCheckedChange={(checked) =>
                  setSettings((prev) => ({
                    ...prev,
                    auto_create_pending_tasks_for_new_locale: Boolean(checked),
                  }))
                }
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="text-sm font-medium">Default Source Locale</div>
              <Select
                value={settings.default_source_locale_id || '__none__'}
                onValueChange={(value) =>
                  setSettings((prev) => ({
                    ...prev,
                    default_source_locale_id: value === '__none__' ? null : value,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select source locale" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {locales.map((locale) => (
                    <SelectItem key={locale.id} value={locale.id}>
                      {locale.name} ({locale.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Default Target Locales</div>
              <div className="grid max-h-56 gap-2 overflow-auto rounded-md border border-border/60 p-2">
                {locales.map((locale) => {
                  const checked = settings.default_target_locale_ids.includes(locale.id);
                  return (
                    <label
                      key={locale.id}
                      className="flex cursor-pointer items-center justify-between rounded border border-border/50 px-3 py-2 text-sm hover:bg-muted/30"
                    >
                      <span className="truncate">
                        {locale.name} ({locale.code})
                      </span>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleTargetLocale(locale.id)}
                        className="h-4 w-4 rounded border-input"
                      />
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="text-sm font-medium">Preferred Brand Tone</div>
              <Select
                value={settings.preferred_tone}
                onValueChange={(value) =>
                  setSettings((prev) => ({
                    ...prev,
                    preferred_tone:
                      value === 'formal' ||
                      value === 'informal' ||
                      value === 'professional' ||
                      value === 'friendly'
                        ? value
                        : 'neutral',
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select preferred tone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="neutral">Neutral</SelectItem>
                  <SelectItem value="formal">Formal</SelectItem>
                  <SelectItem value="informal">Informal</SelectItem>
                  <SelectItem value="professional">Professional</SelectItem>
                  <SelectItem value="friendly">Friendly</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Default DeepL Glossary ID</div>
              <Select
                value={settings.deepl_glossary_id || '__none__'}
                onValueChange={(value) =>
                  setSettings((prev) => ({
                    ...prev,
                    deepl_glossary_id: value === '__none__' ? null : value,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {glossaries
                    .filter((glossary) => glossary.provider_glossary_id)
                    .map((glossary) => (
                      <SelectItem
                        key={glossary.id}
                        value={glossary.provider_glossary_id || glossary.id}
                      >
                        {glossary.name} ({glossary.source_language_code}{" -> "}{glossary.target_language_code})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <div className="text-xs text-muted-foreground">
                Used as the default glossary for translation and Write Assist jobs.
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">Brand Instructions</div>
            <Textarea
              value={settings.brand_instructions || ''}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  brand_instructions: event.target.value,
                }))
              }
              placeholder="Example: Keep tone premium and concise. Never use slang. Emphasize clinical efficacy and compliance-safe claims."
              rows={5}
            />
            <div className="text-xs text-muted-foreground">
              This guidance is injected into translation context and also used to infer DeepL Write tone/style.
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Localization Settings'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Glossaries</CardTitle>
              <CardDescription>
                Create and manage tenant glossaries for brand-safe terminology in translation and Write Assist.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={handleRefreshGlossaries} disabled={refreshingGlossaries}>
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshingGlossaries ? 'animate-spin' : ''}`} />
              Refresh Glossaries
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 rounded-md border border-border/60 p-3 md:grid-cols-2">
            <div className="space-y-2">
              <div className="text-sm font-medium">Glossary Name</div>
              <Input
                value={newGlossaryName}
                onChange={(event) => setNewGlossaryName(event.target.value)}
                placeholder="Brand terms EN -> ES"
              />
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">Create DeepL Provider Glossary</div>
              <div className="flex items-center justify-between rounded-md border border-border/60 p-2">
                <span className="text-xs text-muted-foreground">
                  If enabled, calls DeepL glossary API and stores `provider_glossary_id`.
                </span>
                <Switch checked={createProviderGlossary} onCheckedChange={(checked) => setCreateProviderGlossary(Boolean(checked))} />
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">Source Locale</div>
              <Select value={newGlossarySourceLocaleId || '__none__'} onValueChange={(value) => setNewGlossarySourceLocaleId(value === '__none__' ? '' : value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select source locale" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Select...</SelectItem>
                  {locales.map((locale) => (
                    <SelectItem key={locale.id} value={locale.id}>
                      {locale.name} ({locale.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">Target Locale</div>
              <Select value={newGlossaryTargetLocaleId || '__none__'} onValueChange={(value) => setNewGlossaryTargetLocaleId(value === '__none__' ? '' : value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select target locale" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Select...</SelectItem>
                  {locales
                    .filter((locale) => locale.id !== newGlossarySourceLocaleId)
                    .map((locale) => (
                      <SelectItem key={locale.id} value={locale.id}>
                        {locale.name} ({locale.code})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <div className="text-sm font-medium">Glossary Terms</div>
              <Textarea
                value={newGlossaryEntriesText}
                onChange={(event) => setNewGlossaryEntriesText(event.target.value)}
                rows={6}
                placeholder={'Use one pair per line with tab separator:\ncreatine\tcreatina\nserving size\ttamano de porcion'}
              />
              <div className="text-xs text-muted-foreground">
                Format: source term [TAB] target term. One entry per line.
              </div>
            </div>
            <div className="md:col-span-2 flex justify-end">
              <Button onClick={handleCreateGlossary} disabled={creatingGlossary}>
                {creatingGlossary ? 'Creating glossary...' : 'Create Glossary'}
              </Button>
            </div>
          </div>

          {glossaries.length === 0 ? (
            <div className="rounded-md border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
              No glossaries yet.
            </div>
          ) : (
            <div className="space-y-2">
              {glossaries.map((glossary) => (
                <div key={glossary.id} className="rounded-md border border-border/60 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium">{glossary.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {glossary.source_language_code}{" -> "}{glossary.target_language_code} - {glossary.entry_count} terms
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={glossary.is_active ? 'default' : 'secondary'}>
                        {glossary.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                      {glossary.provider_glossary_id ? (
                        <Badge variant="secondary">DeepL linked</Badge>
                      ) : (
                        <Badge variant="destructive">No provider id</Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Create Localization Job</CardTitle>
          <CardDescription>
            Queue translation or Write Assist generation for selected products and fields.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <div className="text-sm font-medium">Job Type</div>
              <Select
                value={jobForm.jobType}
                onValueChange={(value) =>
                  setJobForm((prev) => ({
                    ...prev,
                    jobType:
                      value === 'write_assist'
                        ? 'write_assist'
                        : canTranslateProduct
                        ? 'translate'
                        : 'write_assist',
                    targetLocaleIds:
                      value === 'write_assist' ? [] : prev.targetLocaleIds.filter((id) => id !== prev.sourceLocaleId),
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="translate" disabled={!canTranslateProduct}>
                    Translation {!canTranslateProduct ? '(Not available on Starter)' : ''}
                  </SelectItem>
                  <SelectItem value="write_assist">Write Assist</SelectItem>
                </SelectContent>
              </Select>
              {!canTranslateProduct && (
                <div className="text-xs text-muted-foreground">
                  {translateRestrictionMessage || 'Translation is unavailable on the Starter plan.'}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Execution</div>
              <Select
                value={jobForm.executionMode}
                onValueChange={(value) =>
                  setJobForm((prev) => ({
                    ...prev,
                    executionMode: value === 'async' ? 'async' : 'sync',
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sync">Run now (sync)</SelectItem>
                  <SelectItem value="async">Queue for worker (async)</SelectItem>
                </SelectContent>
              </Select>
              <div className="text-xs text-muted-foreground">
                Async queues job creation and requires Run to generate item suggestions.
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="text-sm font-medium">Source Locale</div>
              <Select
                value={jobForm.sourceLocaleId || '__none__'}
                onValueChange={(value) =>
                  setJobForm((prev) => ({
                    ...prev,
                    sourceLocaleId: value === '__none__' ? '' : value,
                    targetLocaleIds: prev.targetLocaleIds.filter((id) => id !== value),
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select source locale" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Select...</SelectItem>
                  {locales.map((locale) => (
                    <SelectItem key={locale.id} value={locale.id}>
                      {locale.name} ({locale.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Target Locales</div>
              <MultiSelect
                options={targetLocaleOptions}
                value={jobForm.targetLocaleIds}
                onChange={(value) => setJobForm((prev) => ({ ...prev, targetLocaleIds: value }))}
                placeholder={
                  jobForm.jobType === 'translate'
                    ? 'Select target locales'
                    : 'Write Assist uses source locale'
                }
                disabled={jobForm.jobType !== 'translate'}
                maxVisibleChips={4}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="text-sm font-medium">Products</div>
              <MultiSelect
                options={productOptions}
                value={jobForm.productIds}
                onChange={(value) => setJobForm((prev) => ({ ...prev, productIds: value }))}
                placeholder="Select products"
                maxVisibleChips={5}
              />
              <div className="text-xs text-muted-foreground">
                Selected {jobForm.productIds.length} of {products.length} active products.
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Fields</div>
              <MultiSelect
                options={FIELD_CODE_OPTIONS}
                value={jobForm.fieldCodes}
                onChange={(value) => setJobForm((prev) => ({ ...prev, fieldCodes: value }))}
                placeholder="Select fields"
                maxVisibleChips={6}
              />
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">Custom Fields</div>
              <MultiSelect
                options={customFieldOptions}
                value={jobForm.productFieldIds}
                onChange={(value) => setJobForm((prev) => ({ ...prev, productFieldIds: value }))}
                placeholder="Select translatable custom fields"
                maxVisibleChips={6}
              />
              <div className="text-xs text-muted-foreground">
                {customFieldOptions.length} translatable custom fields available.
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-md border border-border/60 p-3">
            <div className="text-sm font-medium">Optional Scope Mapping</div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <div className="text-xs font-medium uppercase text-muted-foreground">Source Market</div>
                <Select
                  value={jobForm.sourceMarketId || '__none__'}
                  onValueChange={(value) =>
                    setJobForm((prev) => ({ ...prev, sourceMarketId: value === '__none__' ? '' : value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {markets.map((market) => (
                      <SelectItem key={market.id} value={market.id}>
                        {market.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <div className="text-xs font-medium uppercase text-muted-foreground">Source Channel</div>
                <Select
                  value={jobForm.sourceChannelId || '__none__'}
                  onValueChange={(value) =>
                    setJobForm((prev) => ({ ...prev, sourceChannelId: value === '__none__' ? '' : value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {channels.map((channel) => (
                      <SelectItem key={channel.id} value={channel.id}>
                        {channel.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <div className="text-xs font-medium uppercase text-muted-foreground">Source Destination</div>
                <Select
                  value={jobForm.sourceDestinationId || '__none__'}
                  onValueChange={(value) =>
                    setJobForm((prev) => ({ ...prev, sourceDestinationId: value === '__none__' ? '' : value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {destinations.map((destination) => (
                      <SelectItem key={destination.id} value={destination.id}>
                        {destination.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <div className="text-xs font-medium uppercase text-muted-foreground">Target Market</div>
                <Select
                  value={jobForm.targetMarketId || '__none__'}
                  onValueChange={(value) =>
                    setJobForm((prev) => ({ ...prev, targetMarketId: value === '__none__' ? '' : value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {markets.map((market) => (
                      <SelectItem key={market.id} value={market.id}>
                        {market.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <div className="text-xs font-medium uppercase text-muted-foreground">Target Channel</div>
                <Select
                  value={jobForm.targetChannelId || '__none__'}
                  onValueChange={(value) =>
                    setJobForm((prev) => ({ ...prev, targetChannelId: value === '__none__' ? '' : value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {channels.map((channel) => (
                      <SelectItem key={channel.id} value={channel.id}>
                        {channel.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <div className="text-xs font-medium uppercase text-muted-foreground">Target Destination</div>
                <Select
                  value={jobForm.targetDestinationId || '__none__'}
                  onValueChange={(value) =>
                    setJobForm((prev) => ({ ...prev, targetDestinationId: value === '__none__' ? '' : value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {destinations.map((destination) => (
                      <SelectItem key={destination.id} value={destination.id}>
                        {destination.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground">
              {jobForm.jobType === 'translate'
                ? 'Translation generates suggestions per target locale and requires review/apply.'
                : 'Write Assist improves source copy and keeps locale scoped to the source locale.'}
            </div>
            <Button onClick={handleCreateJob} disabled={creatingJob}>
              {creatingJob ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Localization Job'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Recent Jobs</CardTitle>
              <CardDescription>Latest translation and Write Assist jobs for this workspace.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={handleRefreshJobs} disabled={refreshingJobs}>
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshingJobs ? 'animate-spin' : ''}`} />
              Refresh Jobs
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <div className="rounded-md border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
              No localization jobs yet.
            </div>
          ) : (
            <div className="space-y-2">
              {jobs.map((job) => {
                const generatedCount = Number(job.item_counts?.generated || 0);
                const failedCount = Number(job.item_counts?.failed || 0);
                const isSelected = selectedJobId === job.id;
                return (
                  <div
                    key={job.id}
                    className={`rounded-md border p-3 ${isSelected ? 'border-primary/60 bg-primary/5' : 'border-border/60'}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant={statusBadgeVariant(job.status)}>{job.status}</Badge>
                          <span className="text-sm font-medium">
                            {job.job_type === 'translate' ? (
                              <span className="inline-flex items-center gap-1">
                                <Languages className="h-4 w-4" />
                                Translation
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1">
                                <Sparkles className="h-4 w-4" />
                                Write Assist
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Created {formatDateTime(job.created_at)}
                        </div>
                        {job.error_summary ? (
                          <div className="text-xs text-destructive">{job.error_summary}</div>
                        ) : null}
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                        <div>
                          <div className="text-muted-foreground">Estimated</div>
                          <div className="font-medium">{formatChars(job.estimated_chars)}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Actual</div>
                          <div className="font-medium">{formatChars(job.actual_chars)}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Generated</div>
                          <div className="font-medium">{formatChars(generatedCount)}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Failed</div>
                          <div className="font-medium">{formatChars(failedCount)}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant={isSelected ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => handleSelectJob(job.id)}
                        >
                          {isSelected ? 'Viewing' : 'Open Review'}
                        </Button>
                        {RUNNABLE_JOB_STATUSES.has(job.status) ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRunJob(job.id)}
                            disabled={jobActionLoading}
                          >
                            Run
                          </Button>
                        ) : null}
                        {CANCELLABLE_JOB_STATUSES.has(job.status) ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCancelJob(job.id)}
                            disabled={jobActionLoading}
                          >
                            Cancel
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedJobId && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>Job Review</CardTitle>
                <CardDescription>
                  Review, edit, approve, reject, and apply generated values for job {selectedJobId}.
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={handleRefreshSelectedJob} disabled={refreshingJobDetail}>
                <RefreshCw className={`mr-2 h-4 w-4 ${refreshingJobDetail ? 'animate-spin' : ''}`} />
                Refresh Detail
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingJobDetail && !selectedJob ? (
              <div className="flex items-center gap-2 rounded-md border border-border/60 p-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading job detail...
              </div>
            ) : selectedJob ? (
              <>
                <div className="grid gap-3 rounded-md border border-border/60 p-3 text-xs md:grid-cols-5">
                  <div>
                    <div className="text-muted-foreground">Job Type</div>
                    <div className="font-medium">
                      {selectedJob.job_type === 'translate' ? 'Translation' : 'Write Assist'}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Status</div>
                    <div className="font-medium">{selectedJob.status}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Source Locale</div>
                    <div className="font-medium">
                      {selectedJob.source_locale_id
                        ? `${localeById.get(selectedJob.source_locale_id)?.name || selectedJob.source_locale_id}`
                        : 'N/A'}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Targets</div>
                    <div className="font-medium">
                      {(selectedJob.target_locale_ids || [])
                        .map((id) => localeById.get(id)?.name || id)
                        .join(', ') || 'N/A'}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Items</div>
                    <div className="font-medium">{selectedItems.length}</div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded-md border border-border/60 px-2 py-1">
                    Generated: {selectedItemCounts.generated || 0}
                  </span>
                  <span className="rounded-md border border-border/60 px-2 py-1">
                    Reviewed: {selectedItemCounts.reviewed || 0}
                  </span>
                  <span className="rounded-md border border-border/60 px-2 py-1">
                    Approved: {selectedItemCounts.approved || 0}
                  </span>
                  <span className="rounded-md border border-border/60 px-2 py-1">
                    Applied: {selectedItemCounts.applied || 0}
                  </span>
                  <span className="rounded-md border border-border/60 px-2 py-1">
                    Rejected: {selectedItemCounts.rejected || 0}
                  </span>
                  <span className="rounded-md border border-border/60 px-2 py-1">
                    Failed: {selectedItemCounts.failed || 0}
                  </span>
                  <span className="rounded-md border border-border/60 px-2 py-1">
                    Stale: {selectedItemCounts.stale || 0}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => runBulkAction('approve')}
                    disabled={bulkActionLoading || selectedItems.length === 0}
                  >
                    {bulkActionLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Bulk Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => runBulkAction('reject')}
                    disabled={bulkActionLoading || selectedItems.length === 0}
                  >
                    Bulk Reject
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => runBulkAction('apply')}
                    disabled={bulkActionLoading || selectedItems.length === 0}
                  >
                    Bulk Apply
                  </Button>
                </div>

                {selectedItems.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
                    No items found for this job.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedItems.map((item) => {
                      const isLoadingItem = Boolean(itemLoading[item.id]);
                      const currentDraft = itemDrafts[item.id] ?? preferredItemText(item);
                      const sourceText = toTextValue(item.source_value);
                      const suggestedText = toTextValue(item.suggested_value);
                      const canMutate = !IMMUTABLE_ITEM_STATUSES.has(item.status);
                      const canApply =
                        APPLIABLE_ITEM_STATUSES.has(item.status) &&
                        preferredItemText(item).trim().length > 0 &&
                        !isLoadingItem;

                      return (
                        <div key={item.id} className="space-y-3 rounded-md border border-border/60 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <Badge variant={statusBadgeVariant(item.status)}>{item.status}</Badge>
                                <span className="text-sm font-medium">
                                  {fieldLabelForItem(item, productFieldById)}
                                </span>
                                {item.status === 'applied' ? (
                                  <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    Applied
                                  </span>
                                ) : null}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Product:{' '}
                                {productById.get(item.product_id)?.productName ||
                                  productById.get(item.product_id)?.sku ||
                                  item.product_id}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Target Scope: {scopeLabelForItem(item.target_scope)}
                              </div>
                            </div>
                            <div className="text-xs text-muted-foreground">Updated {formatDateTime(item.updated_at)}</div>
                          </div>

                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-1">
                              <div className="text-xs font-medium uppercase text-muted-foreground">Source</div>
                              <div className="min-h-16 rounded-md border border-border/60 bg-muted/20 p-2 text-xs">
                                {sourceText || '-'}
                              </div>
                            </div>
                            <div className="space-y-1">
                              <div className="text-xs font-medium uppercase text-muted-foreground">Suggested</div>
                              <div className="min-h-16 rounded-md border border-border/60 bg-muted/20 p-2 text-xs">
                                {suggestedText || '-'}
                              </div>
                            </div>
                          </div>

                          <div className="space-y-1">
                            <div className="text-xs font-medium uppercase text-muted-foreground">Review Edit</div>
                            <Textarea
                              value={currentDraft}
                              onChange={(event) =>
                                setItemDrafts((prev) => ({
                                  ...prev,
                                  [item.id]: event.target.value,
                                }))
                              }
                              disabled={!canMutate || isLoadingItem}
                              className="min-h-20"
                            />
                          </div>

                          {item.error_message ? (
                            <div className="flex items-center gap-1 text-xs text-destructive">
                              <XCircle className="h-3.5 w-3.5" />
                              {item.error_message}
                            </div>
                          ) : null}

                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => runItemAction(item.id, 'edit')}
                              disabled={!canMutate || isLoadingItem}
                            >
                              {isLoadingItem ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                              Save Edit
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => runItemAction(item.id, 'approve')}
                              disabled={!canMutate || isLoadingItem}
                            >
                              {isLoadingItem ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => runItemAction(item.id, 'reject')}
                              disabled={!canMutate || isLoadingItem}
                            >
                              Reject
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => handleApplyItem(item.id)} disabled={!canApply}>
                              Apply
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-md border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
                Choose a job to review.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {settings.default_source_locale_id && (
        <div className="text-xs text-muted-foreground">
          Source locale: {localeById.get(settings.default_source_locale_id)?.name || settings.default_source_locale_id}
        </div>
      )}
    </PageContentContainer>
  );
}
