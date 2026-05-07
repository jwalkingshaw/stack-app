'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, ChevronLeft, Languages, RefreshCw, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ItemList } from '@/components/ui/item-list';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { PageSkeleton } from '@/components/ui/loading-skeleton';
import type { MultiSelectOption } from '@/components/ui/multi-select';
import { SettingsContentBoundary, SettingsSecondLevelPage } from './settings-page-content';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { getLocaleShortName } from '@/lib/locale-utils';

interface LocalizationSettingsProps {
  tenantSlug: string;
  focusOverride?: 'locales' | 'adaptation' | 'glossaries' | 'jobs';
  showBackLink?: boolean;
}

interface LocaleOption {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
}

interface ManagedLocaleOption extends LocaleOption {
  display_name?: string;
  is_default?: boolean;
  market_count?: number;
  field_value_count?: number;
  glossary_count?: number;
  job_count?: number;
  linked_to_market?: boolean;
  used_in_product_content?: boolean;
}

interface LocaleCatalogEntry {
  code: string;
  name: string;
  sort_order?: number;
}

interface LocalizationSettingsData {
  organization_id: string;
  translation_enabled: boolean;
  write_assist_enabled: boolean;
  deepl_glossary_id: string | null;
  brand_instructions: string;
  preferred_tone: 'neutral' | 'formal' | 'informal' | 'professional' | 'friendly';
  default_locale_id?: string | null;
  metadata: Record<string, unknown>;
}

interface LocalizationSettingsResponse {
  success: boolean;
  data: {
    settings: LocalizationSettingsData;
    locales: LocaleOption[];
  };
}

interface ReferenceDataResponse {
  locale_catalog?: LocaleCatalogEntry[];
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

function statusBadgeVariant(status: string): 'success' | 'warning' | 'error' | 'info' | 'neutral' {
  if (status === 'failed' || status === 'cancelled' || status === 'rejected') return 'error';
  if (status === 'review_required') return 'warning';
  if (status === 'running' || status === 'queued') return 'info';
  if (status === 'completed' || status === 'applied') return 'success';
  return 'neutral';
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

function localeDisplayName(locale: Pick<ManagedLocaleOption, 'display_name' | 'name'>): string {
  return locale.display_name || locale.name;
}

function localeUsageSummary(locale: ManagedLocaleOption): string {
  const chunks: string[] = [];
  if ((locale.field_value_count || 0) > 0) {
    chunks.push(`${locale.field_value_count} field values`);
  }
  if ((locale.market_count || 0) > 0) {
    chunks.push(`${locale.market_count} markets`);
  }
  if ((locale.glossary_count || 0) > 0) {
    chunks.push(`${locale.glossary_count} glossaries`);
  }
  if ((locale.job_count || 0) > 0) {
    chunks.push(`${locale.job_count} jobs`);
  }
  return chunks.join(' • ') || 'No active references';
}

export default function LocalizationSettings({
  tenantSlug,
  focusOverride,
  showBackLink = true,
}: LocalizationSettingsProps) {
  const searchParams = useSearchParams();
  const queryFocus = (searchParams.get('focus') || '').trim().toLowerCase();
  const focusSection = (focusOverride || queryFocus) as 'locales' | 'adaptation' | 'glossaries' | 'jobs' | '';
  const isLocalesFocus = focusSection === 'locales';
  const isAdaptationFocus = focusSection === 'adaptation';
  const isGlossariesFocus = focusSection === 'glossaries';
  const isJobsFocus = focusSection === 'jobs';
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshingJobs, setRefreshingJobs] = useState(false);
  const [refreshingGlossaries, setRefreshingGlossaries] = useState(false);
  const [creatingGlossary, setCreatingGlossary] = useState(false);
  const [localeActionLoading, setLocaleActionLoading] = useState(false);
  const [loadingJobDetail, setLoadingJobDetail] = useState(false);
  const [refreshingJobDetail, setRefreshingJobDetail] = useState(false);
  const [jobActionLoading, setJobActionLoading] = useState(false);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [itemLoading, setItemLoading] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  const [locales, setLocales] = useState<LocaleOption[]>([]);
  const [managedLocales, setManagedLocales] = useState<ManagedLocaleOption[]>([]);
  const [localeCatalog, setLocaleCatalog] = useState<LocaleCatalogEntry[]>([]);
  const [newLocaleCode, setNewLocaleCode] = useState('');
  const [showAddLocaleDialog, setShowAddLocaleDialog] = useState(false);
  const [markets, setMarkets] = useState<ScopeOption[]>([]);
  const [channels, setChannels] = useState<ScopeOption[]>([]);
  const [destinations, setDestinations] = useState<ScopeOption[]>([]);
  const [settings, setSettings] = useState<LocalizationSettingsData>({
    organization_id: '',
    translation_enabled: false,
    write_assist_enabled: false,
    deepl_glossary_id: null,
    brand_instructions: '',
    preferred_tone: 'neutral',
    default_locale_id: null,
    metadata: {},
  });
  const [jobs, setJobs] = useState<LocalizationJobSummary[]>([]);
  const [glossaries, setGlossaries] = useState<GlossarySummary[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedJobDetail, setSelectedJobDetail] = useState<LocalizationJobDetail | null>(null);
  const [itemDrafts, setItemDrafts] = useState<Record<string, string>>({});
  const [newGlossaryName, setNewGlossaryName] = useState('');
  const [newGlossarySourceLocaleId, setNewGlossarySourceLocaleId] = useState('');
  const [newGlossaryTargetLocaleId, setNewGlossaryTargetLocaleId] = useState('');
  const [newGlossaryEntriesText, setNewGlossaryEntriesText] = useState('');
  const [productFields, setProductFields] = useState<ProductFieldOption[]>([]);
  const [jobMetadataLoading, setJobMetadataLoading] = useState(false);
  const jobMetadataReadyRef = useRef(false);
  const jobMetadataRequestRef = useRef<Promise<void> | null>(null);

  const localeById = useMemo(() => {
    const map = new Map<string, LocaleOption>();
    for (const locale of locales) {
      map.set(locale.id, locale);
    }
    return map;
  }, [locales]);

  const localeCatalogByCode = useMemo(() => {
    const map = new Map<string, LocaleCatalogEntry>();
    for (const locale of localeCatalog) {
      map.set(locale.code.toLowerCase(), locale);
    }
    return map;
  }, [localeCatalog]);

  const availableLocaleCatalogEntries = useMemo(() => {
    const activeCodes = new Set(
      managedLocales.filter((locale) => locale.is_active).map((locale) => locale.code.toLowerCase())
    );
    return localeCatalog.filter((locale) => !activeCodes.has(locale.code.toLowerCase()));
  }, [localeCatalog, managedLocales]);

  const visibleManagedLocales = useMemo(() => {
    return [...managedLocales].sort((left, right) => {
      const leftDefault = left.is_default ? 1 : 0;
      const rightDefault = right.is_default ? 1 : 0;
      if (leftDefault !== rightDefault) return rightDefault - leftDefault;

      const leftActive = left.is_active ? 1 : 0;
      const rightActive = right.is_active ? 1 : 0;
      if (leftActive !== rightActive) return rightActive - leftActive;

      return localeDisplayName(left).localeCompare(localeDisplayName(right));
    });
  }, [managedLocales]);

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

  const fetchSettings = useCallback(async () => {
    const response = await fetch(`/api/${tenantSlug}/localization/settings`);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || 'Failed to load localization settings');
    }

    const payload = (await response.json()) as LocalizationSettingsResponse;
    setSettings(payload.data.settings);
    setLocales(payload.data.locales || []);
  }, [tenantSlug]);

  const fetchManagedLocales = useCallback(async () => {
    const response = await fetch(`/api/${tenantSlug}/locales?includeInactive=1&includeUsage=1`);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || 'Failed to load organization locales');
    }

    const payload = (await response.json()) as ManagedLocaleOption[];
    setManagedLocales(Array.isArray(payload) ? payload : []);
  }, [tenantSlug]);

  const fetchLocaleCatalog = useCallback(async () => {
    const response = await fetch(`/api/${tenantSlug}/settings/reference-data`);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || 'Failed to load locale catalog');
    }

    const payload = (await response.json()) as ReferenceDataResponse;
    setLocaleCatalog(Array.isArray(payload.locale_catalog) ? payload.locale_catalog : []);
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
    const response = await fetch(`/api/${tenantSlug}/market-context`);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || 'Failed to load localization scope options');
    }

    const payload = await response.json().catch(() => ({}));
    setMarkets(Array.isArray(payload?.markets) ? payload.markets : []);
    setChannels(Array.isArray(payload?.channels) ? payload.channels : []);
    setDestinations(Array.isArray(payload?.destinations) ? payload.destinations : []);
  }, [tenantSlug]);

  const ensureJobMetadata = useCallback(async () => {
    if (jobMetadataReadyRef.current) return;
    if (jobMetadataRequestRef.current) {
      await jobMetadataRequestRef.current;
      return;
    }

    const request = (async () => {
      try {
        setJobMetadataLoading(true);
        await Promise.all([fetchProductFields(), fetchScopeOptions()]);
        jobMetadataReadyRef.current = true;
      } catch (metadataError) {
        console.error('Failed to load localization job metadata:', metadataError);
      } finally {
        setJobMetadataLoading(false);
      }
    })();

    jobMetadataRequestRef.current = request;
    try {
      await request;
    } finally {
      jobMetadataRequestRef.current = null;
    }
  }, [fetchProductFields, fetchScopeOptions]);

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

  const refreshAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setSaveNotice(null);

      const tasks: Array<Promise<unknown>> = [
        fetchSettings(),
        fetchManagedLocales(),
        fetchLocaleCatalog(),
        fetchGlossaries(),
      ];
      if (!isGlossariesFocus) {
        tasks.push(fetchJobs());
      }
      await Promise.all(tasks);
      if (!isGlossariesFocus) {
        void ensureJobMetadata();
      }
    } catch (fetchError) {
      console.error('Failed to load localization settings page:', fetchError);
      setError(fetchError instanceof Error ? fetchError.message : 'Failed to load localization settings');
    } finally {
      setLoading(false);
    }
  }, [
    fetchJobs,
    fetchGlossaries,
    fetchSettings,
    fetchLocaleCatalog,
    fetchManagedLocales,
    ensureJobMetadata,
    isGlossariesFocus,
  ]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    jobMetadataReadyRef.current = false;
    jobMetadataRequestRef.current = null;
    setProductFields([]);
    setManagedLocales([]);
    setLocaleCatalog([]);
    setMarkets([]);
    setChannels([]);
    setDestinations([]);
  }, [tenantSlug]);

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
          deeplGlossaryId: settings.deepl_glossary_id,
          brandInstructions: settings.brand_instructions,
          preferredTone: settings.preferred_tone,
          defaultLocaleId: settings.default_locale_id,
          metadata: settings.metadata || {},
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to save localization settings');
      }

      await Promise.all([fetchSettings(), fetchManagedLocales()]);
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
      void ensureJobMetadata();
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

  const handleActivateLocaleFromCatalog = useCallback(async () => {
    if (!newLocaleCode) return;
    const catalogEntry = localeCatalogByCode.get(newLocaleCode.toLowerCase());
    const localeName = catalogEntry?.name || newLocaleCode;

    try {
      setLocaleActionLoading(true);
      setError(null);
      setSaveNotice(null);

      const response = await fetch(`/api/${tenantSlug}/locales`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: newLocaleCode,
          name: localeName,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to activate locale');
      }

      await Promise.all([fetchManagedLocales(), fetchSettings()]);
      setNewLocaleCode('');
      setShowAddLocaleDialog(false);
      setSaveNotice(`${localeName} is now available for locale-first authoring.`);
    } catch (localeError) {
      console.error('Failed to activate locale:', localeError);
      setError(localeError instanceof Error ? localeError.message : 'Failed to activate locale');
    } finally {
      setLocaleActionLoading(false);
    }
  }, [fetchManagedLocales, fetchSettings, localeCatalogByCode, newLocaleCode, tenantSlug]);

  const handleLocaleStateChange = useCallback(
    async (locale: ManagedLocaleOption, action: 'activate' | 'deactivate' | 'set-default') => {
      try {
        setLocaleActionLoading(true);
        setError(null);
        setSaveNotice(null);

        if (action === 'deactivate') {
          const warningChunks: string[] = [];
          if ((locale.field_value_count || 0) > 0) {
            warningChunks.push(`${locale.field_value_count} field values`);
          }
          if ((locale.market_count || 0) > 0) {
            warningChunks.push(`${locale.market_count} markets`);
          }
          if ((locale.glossary_count || 0) > 0) {
            warningChunks.push(`${locale.glossary_count} glossaries`);
          }
          if ((locale.job_count || 0) > 0) {
            warningChunks.push(`${locale.job_count} jobs`);
          }
          if (warningChunks.length > 0) {
            const confirmed = window.confirm(
              `${localeDisplayName(locale)} is still referenced by ${warningChunks.join(', ')}. Deactivate it anyway?`
            );
            if (!confirmed) {
              setLocaleActionLoading(false);
              return;
            }
          }
        }

        const response = await fetch(`/api/${tenantSlug}/locales`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            action === 'set-default'
              ? { localeId: locale.id, isDefault: true }
              : { localeId: locale.id, isActive: action === 'activate' }
          ),
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || 'Failed to update locale');
        }

        await Promise.all([fetchManagedLocales(), fetchSettings()]);
        setSaveNotice(
          action === 'set-default'
            ? `${localeDisplayName(locale)} is now the default locale.`
            : action === 'activate'
              ? `${localeDisplayName(locale)} reactivated.`
              : `${localeDisplayName(locale)} deactivated.`
        );
      } catch (localeError) {
        console.error('Failed to update locale state:', localeError);
        setError(localeError instanceof Error ? localeError.message : 'Failed to update locale');
      } finally {
        setLocaleActionLoading(false);
      }
    },
    [fetchManagedLocales, fetchSettings, tenantSlug]
  );

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
          createProviderGlossary: true,
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
      void ensureJobMetadata();
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
      if (localeId) chunks.push(locale ? getLocaleShortName(locale.name) : localeId);
      if (marketId) chunks.push(market?.name || marketId);
      if (channelId) chunks.push(channel?.name || channelId);
      if (destinationId) chunks.push(destination?.name || destinationId);
      return chunks.length > 0 ? chunks.join(' • ') : 'Global';
    },
    [channelById, destinationById, localeById, marketById]
  );

  const selectedJob = selectedJobDetail?.job || null;
  const selectedItems = useMemo(() => selectedJobDetail?.items ?? [], [selectedJobDetail?.items]);
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
  const showConfigSection = !focusSection || isLocalesFocus || isAdaptationFocus;
  const showLocalesSection = !focusSection || isLocalesFocus;
  const showAdaptationSection = !focusSection || isAdaptationFocus;
  const showGlossariesSection = !focusSection || isGlossariesFocus;
  const showJobsSection = !focusSection || isJobsFocus;
  const visibleJobs = useMemo(
    () => jobs.filter((job) => job.job_type === 'translate'),
    [jobs]
  );

  if (loading) {
    return (
      <div className="h-full bg-background">
        <PageSkeleton text="Loading localization..." size="lg" variant="settings-detail" />
      </div>
    );
  }

  return (
    <SettingsSecondLevelPage
      page="localization"
      backLink={
        showBackLink ? (
          <Link
            href={`/${tenantSlug}/settings/localization`}
            className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            <span>Localization</span>
          </Link>
        ) : null
      }
    >
      <SettingsContentBoundary size="md" className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            {isGlossariesFocus ? 'Glossaries' : isJobsFocus ? 'Translation Activity' : 'Localization'}
          </h1>
        </div>
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

      {showConfigSection ? (
        <>
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-foreground">Locale-First Setup</h2>
            <p className="text-xs text-muted-foreground">Manage organization locales and the baseline content rules used across authoring and syndication.</p>
          </div>

          {showLocalesSection ? (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Locales</CardTitle>
                  <CardDescription>
                    Localization is the source of truth for active organization locales. Locales power adaptation, not just translation.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="text-xs text-muted-foreground">
                  Add a locale once and it becomes reusable across Product Detail and Syndication.
                </div>

                <ItemList
                  items={visibleManagedLocales}
                  getKey={(locale) => locale.id}
                  renderTitle={(locale) => (
                    <div className="flex flex-wrap items-center gap-2">
                      <span>{localeDisplayName(locale)}</span>
                      <span className="text-xs font-normal text-muted-foreground">{locale.code}</span>
                    </div>
                  )}
                  renderSubtitle={(locale) => localeUsageSummary(locale)}
                  renderRight={(locale) => {
                    return (
                      <div className="flex flex-wrap items-center gap-2">
                        {locale.is_default ? <Badge variant="success">Default</Badge> : null}
                        {locale.is_active && !locale.is_default ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={localeActionLoading}
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleLocaleStateChange(locale, 'set-default');
                            }}
                          >
                            Set default
                          </Button>
                        ) : null}
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={locale.is_active}
                            disabled={localeActionLoading || (locale.is_default && locale.is_active)}
                            onCheckedChange={(checked) => {
                              void handleLocaleStateChange(locale, checked ? 'activate' : 'deactivate');
                            }}
                          />
                        </div>
                      </div>
                    );
                  }}
                  emptyMessage="No locales match this filter."
                  showIndicator={false}
                  headerLabel="locale entries"
                  onCreate={() => {
                    setError(null);
                    setSaveNotice(null);
                    setShowAddLocaleDialog(true);
                  }}
                  createLabel="Add locale"
                />
              </CardContent>
            </Card>
          ) : null}

          <Dialog
            open={showAddLocaleDialog}
            onOpenChange={(open) => {
              if (localeActionLoading) return;
              setShowAddLocaleDialog(open);
              if (!open) {
                setNewLocaleCode('');
              }
            }}
          >
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Add Locale</DialogTitle>
                <DialogDescription>
                  Activate a locale for this organization. It will then be available anywhere locale versions can be added.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="text-sm font-medium">Locale</div>
                  <Select value={newLocaleCode || '__none__'} onValueChange={(value) => setNewLocaleCode(value === '__none__' ? '' : value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select locale from catalog" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Select...</SelectItem>
                      {availableLocaleCatalogEntries.map((locale) => (
                        <SelectItem key={locale.code} value={locale.code}>
                          {locale.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowAddLocaleDialog(false);
                      setNewLocaleCode('');
                    }}
                    disabled={localeActionLoading}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleActivateLocaleFromCatalog}
                    disabled={localeActionLoading || !newLocaleCode || availableLocaleCatalogEntries.length === 0}
                  >
                    {localeActionLoading ? 'Adding...' : 'Add locale'}
                  </Button>
                </div>
                {availableLocaleCatalogEntries.length === 0 ? (
                  <div className="text-xs text-muted-foreground">
                    All catalog locales are already active for this organization.
                  </div>
                ) : null}
              </div>
            </DialogContent>
          </Dialog>

          {showAdaptationSection ? (
            <Card>
              <CardHeader>
                <CardTitle>Adaptation Defaults</CardTitle>
                <CardDescription>Shared defaults for locale adaptation across this workspace.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
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
                    This guidance is used to steer AI adaptation and rewrite behavior after translation.
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button onClick={handleSave} disabled={saving}>
                    {saving ? 'Saving...' : 'Save Localization Settings'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : null}

      {showGlossariesSection ? (
        <>
          <div id="localization-glossaries" className="space-y-1">
            <h2 className="text-base font-semibold text-foreground">Terminology</h2>
            <p className="text-xs text-muted-foreground">Glossaries used to keep translated copy on brand.</p>
          </div>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Glossaries</CardTitle>
                <CardDescription>
                  Create and manage terminology by locale pair. In most cases you will have one glossary per source and target locale.
                </CardDescription>
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
              <div className="text-sm font-medium">Source Locale</div>
              <Select value={newGlossarySourceLocaleId || '__none__'} onValueChange={(value) => setNewGlossarySourceLocaleId(value === '__none__' ? '' : value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select source locale" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Select...</SelectItem>
                  {locales.map((locale) => (
                    <SelectItem key={locale.id} value={locale.id}>
                      {getLocaleShortName(locale.name)}
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
                        {getLocaleShortName(locale.name)}
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
                        {glossary.source_language_code}{" -> "}{glossary.target_language_code} · {glossary.entry_count} terms
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={glossary.is_active ? 'success' : 'neutral'}>
                        {glossary.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
            </CardContent>
          </Card>
        </>
      ) : null}

      {showJobsSection ? (
        <>
          <div id="localization-jobs" className="space-y-1">
            <h2 className="text-base font-semibold text-foreground">Activity</h2>
            <p className="text-xs text-muted-foreground">Track translation runs and review outputs.</p>
          </div>

          <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Recent Runs</CardTitle>
              <CardDescription>Latest translation runs for this workspace.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={handleRefreshJobs} disabled={refreshingJobs}>
              {refreshingJobs ? <LoadingSkeleton size="sm" className="mr-2" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Refresh Runs
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {jobMetadataLoading ? (
            <div className="mb-3 text-xs text-muted-foreground">Loading field and scope labels...</div>
          ) : null}
          {visibleJobs.length === 0 ? (
            <div className="rounded-md border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
              No translation runs yet.
            </div>
          ) : (
            <div className="space-y-2">
              {visibleJobs.map((job) => {
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
                            <span className="inline-flex items-center gap-1">
                              <Languages className="h-4 w-4" />
                              Translation
                            </span>
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
                {refreshingJobDetail ? <LoadingSkeleton size="sm" className="mr-2" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Refresh Detail
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingJobDetail && !selectedJob ? (
              <div className="flex items-center gap-2 rounded-md border border-border/60 p-4 text-sm text-muted-foreground">
                <LoadingSkeleton size="sm" />
                Loading job detail...
              </div>
            ) : selectedJob ? (
              <>
                <div className="grid gap-3 rounded-md border border-border/60 p-3 text-xs md:grid-cols-5">
                  <div>
                    <div className="text-muted-foreground">Job Type</div>
                    <div className="font-medium">Translation</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Status</div>
                    <div className="font-medium">{selectedJob.status}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Source Language</div>
                    <div className="font-medium">
                      {selectedJob.source_locale_id
                        ? getLocaleShortName(localeById.get(selectedJob.source_locale_id)?.name || selectedJob.source_locale_id)
                        : 'N/A'}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Target Languages</div>
                    <div className="font-medium">
                      {(selectedJob.target_locale_ids || [])
                        .map((id) => getLocaleShortName(localeById.get(id)?.name || id))
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
                    {bulkActionLoading ? <LoadingSkeleton size="sm" className="mr-2" /> : null}
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
                                Product: {item.product_id}
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
                              {isLoadingItem ? <LoadingSkeleton size="sm" className="mr-2" /> : null}
                              Save Edit
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => runItemAction(item.id, 'approve')}
                              disabled={!canMutate || isLoadingItem}
                            >
                              {isLoadingItem ? <LoadingSkeleton size="sm" className="mr-2" /> : null}
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
        </>
      ) : null}
      </SettingsContentBoundary>
    </SettingsSecondLevelPage>
  );
}

