'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  ExternalLink,
  FileJson,
  FileOutput,
  Layers3,
  Radio,
  Send,
} from 'lucide-react'
import { useMarketContext } from '@/components/market-context'
import { Button } from '@/components/ui/button'
import { MultiSelect } from '@/components/ui/multi-select'
import { PageContentContainer } from '@/components/ui/page-content-container'
import { PageHeader } from '@/components/ui/page-header'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { ScopeSource } from '@/lib/syndication-runs'

type OutputProfileSummary = {
  id: string
  name: string
  code: string
  profile_type: string
  description?: string | null
  is_active?: boolean
}

type OutputProfileDetail = OutputProfileSummary & {
  field_rules?: Array<{
    id?: string
    field_code: string
    is_required: boolean
    max_length?: number | null
    notes?: string | null
  }>
  attribute_mappings?: Array<{
    id?: string
    attribute_code: string
    attribute_label: string
    source_mode: 'shared_field' | 'destination_field' | 'slot' | 'constant'
    is_required: boolean
    max_length?: number | null
    source_field_code?: string | null
    override_field_code?: string | null
    source_slot_code?: string | null
  }>
  slot_definitions?: Array<{
    id?: string
    slot_code: string
    slot_name: string
    asset_kind: string
    is_required: boolean
  }>
}

type SavedProductScopeOption = {
  id: string
  name: string
  product_count: number
  variant_count: number
  item_count: number
}

type ShareSetItem = {
  id: string
  resource_type: 'product' | 'variant' | 'asset' | 'folder'
  resource_id: string
}

type ShareSetItemsPayload = {
  items?: ShareSetItem[]
  resolved?: Record<string, { name: string; sku?: string | null }>
}

type PreviewRow = {
  product_id: string
  fields: Record<string, unknown>
  assets: Record<string, string | null>
  missing: string[]
  warnings: Array<{ field: string; issue: string }>
}

type PreviewPayload = {
  profile_id: string
  profile_code: string
  profile_name: string
  profile_type: string
  exported_at: string
  count: number
  rows: PreviewRow[]
}

type DeliveryTarget = 'portal' | 'file_export' | 'direct_channel'

type PartnerRelationshipOption = {
  id: string
  name: string
  slug: string | null
  partner_category?: string | null
}

type RecentSyndicationRun = {
  id: string
  outputProfileId: string
  deliveryTarget: DeliveryTarget
  productCount: number
  readyCount: number
  warningCount: number
  createdAt: string
}

type RecentPortalPublish = {
  id: string
  outputProfileId: string
  publishedAt: string
}

interface SyndicationClientProps {
  tenantSlug: string
  initialProductIds: string[]
  initialProfileId?: string | null
}

function downloadTextFile(params: {
  content: string
  mimeType: string
  filename: string
}) {
  const blob = new Blob([params.content], { type: params.mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = params.filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function prettyProfileType(value: string | null | undefined) {
  switch (value) {
    case 'portal':
      return 'Partner Portal'
    case 'marketplace':
      return 'Marketplace'
    case 'retail':
      return 'Retail'
    case 'export':
      return 'Export / File'
    case 'api':
      return 'API Integration'
    default:
      return value || 'Destination'
  }
}

export default function SyndicationClient({
  tenantSlug,
  initialProductIds,
  initialProfileId = null,
}: SyndicationClientProps) {
  const {
    selectedMarket,
    selectedMarketId,
    selectedLocale,
    selectedLocaleId,
  } = useMarketContext()

  const [profiles, setProfiles] = useState<OutputProfileSummary[]>([])
  const [profilesLoading, setProfilesLoading] = useState(true)
  const [profilesError, setProfilesError] = useState<string | null>(null)
  const [productSets, setProductSets] = useState<SavedProductScopeOption[]>([])
  const [setsLoading, setSetsLoading] = useState(true)
  const [setsError, setSetsError] = useState<string | null>(null)
  const [selectedProfileId, setSelectedProfileId] = useState(initialProfileId || '')
  const [selectedSetId, setSelectedSetId] = useState('')
  const [selectedSource, setSelectedSource] = useState<ScopeSource>(
    initialProductIds.length > 0 ? 'selection' : 'saved_scope'
  )
  const [profileDetail, setProfileDetail] = useState<OutputProfileDetail | null>(null)
  const [profileDetailLoading, setProfileDetailLoading] = useState(false)
  const [setItemsLoading, setSetItemsLoading] = useState(false)
  const [setItemsPayload, setSetItemsPayload] = useState<ShareSetItemsPayload | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewPayload, setPreviewPayload] = useState<PreviewPayload | null>(null)
  const [exportingCsv, setExportingCsv] = useState(false)
  const [deliveryTarget, setDeliveryTarget] = useState<DeliveryTarget>('portal')
  const [partners, setPartners] = useState<PartnerRelationshipOption[]>([])
  const [partnersLoading, setPartnersLoading] = useState(true)
  const [selectedPartnerIds, setSelectedPartnerIds] = useState<string[]>([])
  const [publishing, setPublishing] = useState(false)
  const [recentRuns, setRecentRuns] = useState<RecentSyndicationRun[]>([])
  const [recentPublishes, setRecentPublishes] = useState<RecentPortalPublish[]>([])
  const [publishResult, setPublishResult] = useState<{
    run?: RecentSyndicationRun | null
    portalPublish?: RecentPortalPublish | null
  } | null>(null)

  const hasSelectionSource = initialProductIds.length > 0

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedProfileId) || null,
    [profiles, selectedProfileId]
  )

  const selectedSet = useMemo(
    () => productSets.find((productSet) => productSet.id === selectedSetId) || null,
    [productSets, selectedSetId]
  )

  const setScopedProductIds = useMemo(() => {
    const items = Array.isArray(setItemsPayload?.items) ? setItemsPayload.items : []
    return Array.from(
      new Set(
        items
          .filter((item) => item.resource_type === 'product' || item.resource_type === 'variant')
          .map((item) => item.resource_id)
      )
    )
  }, [setItemsPayload])

  const activeProductIds = selectedSource === 'selection' ? initialProductIds : setScopedProductIds

  const previewRows = previewPayload?.rows ?? []
  const readyCount = useMemo(
    () => previewRows.filter((row) => row.missing.length === 0).length,
    [previewRows]
  )
  const warningCount = useMemo(
    () => previewRows.filter((row) => row.warnings.length > 0).length,
    [previewRows]
  )

  const aggregatedMissingFields = useMemo(() => {
    const counts = new Map<string, number>()
    for (const row of previewRows) {
      for (const fieldCode of row.missing) {
        counts.set(fieldCode, (counts.get(fieldCode) || 0) + 1)
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
  }, [previewRows])

  const previewProductLabels = useMemo(() => {
    const resolved = setItemsPayload?.resolved || {}
    return activeProductIds.slice(0, 6).map((productId) => resolved[productId]?.name || productId)
  }, [activeProductIds, setItemsPayload])

  const requiredAttributeCount = useMemo(() => {
    const mappings = profileDetail?.attribute_mappings || []
    if (mappings.length > 0) {
      return mappings.filter((mapping) => mapping.is_required).length
    }
    return (profileDetail?.field_rules || []).filter((rule) => rule.is_required).length
  }, [profileDetail])

  const requiredFileCount = useMemo(
    () => (profileDetail?.slot_definitions || []).filter((slot) => slot.is_required).length,
    [profileDetail]
  )

  const mappingModeSummary = useMemo(() => {
    const mappings = profileDetail?.attribute_mappings || []
    if (mappings.length === 0) return null
    return {
      shared: mappings.filter((mapping) => mapping.source_mode === 'shared_field').length,
      destination: mappings.filter((mapping) => mapping.source_mode === 'destination_field').length,
      slots: mappings.filter((mapping) => mapping.source_mode === 'slot').length,
      constants: mappings.filter((mapping) => mapping.source_mode === 'constant').length,
    }
  }, [profileDetail])

  const previewJsonString = useMemo(() => {
    if (!previewPayload) return ''
    const json = JSON.stringify(previewPayload, null, 2)
    return json.length > 12000 ? `${json.slice(0, 12000)}\n…` : json
  }, [previewPayload])

  const partnerOptions = useMemo(
    () =>
      partners.map((partner) => ({
        value: partner.id,
        label: partner.name,
      })),
    [partners]
  )

  const selectedPartnerNames = useMemo(
    () =>
      selectedPartnerIds
        .map((partnerId) => partners.find((partner) => partner.id === partnerId)?.name || partnerId)
        .slice(0, 3),
    [partners, selectedPartnerIds]
  )

  const runSummaryRows = useMemo(
    () => [
      {
        label: 'Destination',
        value: selectedProfile?.name || 'Choose where this is going',
      },
      {
        label: 'Source',
        value:
          selectedSource === 'selection'
            ? hasSelectionSource
              ? `Current selection (${activeProductIds.length})`
              : 'Choose a saved scope'
            : selectedSet?.name || 'Choose a saved scope',
      },
      {
        label: 'Perspective',
        value: `${selectedMarket?.name || 'All markets'} · ${selectedLocale?.name || 'Default language'}`,
      },
      {
        label: 'Delivery',
        value:
          deliveryTarget === 'portal'
            ? 'Partner Portal'
            : deliveryTarget === 'direct_channel'
              ? 'Direct Channel'
              : 'File Export',
      },
    ],
    [
      activeProductIds.length,
      deliveryTarget,
      hasSelectionSource,
      selectedLocale?.name,
      selectedMarket?.name,
      selectedProfile?.name,
      selectedSet?.name,
      selectedSource,
    ]
  )

  const primaryActionLabel =
    deliveryTarget === 'portal'
      ? 'Publish to Partner Portal'
      : deliveryTarget === 'direct_channel'
        ? 'Record Direct Delivery'
        : 'Save File Export Run'

  const fetchProfiles = useCallback(async () => {
    setProfilesLoading(true)
    setProfilesError(null)
    try {
      const response = await fetch(`/api/${tenantSlug}/output-profiles`)
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to load destinations')
      }
      const items = Array.isArray(payload?.data) ? (payload.data as OutputProfileSummary[]) : []
      setProfiles(items.filter((item: OutputProfileSummary) => item?.is_active !== false))
    } catch (error) {
      setProfilesError(error instanceof Error ? error.message : 'Failed to load destinations')
    } finally {
      setProfilesLoading(false)
    }
  }, [tenantSlug])

  const fetchProductSets = useCallback(async () => {
    setSetsLoading(true)
    setSetsError(null)
    try {
      const response = await fetch(
        `/api/${tenantSlug}/sharing/sets?module=products&page=1&pageSize=200`
      )
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to load saved scopes')
      }
      const items = Array.isArray(payload?.data?.product_sets) ? payload.data.product_sets : []
      setProductSets(items)
    } catch (error) {
      setSetsError(error instanceof Error ? error.message : 'Failed to load saved scopes')
    } finally {
      setSetsLoading(false)
    }
  }, [tenantSlug])

  const fetchPartners = useCallback(async () => {
    setPartnersLoading(true)
    try {
      const response = await fetch(`/api/${tenantSlug}/team`)
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setPartners([])
        return
      }
      const relationshipRows = Array.isArray(payload?.data?.partner_relationships)
        ? payload.data.partner_relationships
        : []
      const nextPartners = relationshipRows
        .map((row: { partner_organization?: PartnerRelationshipOption | null }) => row.partner_organization || null)
        .filter((row: PartnerRelationshipOption | null): row is PartnerRelationshipOption => Boolean(row))
      setPartners(nextPartners)
    } catch {
      setPartners([])
    } finally {
      setPartnersLoading(false)
    }
  }, [tenantSlug])

  const fetchRecentRuns = useCallback(async () => {
    try {
      const response = await fetch(`/api/${tenantSlug}/syndication/runs`)
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) return
      setRecentRuns(Array.isArray(payload?.data?.runs) ? payload.data.runs : [])
      setRecentPublishes(Array.isArray(payload?.data?.portal_publishes) ? payload.data.portal_publishes : [])
    } catch {
      setRecentRuns([])
      setRecentPublishes([])
    }
  }, [tenantSlug])

  useEffect(() => {
    void fetchProfiles()
    void fetchProductSets()
    void fetchPartners()
    void fetchRecentRuns()
  }, [fetchPartners, fetchProductSets, fetchProfiles, fetchRecentRuns])

  useEffect(() => {
    if (!hasSelectionSource && selectedSource === 'selection') {
      setSelectedSource('saved_scope')
    }
  }, [hasSelectionSource, selectedSource])

  useEffect(() => {
    if (!initialProfileId || selectedProfileId) return
    if (!profiles.some((profile) => profile.id === initialProfileId)) return
    setSelectedProfileId(initialProfileId)
  }, [initialProfileId, profiles, selectedProfileId])

  useEffect(() => {
    setPreviewPayload(null)
    setPreviewError(null)
  }, [selectedProfileId, selectedSetId, selectedSource, selectedMarketId, selectedLocaleId])

  useEffect(() => {
    if (!selectedProfileId) {
      setProfileDetail(null)
      return
    }

    let active = true
    setProfileDetailLoading(true)
    void fetch(`/api/${tenantSlug}/output-profiles/${selectedProfileId}`)
      .then((response) => response.json().catch(() => ({})))
      .then((payload) => {
        if (!active) return
        if (!payload || payload.success === false) {
          setProfileDetail(null)
          return
        }
        setProfileDetail((payload.data || null) as OutputProfileDetail | null)
      })
      .catch(() => {
        if (active) setProfileDetail(null)
      })
      .finally(() => {
        if (active) setProfileDetailLoading(false)
      })

    return () => {
      active = false
    }
  }, [selectedProfileId, tenantSlug])

  useEffect(() => {
    if (selectedSource !== 'saved_scope' || !selectedSetId) {
      setSetItemsPayload(null)
      setSetItemsLoading(false)
      return
    }

    let active = true
    setSetItemsLoading(true)
    void fetch(`/api/${tenantSlug}/sharing/sets/${selectedSetId}/items?limit=1000`)
      .then(async (response) => ({
        ok: response.ok,
        payload: await response.json().catch(() => ({})),
      }))
      .then(({ ok, payload }) => {
        if (!active) return
        if (!ok) {
          setSetItemsPayload(null)
          return
        }
        setSetItemsPayload((payload.data || null) as ShareSetItemsPayload | null)
      })
      .catch(() => {
        if (active) setSetItemsPayload(null)
      })
      .finally(() => {
        if (active) setSetItemsLoading(false)
      })

    return () => {
      active = false
    }
  }, [selectedSetId, selectedSource, tenantSlug])

  const requestPreview = useCallback(async (): Promise<PreviewPayload> => {
    if (!selectedProfileId || activeProductIds.length === 0) {
      throw new Error('Choose a destination and a product source first.')
    }

    const response = await fetch(`/api/${tenantSlug}/products/export/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile_id: selectedProfileId,
        product_ids: activeProductIds,
        market_id: selectedMarketId,
        locale_id: selectedLocaleId,
        format: 'json',
      }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to prepare syndication preview')
    }
    return payload.data as PreviewPayload
  }, [activeProductIds, selectedLocaleId, selectedMarketId, selectedProfileId, tenantSlug])

  const handlePreviewJson = useCallback(async () => {
    setPreviewLoading(true)
    setPreviewError(null)
    try {
      const payload = await requestPreview()
      setPreviewPayload(payload)
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : 'Failed to prepare preview')
    } finally {
      setPreviewLoading(false)
    }
  }, [requestPreview])

  const handleExportCsv = useCallback(async () => {
    if (!selectedProfileId || activeProductIds.length === 0) return

    setExportingCsv(true)
    setPreviewError(null)
    try {
      const response = await fetch(`/api/${tenantSlug}/products/export/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile_id: selectedProfileId,
          product_ids: activeProductIds,
          market_id: selectedMarketId,
          locale_id: selectedLocaleId,
          format: 'csv',
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to export CSV')
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const filenameMatch = response.headers
        .get('content-disposition')
        ?.match(/filename=\"?([^\";]+)\"?/i)
      link.download = filenameMatch?.[1] ?? `syndication-${selectedProfile?.code || 'export'}.csv`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : 'Failed to export CSV')
    } finally {
      setExportingCsv(false)
    }
  }, [
    activeProductIds,
    selectedLocaleId,
    selectedMarketId,
    selectedProfile?.code,
    selectedProfileId,
    tenantSlug,
  ])

  const handleDownloadJson = useCallback(() => {
    if (!previewPayload) return
    downloadTextFile({
      content: JSON.stringify(previewPayload, null, 2),
      mimeType: 'application/json;charset=utf-8',
      filename: `syndication-${previewPayload.profile_code}-${Date.now()}.json`,
    })
  }, [previewPayload])

  const handleCreateSyndicationRun = useCallback(async () => {
    if (!selectedProfileId || activeProductIds.length === 0 || publishing) return

    setPublishing(true)
    setPreviewError(null)
    setPublishResult(null)

    try {
      const preview = previewPayload ?? (deliveryTarget === 'portal' ? await requestPreview() : null)
      if (!previewPayload && preview) {
        setPreviewPayload(preview)
      }

      const response = await fetch(`/api/${tenantSlug}/syndication/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outputProfileId: selectedProfileId,
          shareSetId: selectedSource === 'saved_scope' ? selectedSetId : null,
          sourceType: selectedSource,
          deliveryTarget,
          productIds: activeProductIds,
          marketId: selectedMarketId,
          localeId: selectedLocaleId,
          partnerOrganizationIds: deliveryTarget === 'portal' ? selectedPartnerIds : [],
          previewSummary: preview
            ? {
                readyCount: preview.rows.filter((row) => row.missing.length === 0).length,
                warningCount: preview.rows.filter((row) => row.warnings.length > 0).length,
                totalCount: preview.count,
                missingFields: aggregatedMissingFields.map(([fieldCode, count]) => ({
                  fieldCode,
                  count,
                })),
              }
            : {
                readyCount,
                warningCount,
                totalCount: activeProductIds.length,
              },
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to create syndication run')
      }
      setPublishResult({
        run: payload?.data?.run || null,
        portalPublish: payload?.data?.portal_publish || null,
      })
      await fetchRecentRuns()
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : 'Failed to create syndication run')
    } finally {
      setPublishing(false)
    }
  }, [
    activeProductIds,
    aggregatedMissingFields,
    deliveryTarget,
    fetchRecentRuns,
    previewPayload,
    publishing,
    readyCount,
    requestPreview,
    selectedLocaleId,
    selectedPartnerIds,
    selectedProfileId,
    selectedSetId,
    selectedSource,
    selectedMarketId,
    tenantSlug,
    warningCount,
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Syndication"
        description="Choose where this content is going, confirm what is included, review readiness, and then publish or export the resolved destination view."
        actions={[
          {
            label: 'Manage destinations',
            href: `/${tenantSlug}/settings/output-profiles`,
            icon: ExternalLink,
            variant: 'outline',
            size: 'sm',
          },
        ]}
      />

      <PageContentContainer mode="content" padding="page" className="space-y-5">
        <div className="hidden grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-border/60 bg-card p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Destinations</div>
            <div className="mt-2 text-2xl font-semibold text-foreground">{profiles.length}</div>
            <p className="mt-1 text-sm text-muted-foreground">
              {selectedProfile ? `${selectedProfile.name} selected` : 'Choose a destination to continue.'}
            </p>
          </div>
          <div className="rounded-lg border border-border/60 bg-card p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Products</div>
            <div className="mt-2 text-2xl font-semibold text-foreground">{activeProductIds.length}</div>
            <p className="mt-1 text-sm text-muted-foreground">
              {selectedSource === 'selection'
                ? 'Using the current product selection.'
                : selectedSet
                  ? `Using ${selectedSet.name}.`
                  : 'Choose a saved scope to begin.'}
            </p>
          </div>
          <div className="rounded-lg border border-border/60 bg-card p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Required Attributes</div>
            <div className="mt-2 text-2xl font-semibold text-foreground">
              {profileDetailLoading ? '…' : requiredAttributeCount}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {selectedProfile ? `Defined by ${selectedProfile.name}.` : 'Destination requirements load here.'}
            </p>
          </div>
        </div>

        <section className="rounded-2xl border border-border/60 bg-card p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Current Run</p>
              <h2 className="text-lg font-semibold text-foreground">Send one destination view of your structured product record</h2>
              <p className="text-sm text-muted-foreground">
                Product Detail is where the record is authored. Syndication resolves that record for a destination, applies the current perspective, and packages what partners or channels should receive.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {runSummaryRows.map((item) => (
                <div key={item.label} className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{item.label}</div>
                  <div className="mt-1 text-sm font-medium text-foreground">{item.value}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.95fr)]">
          <section className="space-y-5 rounded-2xl border border-border/60 bg-card p-5">
            <div>
              <h2 className="text-sm font-semibold text-foreground">1. Where is this going?</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Start with the destination, then confirm the content source and choose what should happen next.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Destination</label>
              <Select value={selectedProfileId} onValueChange={setSelectedProfileId} disabled={profilesLoading || profiles.length === 0}>
                <SelectTrigger>
                  <SelectValue placeholder={profilesLoading ? 'Loading destinations...' : 'Select destination'} />
                </SelectTrigger>
                <SelectContent>
                  {profiles.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {profilesError ? <p className="text-xs text-destructive">{profilesError}</p> : null}
              {selectedProfile ? (
                <p className="text-xs text-muted-foreground">
                  {prettyProfileType(selectedProfile.profile_type)} - {selectedProfile.code}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Choose the destination view first. Everything else on this page follows from that decision.
                </p>
              )}
            </div>

            <div>
              <h3 className="text-sm font-semibold text-foreground">2. What content is included?</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Use the current product selection for one-off runs, or choose a saved scope for repeat deliveries.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {hasSelectionSource ? (
                <button
                  type="button"
                  onClick={() => setSelectedSource('selection')}
                  className={`inline-flex h-8 items-center rounded-md border px-3 text-sm transition-colors ${
                    selectedSource === 'selection'
                      ? 'border-foreground/20 bg-muted text-foreground'
                      : 'border-border/70 bg-background text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Current selection
                </button>
              ) : null}
              <button
                type="button"
                  onClick={() => setSelectedSource('saved_scope')}
                  className={`inline-flex h-8 items-center rounded-md border px-3 text-sm transition-colors ${
                    selectedSource === 'saved_scope'
                      ? 'border-foreground/20 bg-muted text-foreground'
                      : 'border-border/70 bg-background text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Saved scope
                </button>
              </div>

            {selectedSource === 'selection' ? (
              <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Using {initialProductIds.length} selected product{initialProductIds.length === 1 ? '' : 's'}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Selected in Products. Return to Products if you want to change the selection.
                    </p>
                  </div>
                  <Link
                    href={`/${tenantSlug}/products`}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Open products
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Saved scope</label>
                <Select value={selectedSetId} onValueChange={setSelectedSetId} disabled={setsLoading || productSets.length === 0}>
                  <SelectTrigger>
                    <SelectValue placeholder={setsLoading ? 'Loading saved scopes…' : 'Select saved scope'} />
                  </SelectTrigger>
                  <SelectContent>
                    {productSets.map((productSet) => (
                      <SelectItem key={productSet.id} value={productSet.id}>
                        {productSet.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {setsError ? <p className="text-xs text-destructive">{setsError}</p> : null}
                {selectedSet ? (
                  <p className="text-xs text-muted-foreground">
                    {selectedSet.product_count} products, {selectedSet.variant_count} variants in this saved scope
                  </p>
                ) : null}
              </div>
            )}

            <div className="hidden">
              <label className="text-sm font-medium text-foreground">Destination</label>
              <Select value={selectedProfileId} onValueChange={setSelectedProfileId} disabled={profilesLoading || profiles.length === 0}>
                <SelectTrigger>
                  <SelectValue placeholder={profilesLoading ? 'Loading destinations…' : 'Select destination'} />
                </SelectTrigger>
                <SelectContent>
                  {profiles.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {profilesError ? <p className="text-xs text-destructive">{profilesError}</p> : null}
              {selectedProfile ? (
                <p className="text-xs text-muted-foreground">
                  {prettyProfileType(selectedProfile.profile_type)} · {selectedProfile.code}
                </p>
              ) : null}
            </div>

            <div>
              <h3 className="text-sm font-semibold text-foreground">3. What should happen now?</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Choose how this resolved destination view should be delivered.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Delivery target</label>
              <Select
                value={deliveryTarget}
                onValueChange={(value) => setDeliveryTarget(value as DeliveryTarget)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose delivery target" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="portal">Partner Portal</SelectItem>
                  <SelectItem value="file_export">File Export</SelectItem>
                  <SelectItem value="direct_channel">Direct Channel</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {deliveryTarget === 'portal'
                  ? 'Create a syndication run and publish the destination view into the Partner Portal.'
                  : deliveryTarget === 'direct_channel'
                    ? 'Record a direct destination delivery run for this scope.'
                    : 'Record a file-delivery syndication run while keeping export actions available below.'}
              </p>
            </div>

            {deliveryTarget === 'portal' ? (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Partner audience</label>
                <MultiSelect
                  options={partnerOptions}
                  value={selectedPartnerIds}
                  onChange={setSelectedPartnerIds}
                  placeholder={partnersLoading ? 'Loading partners…' : 'Choose partners'}
                  disabled={partnersLoading || partnerOptions.length === 0}
                />
                <p className="text-xs text-muted-foreground">
                  {selectedPartnerIds.length > 0
                    ? `Publishing to ${selectedPartnerNames.join(', ')}${selectedPartnerIds.length > 3 ? ` +${selectedPartnerIds.length - 3}` : ''}.`
                    : 'Portal publishes become visible only to the selected partner organizations.'}
                </p>
              </div>
            ) : null}

            <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-border/70 bg-background px-2.5 py-1 text-xs text-muted-foreground">
                  Market: {selectedMarket?.name || 'All markets'}
                </span>
                <span className="rounded-full border border-border/70 bg-background px-2.5 py-1 text-xs text-muted-foreground">
                  Language: {selectedLocale?.name || 'Default language'}
                </span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Market and language shape the resolved payload, but they do not create a second product record. Product Detail remains the source of truth.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                disabled={!selectedProfileId || activeProductIds.length === 0 || previewLoading}
                onClick={() => void handlePreviewJson()}
              >
                <FileJson className="h-4 w-4" />
                {previewLoading ? 'Preparing…' : 'Preview JSON'}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                disabled={!selectedProfileId || activeProductIds.length === 0 || exportingCsv}
                onClick={() => void handleExportCsv()}
              >
                <FileOutput className="h-4 w-4" />
                {exportingCsv ? 'Exporting…' : 'Export CSV'}
              </Button>
              {previewPayload ? (
                <Button type="button" variant="ghost" className="gap-2" onClick={handleDownloadJson}>
                  <Send className="h-4 w-4" />
                  Download JSON
                </Button>
              ) : null}
              <Button
                type="button"
                variant={deliveryTarget === 'portal' ? 'default' : 'secondary'}
                className="gap-2"
                disabled={
                  !selectedProfileId ||
                  activeProductIds.length === 0 ||
                  publishing ||
                  (deliveryTarget === 'portal' && selectedPartnerIds.length === 0)
                }
                onClick={() => void handleCreateSyndicationRun()}
              >
                <Radio className="h-4 w-4" />
                {publishing
                  ? 'Running…'
                  : deliveryTarget === 'portal'
                    ? 'Publish to Portal'
                    : deliveryTarget === 'direct_channel'
                      ? 'Record Direct Delivery'
                      : 'Save Syndication Run'}
              </Button>
            </div>

            {(publishResult?.run || recentRuns.length > 0 || recentPublishes.length > 0) ? (
              <div className="hidden rounded-lg border border-border/60 bg-background p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Recent syndication activity</p>
                    <p className="text-xs text-muted-foreground">
                      Runs record delivery intent across portal, direct channel, and file export workflows.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {recentRuns.slice(0, 2).map((run) => (
                      <span
                        key={run.id}
                        className="rounded-full border border-border/70 bg-muted/20 px-2.5 py-1 text-xs text-muted-foreground"
                      >
                        {run.deliveryTarget === 'portal' ? 'Portal' : run.deliveryTarget === 'direct_channel' ? 'Direct' : 'Export'} · {run.productCount}
                      </span>
                    ))}
                    {recentPublishes.slice(0, 1).map((publish) => (
                      <span
                        key={publish.id}
                        className="rounded-full border border-border/70 bg-muted/20 px-2.5 py-1 text-xs text-muted-foreground"
                      >
                        Portal publish
                      </span>
                    ))}
                  </div>
                </div>
                {publishResult?.run ? (
                  <p className="mt-3 text-sm text-foreground">
                    Latest run recorded for this destination. {publishResult.portalPublish ? 'A portal publish was also created for the selected partner audience.' : 'No portal publish was created for this delivery target.'}
                  </p>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="space-y-4 rounded-2xl border border-border/60 bg-card p-5">
            <div>
              <h2 className="text-sm font-semibold text-foreground">4. Is it ready?</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Review destination requirements and preview the missing fields before delivering anything downstream.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5">
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Ready</div>
                <div className="mt-1 text-lg font-semibold text-foreground">{readyCount}</div>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5">
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Warnings</div>
                <div className="mt-1 text-lg font-semibold text-foreground">{warningCount}</div>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5">
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Required</div>
                <div className="mt-1 text-lg font-semibold text-foreground">
                  {profileDetailLoading ? '...' : requiredAttributeCount}
                </div>
              </div>
            </div>

            {selectedSource === 'saved_scope' && setItemsLoading ? (
              <div className="space-y-2">
                <div className="h-16 animate-pulse rounded-lg bg-muted/60" />
                <div className="h-16 animate-pulse rounded-lg bg-muted/60" />
              </div>
            ) : (
              <>
                <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Layers3 className="h-4 w-4 text-muted-foreground" />
                    Source summary
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {activeProductIds.length === 0
                      ? 'No products in scope yet.'
                      : `${activeProductIds.length} product${activeProductIds.length === 1 ? '' : 's'} currently in scope.`}
                  </p>
                  {previewProductLabels.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {previewProductLabels.map((label) => (
                        <span
                          key={label}
                          className="rounded-full border border-border/70 bg-background px-2.5 py-1 text-xs text-muted-foreground"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
                  <p className="text-sm font-medium text-foreground">Destination requirements</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {selectedProfile
                      ? `${requiredAttributeCount} required attribute${requiredAttributeCount === 1 ? '' : 's'} defined for ${selectedProfile.name}.`
                      : 'Choose a destination to load requirements.'}
                  </p>
                  {selectedProfile && requiredFileCount > 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {requiredFileCount} required file slot{requiredFileCount === 1 ? '' : 's'} also drive readiness.
                    </p>
                  ) : null}
                  {mappingModeSummary ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-full border border-border/70 bg-background px-2.5 py-1 text-xs text-muted-foreground">
                        Shared {mappingModeSummary.shared}
                      </span>
                      <span className="rounded-full border border-border/70 bg-background px-2.5 py-1 text-xs text-muted-foreground">
                        Destination {mappingModeSummary.destination}
                      </span>
                      {mappingModeSummary.slots > 0 ? (
                        <span className="rounded-full border border-border/70 bg-background px-2.5 py-1 text-xs text-muted-foreground">
                          Files {mappingModeSummary.slots}
                        </span>
                      ) : null}
                      {mappingModeSummary.constants > 0 ? (
                        <span className="rounded-full border border-border/70 bg-background px-2.5 py-1 text-xs text-muted-foreground">
                          Constants {mappingModeSummary.constants}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  {selectedProfile ? (
                    <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{prettyProfileType(selectedProfile.profile_type)}</span>
                      <Link href={`/${tenantSlug}/settings/output-profiles/${selectedProfile.id}`} className="inline-flex items-center gap-1 hover:text-foreground">
                        Open destination
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  ) : null}
                </div>

                {previewPayload ? (
                  <div className="space-y-3 rounded-lg border border-border/60 bg-background p-4">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-md border border-border/60 bg-muted/20 p-3">
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">Ready</div>
                        <div className="mt-1 text-xl font-semibold text-foreground">{readyCount}</div>
                      </div>
                      <div className="rounded-md border border-border/60 bg-muted/20 p-3">
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">Needs attention</div>
                        <div className="mt-1 text-xl font-semibold text-foreground">
                          {previewPayload.count - readyCount}
                        </div>
                      </div>
                      <div className="rounded-md border border-border/60 bg-muted/20 p-3">
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">Warnings</div>
                        <div className="mt-1 text-xl font-semibold text-foreground">{warningCount}</div>
                      </div>
                    </div>

                    {aggregatedMissingFields.length > 0 ? (
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Most-missing attributes
                        </p>
                        <div className="mt-2 space-y-2">
                          {aggregatedMissingFields.map(([fieldCode, count]) => (
                            <div
                              key={fieldCode}
                              className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 text-sm"
                            >
                              <code className="font-mono text-foreground">{fieldCode}</code>
                              <span className="text-muted-foreground">{count} product{count === 1 ? '' : 's'}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-emerald-700">
                        This package has no missing required attributes for the selected destination.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-border/60 bg-muted/10 px-4 py-8 text-center">
                    <p className="text-sm font-medium text-foreground">Choose a destination and scope to preview the final payload</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Preview the JSON payload to see missing attributes, warnings, and the final structure before publishing or export.
                    </p>
                  </div>
                )}
              </>
            )}

            {previewError ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {previewError}
              </div>
            ) : null}
          </section>
        </div>

        {(publishResult?.run || recentRuns.length > 0 || recentPublishes.length > 0) ? (
          <section className="rounded-2xl border border-border/60 bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Recent Syndication Activity</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Runs record delivery intent across portal, direct channel, and file export workflows.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {recentRuns.slice(0, 3).map((run) => (
                  <span
                    key={run.id}
                    className="rounded-full border border-border/70 bg-muted/20 px-2.5 py-1 text-xs text-muted-foreground"
                  >
                    {run.deliveryTarget === 'portal' ? 'Portal' : run.deliveryTarget === 'direct_channel' ? 'Direct' : 'Export'} · {run.productCount}
                  </span>
                ))}
                {recentPublishes.slice(0, 2).map((publish) => (
                  <span
                    key={publish.id}
                    className="rounded-full border border-border/70 bg-muted/20 px-2.5 py-1 text-xs text-muted-foreground"
                  >
                    Portal publish
                  </span>
                ))}
              </div>
            </div>
            {publishResult?.run ? (
              <p className="mt-3 text-sm text-foreground">
                Latest run recorded for this destination. {publishResult.portalPublish ? 'A portal publish was also created for the selected partner audience.' : 'No portal publish was created for this delivery target.'}
              </p>
            ) : null}
          </section>
        ) : null}

        {previewPayload ? (
          <section className="rounded-lg border border-border/60 bg-card p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-foreground">JSON preview</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Inspect the generated payload before pushing it to a feed, file export, or partner-facing delivery surface.
                </p>
              </div>
              <div className="rounded-full border border-border/70 bg-muted/20 px-3 py-1 text-xs text-muted-foreground">
                {previewPayload.count} row{previewPayload.count === 1 ? '' : 's'}
              </div>
            </div>
            <pre className="mt-4 overflow-x-auto rounded-lg border border-border/60 bg-muted/20 p-4 text-xs leading-5 text-foreground">
              {previewJsonString}
            </pre>
          </section>
        ) : null}
      </PageContentContainer>
    </div>
  )
}
