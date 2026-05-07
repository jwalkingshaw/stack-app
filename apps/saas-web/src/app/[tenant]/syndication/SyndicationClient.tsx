'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, ExternalLink, Layers3, Radio } from 'lucide-react'
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

type PartnerRelationshipOption = {
  id: string
  name: string
  slug: string | null
  partner_category?: string | null
}

type RecentSyndicationRun = {
  id: string
  outputProfileId: string
  deliveryTarget: string
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

function StepIndicator({ current }: { current: 1 | 2 | 3 }) {
  const steps = [
    { label: 'Scope', number: 1 as const },
    { label: 'Partners', number: 2 as const },
    { label: 'Publish', number: 3 as const },
  ]
  return (
    <div className="flex items-center gap-1">
      {steps.map(({ label, number }, index) => {
        const isActive = number === current
        const isDone = number < current
        return (
          <div key={label} className="flex items-center gap-1">
            <div
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-foreground text-background'
                  : isDone
                    ? 'text-foreground'
                    : 'text-muted-foreground'
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold ${
                  isActive
                    ? 'bg-background text-foreground'
                    : isDone
                      ? 'bg-muted text-foreground'
                      : 'bg-muted/50 text-muted-foreground'
                }`}
              >
                {isDone ? '✓' : number}
              </span>
              {label}
            </div>
            {index < steps.length - 1 && (
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </div>
        )
      })}
    </div>
  )
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

  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1)
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

  const fetchProfiles = useCallback(async () => {
    setProfilesLoading(true)
    setProfilesError(null)
    try {
      const response = await fetch(`/api/${tenantSlug}/output-profiles`)
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to load channels')
      }
      const items = Array.isArray(payload?.data) ? (payload.data as OutputProfileSummary[]) : []
      setProfiles(
        items.filter(
          (item: OutputProfileSummary) => item?.is_active !== false && item?.profile_type === 'portal'
        )
      )
    } catch (error) {
      setProfilesError(error instanceof Error ? error.message : 'Failed to load channels')
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

  // Auto-select the first profile when only one channel exists (portal-only launch)
  useEffect(() => {
    if (!selectedProfileId && profiles.length > 0) {
      setSelectedProfileId(profiles[0].id)
    }
  }, [profiles, selectedProfileId])

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
      throw new Error('Choose a channel and a product scope first.')
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
      throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to prepare readiness preview')
    }
    return payload.data as PreviewPayload
  }, [activeProductIds, selectedLocaleId, selectedMarketId, selectedProfileId, tenantSlug])

  const handleLoadPreview = useCallback(async () => {
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

  const handleCreateSyndicationRun = useCallback(async () => {
    if (!selectedProfileId || activeProductIds.length === 0 || publishing) return

    setPublishing(true)
    setPreviewError(null)
    setPublishResult(null)

    try {
      const preview = previewPayload ?? (await requestPreview())
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
          deliveryTarget: 'portal',
          productIds: activeProductIds,
          marketId: selectedMarketId,
          localeId: selectedLocaleId,
          partnerOrganizationIds: selectedPartnerIds,
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
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to publish to portal')
      }
      setPublishResult({
        run: payload?.data?.run || null,
        portalPublish: payload?.data?.portal_publish || null,
      })
      await fetchRecentRuns()
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : 'Failed to publish to portal')
    } finally {
      setPublishing(false)
    }
  }, [
    activeProductIds,
    aggregatedMissingFields,
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

  const step1Valid = activeProductIds.length > 0 && Boolean(selectedProfileId)
  const step2Valid = selectedPartnerIds.length > 0

  return (
    <div className="space-y-6">
      <PageHeader
        title="Syndication"
        description="Select a scope and partner audience, then publish to the Partner Portal."
        actions={[
          {
            label: 'Channels',
            href: `/${tenantSlug}/settings/output-profiles`,
            icon: ExternalLink,
            variant: 'outline',
            size: 'sm',
          },
        ]}
      />

      <PageContentContainer mode="content" padding="page" className="space-y-5">
        {/* Step indicator */}
        <div className="flex items-center rounded-2xl border border-border/60 bg-card px-5 py-4">
          <StepIndicator current={currentStep} />
        </div>

        {/* Step 1: Scope */}
        {currentStep === 1 && (
          <section className="rounded-2xl border border-border/60 bg-card p-5">
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Step 1</p>
              <h2 className="text-lg font-semibold text-foreground">What are you publishing?</h2>
              <p className="text-sm text-muted-foreground">
                Choose your product scope and confirm the market and language context.
              </p>
            </div>

            <div className="mt-6 space-y-5">
              {/* Channel — select only when multiple channels exist */}
              {profiles.length > 1 ? (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Channel</label>
                  <Select value={selectedProfileId} onValueChange={setSelectedProfileId} disabled={profilesLoading}>
                    <SelectTrigger>
                      <SelectValue placeholder={profilesLoading ? 'Loading…' : 'Select channel'} />
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
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">Channel:</span>
                  <span className="rounded-full border border-border/70 bg-muted/20 px-3 py-1 text-sm text-foreground">
                    {profilesLoading ? '…' : (selectedProfile?.name ?? 'Portal')}
                  </span>
                </div>
              )}

              {/* Scope source toggle */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-foreground">Products</label>
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
                    <Select
                      value={selectedSetId}
                      onValueChange={setSelectedSetId}
                      disabled={setsLoading || productSets.length === 0}
                    >
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
              </div>

              {/* Market + locale context */}
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
                  Market and language shape the resolved payload. Change them in the market context selector above.
                </p>
              </div>

              <div className="flex justify-end">
                <Button
                  type="button"
                  disabled={!step1Valid}
                  onClick={() => setCurrentStep(2)}
                  className="gap-2"
                >
                  Next
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </section>
        )}

        {/* Step 2: Partners */}
        {currentStep === 2 && (
          <section className="rounded-2xl border border-border/60 bg-card p-5">
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Step 2</p>
              <h2 className="text-lg font-semibold text-foreground">Who sees this?</h2>
              <p className="text-sm text-muted-foreground">
                Choose which partner organizations will have access to this portal publish.
              </p>
            </div>

            <div className="mt-6 space-y-5">
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
                    : 'Select at least one partner to continue. Portal publishes are visible only to the selected partner organizations.'}
                </p>
              </div>

              {partnerOptions.length === 0 && !partnersLoading ? (
                <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
                  <p className="text-sm text-muted-foreground">
                    No partners found. Add partner organizations in Team settings before publishing.
                  </p>
                </div>
              ) : null}

              <div className="flex items-center justify-between">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCurrentStep(1)}
                  className="gap-2"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
                <Button
                  type="button"
                  disabled={!step2Valid}
                  onClick={() => {
                    setCurrentStep(3)
                    if (!previewPayload && !previewLoading) {
                      void handleLoadPreview()
                    }
                  }}
                  className="gap-2"
                >
                  Next
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </section>
        )}

        {/* Step 3: Publish */}
        {currentStep === 3 && (
          <section className="rounded-2xl border border-border/60 bg-card p-5">
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Step 3</p>
              <h2 className="text-lg font-semibold text-foreground">Ready to publish?</h2>
              <p className="text-sm text-muted-foreground">
                Review readiness before publishing to the Partner Portal.
              </p>
            </div>

            <div className="mt-6 space-y-5">
              {/* Readiness summary grid */}
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Ready</div>
                  <div className="mt-1 text-lg font-semibold text-foreground">
                    {previewLoading ? '…' : readyCount}
                  </div>
                </div>
                <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Missing</div>
                  <div className="mt-1 text-lg font-semibold text-foreground">
                    {previewLoading ? '…' : previewPayload ? previewPayload.count - readyCount : '–'}
                  </div>
                </div>
                <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Required</div>
                  <div className="mt-1 text-lg font-semibold text-foreground">
                    {profileDetailLoading ? '…' : requiredAttributeCount}
                  </div>
                </div>
              </div>

              {/* Scope summary */}
              {selectedSource === 'saved_scope' && setItemsLoading ? (
                <div className="h-16 animate-pulse rounded-lg bg-muted/60" />
              ) : (
                <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Layers3 className="h-4 w-4 text-muted-foreground" />
                    Scope summary
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {activeProductIds.length === 0
                      ? 'No products in scope.'
                      : `${activeProductIds.length} product${activeProductIds.length === 1 ? '' : 's'} in scope.`}
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
              )}

              {/* Readiness detail — channel requirements + missing fields */}
              <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
                <p className="text-sm font-medium text-foreground">Channel requirements</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {selectedProfile
                    ? `${requiredAttributeCount} required attribute${requiredAttributeCount === 1 ? '' : 's'} defined for ${selectedProfile.name}.`
                    : 'Channel requirements load here.'}
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
                      Channel {mappingModeSummary.destination}
                    </span>
                    {mappingModeSummary.slots > 0 ? (
                      <span className="rounded-full border border-border/70 bg-background px-2.5 py-1 text-xs text-muted-foreground">
                        Files {mappingModeSummary.slots}
                      </span>
                    ) : null}
                  </div>
                ) : null}
                {selectedProfile ? (
                  <div className="mt-3 flex items-center justify-end text-xs text-muted-foreground">
                    <Link
                      href={`/${tenantSlug}/settings/output-profiles/${selectedProfile.id}`}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                    >
                      Open channel
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                ) : null}
              </div>

              {/* Missing fields from preview */}
              {previewLoading ? (
                <div className="space-y-2">
                  <div className="h-20 animate-pulse rounded-lg bg-muted/60" />
                  <div className="h-12 animate-pulse rounded-lg bg-muted/60" />
                </div>
              ) : previewPayload ? (
                <div className="space-y-3 rounded-lg border border-border/60 bg-background p-4">
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
                      All products in this scope meet channel requirements.
                    </p>
                  )}
                </div>
              ) : null}

              {previewError ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {previewError}
                </div>
              ) : null}

              {publishResult?.run ? (
                <div className="rounded-lg border border-border/60 bg-background p-4">
                  <p className="text-sm font-medium text-foreground">Published to Partner Portal</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {publishResult.portalPublish
                      ? `Portal publish created for ${selectedPartnerNames.join(', ')}${selectedPartnerIds.length > 3 ? ` +${selectedPartnerIds.length - 3}` : ''}.`
                      : 'Syndication run recorded.'}
                  </p>
                </div>
              ) : null}

              <div className="flex items-center justify-between">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCurrentStep(2)}
                  className="gap-2"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
                <Button
                  type="button"
                  className="gap-2"
                  disabled={
                    !selectedProfileId ||
                    activeProductIds.length === 0 ||
                    publishing ||
                    selectedPartnerIds.length === 0
                  }
                  onClick={() => void handleCreateSyndicationRun()}
                >
                  <Radio className="h-4 w-4" />
                  {publishing ? 'Publishing…' : 'Publish to Partner Portal'}
                </Button>
              </div>
            </div>
          </section>
        )}

        {/* Recent activity */}
        {(publishResult?.run || recentRuns.length > 0 || recentPublishes.length > 0) ? (
          <section className="rounded-2xl border border-border/60 bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Recent Activity</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Portal publishes and syndication runs for this account.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {recentRuns.slice(0, 3).map((run) => (
                  <span
                    key={run.id}
                    className="rounded-full border border-border/70 bg-muted/20 px-2.5 py-1 text-xs text-muted-foreground"
                  >
                    Portal · {run.productCount}
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
          </section>
        ) : null}
      </PageContentContainer>
    </div>
  )
}
