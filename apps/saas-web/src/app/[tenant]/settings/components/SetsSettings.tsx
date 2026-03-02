'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Link2, Package, Search, Trash2, Users2, WandSparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageLoader } from '@/components/ui/loading-spinner';
import { PageContentContainer } from '@/components/ui/page-content-container';

interface SetsSettingsProps {
  tenantSlug: string;
}

type ShareSetModule = 'assets' | 'products';

const USAGE_GROUP_OPTIONS = [
  { id: 'specifications', label: 'Specifications' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'compliance', label: 'Compliance' },
  { id: 'training', label: 'Training' },
  { id: 'sales', label: 'Sales' },
  { id: 'packaging', label: 'Packaging' },
  { id: 'lifestyle', label: 'Lifestyle' },
  { id: 'regulatory', label: 'Regulatory' },
];

function getSetModuleLabel(moduleKey: ShareSetModule): 'Assets' | 'Products' {
  return moduleKey === 'assets' ? 'Assets' : 'Products';
}

interface AssetSetSummary {
  id: string;
  module_key: 'assets';
  name: string;
  description: string | null;
  asset_count: number;
  folder_count: number;
  item_count: number;
  scoped_item_count: number;
  market_count: number;
  channel_count: number;
  locale_count: number;
  shared_with_member_count: number;
  grant_count: number;
  created_at: string | null;
  updated_at: string | null;
}

interface ProductSetSummary {
  id: string;
  module_key: 'products';
  name: string;
  description: string | null;
  product_count: number;
  variant_count: number;
  item_count: number;
  scoped_item_count: number;
  market_count: number;
  channel_count: number;
  locale_count: number;
  shared_with_member_count: number;
  grant_count: number;
  created_at: string | null;
  updated_at: string | null;
}

type SetSummary = AssetSetSummary | ProductSetSummary;

interface ShareSetOption {
  id: string;
  module_key: ShareSetModule;
  name: string;
}

interface PartnerOption {
  id: string;
  name: string;
  slug: string;
  partner_category: string | null;
}

interface PartnerGrant {
  id: string;
  partner_organization_id: string;
  access_level: 'view' | 'edit';
  status: 'active' | 'revoked';
  expires_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  partner: PartnerOption | null;
}

interface SetsPayload {
  success: boolean;
  data: {
    asset_sets: AssetSetSummary[];
    product_sets: ProductSetSummary[];
  };
  meta?: {
    page: number;
    page_size: number;
    total_asset_sets: number;
    total_product_sets: number;
    total_sets?: number;
    total_active_grants?: number;
    total_shared_partners?: number;
  };
  capabilities?: {
    product_sets_enabled: boolean;
    share_sets_v2?: boolean;
  };
}

interface SetGrantsPayload {
  success: boolean;
  data: {
    grants: PartnerGrant[];
    available_partners: PartnerOption[];
  };
}

interface FolderData {
  id: string;
  name: string;
  path: string;
  parentId: string | null;
}

interface ProductFamilyData {
  id: string;
  name: string;
  code: string;
}

interface ShareSetDynamicRule {
  id: string;
  share_set_id: string;
  organization_id: string;
  name: string | null;
  is_active: boolean;
  priority: number;
  include_tags: string[];
  include_folder_ids: string[];
  include_usage_group_ids: string[];
  include_product_types: string[];
  include_product_family_ids: string[];
  include_product_name_contains: string[];
  exclude_tags: string[];
  exclude_folder_ids: string[];
  exclude_product_types: string[];
  exclude_product_family_ids: string[];
  exclude_product_name_contains: string[];
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface SetRulesPayload {
  success: boolean;
  data: {
    set: {
      id: string;
      module_key: ShareSetModule;
    };
    rules: ShareSetDynamicRule[];
  };
}

function splitCsvTokens(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(',')
        .map((token) => token.trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

export default function SetsSettings({ tenantSlug }: SetsSettingsProps) {
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [createName, setCreateName] = useState('');
  const [createModule, setCreateModule] = useState<ShareSetModule>('assets');
  const [assetSets, setAssetSets] = useState<AssetSetSummary[]>([]);
  const [productSets, setProductSets] = useState<ProductSetSummary[]>([]);
  const [productSetsEnabled, setProductSetsEnabled] = useState(false);
  const [shareSetsV2Enabled, setShareSetsV2Enabled] = useState(false);
  const [selectedGrantSetId, setSelectedGrantSetId] = useState('');
  const [selectedPartnerId, setSelectedPartnerId] = useState('');
  const [grantAccessLevel, setGrantAccessLevel] = useState<'view' | 'edit'>('view');
  const [grantsLoading, setGrantsLoading] = useState(false);
  const [grantsSubmitting, setGrantsSubmitting] = useState(false);
  const [revokingGrantId, setRevokingGrantId] = useState<string | null>(null);
  const [grantsError, setGrantsError] = useState<string | null>(null);
  const [availablePartners, setAvailablePartners] = useState<PartnerOption[]>([]);
  const [activeGrants, setActiveGrants] = useState<PartnerGrant[]>([]);
  const [selectedRuleSetId, setSelectedRuleSetId] = useState('');
  const [pendingRuleSetSelectionId, setPendingRuleSetSelectionId] = useState<string | null>(null);
  const [setRules, setSetRules] = useState<ShareSetDynamicRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [rulesSubmitting, setRulesSubmitting] = useState(false);
  const [rulesError, setRulesError] = useState<string | null>(null);
  const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null);
  const [folders, setFolders] = useState<FolderData[]>([]);
  const [productFamilies, setProductFamilies] = useState<ProductFamilyData[]>([]);
  const [ruleName, setRuleName] = useState('');
  const [rulePriority, setRulePriority] = useState('100');
  const [ruleIncludeTags, setRuleIncludeTags] = useState('');
  const [ruleExcludeTags, setRuleExcludeTags] = useState('');
  const [ruleIncludeUsageGroups, setRuleIncludeUsageGroups] = useState('');
  const [ruleIncludeFolderId, setRuleIncludeFolderId] = useState('');
  const [ruleExcludeFolderId, setRuleExcludeFolderId] = useState('');
  const [ruleIncludeFolderIds, setRuleIncludeFolderIds] = useState<string[]>([]);
  const [ruleExcludeFolderIds, setRuleExcludeFolderIds] = useState<string[]>([]);
  const [ruleIncludeProductFamilyId, setRuleIncludeProductFamilyId] = useState('');
  const [ruleExcludeProductFamilyId, setRuleExcludeProductFamilyId] = useState('');
  const [ruleIncludeProductFamilyIds, setRuleIncludeProductFamilyIds] = useState<string[]>([]);
  const [ruleExcludeProductFamilyIds, setRuleExcludeProductFamilyIds] = useState<string[]>([]);
  const [ruleIncludeProductNameContains, setRuleIncludeProductNameContains] = useState('');
  const [ruleExcludeProductNameContains, setRuleExcludeProductNameContains] = useState('');

  const allSets = useMemo<ShareSetOption[]>(
    () => [
      ...assetSets.map((set) => ({
        id: set.id,
        module_key: 'assets' as const,
        name: set.name,
      })),
      ...productSets.map((set) => ({
        id: set.id,
        module_key: 'products' as const,
        name: set.name,
      })),
    ],
    [assetSets, productSets]
  );

  const allSetSummaries = useMemo<SetSummary[]>(
    () => [...assetSets, ...productSets],
    [assetSets, productSets]
  );

  const selectedRuleSet = useMemo(
    () => allSets.find((set) => set.id === selectedRuleSetId) || null,
    [allSets, selectedRuleSetId]
  );

  const activeSet = useMemo(
    () => allSetSummaries.find((set) => set.id === selectedRuleSetId) || null,
    [allSetSummaries, selectedRuleSetId]
  );

  const selectSetForWorkspace = useCallback((setId: string) => {
    setSelectedRuleSetId(setId);
    setSelectedGrantSetId(setId);
  }, []);

  const folderLabelById = useMemo(() => {
    const lookup = new Map<string, string>();
    for (const folder of folders) {
      lookup.set(folder.id, folder.path || folder.name || folder.id);
    }
    return lookup;
  }, [folders]);

  const familyLabelById = useMemo(() => {
    const lookup = new Map<string, string>();
    for (const family of productFamilies) {
      lookup.set(family.id, family.name || family.code || family.id);
    }
    return lookup;
  }, [productFamilies]);

  useEffect(() => {
    if (allSets.length === 0) {
      setSelectedGrantSetId('');
      return;
    }
    const exists = allSets.some((set) => set.id === selectedGrantSetId);
    if (!exists) {
      setSelectedGrantSetId(allSets[0].id);
    }
  }, [allSets, selectedGrantSetId]);

  useEffect(() => {
    if (allSets.length === 0) {
      setSelectedRuleSetId('');
      return;
    }
    const exists = allSets.some((set) => set.id === selectedRuleSetId);
    if (!exists) {
      setSelectedRuleSetId(allSets[0].id);
    }
  }, [allSets, selectedRuleSetId]);

  useEffect(() => {
    if (!pendingRuleSetSelectionId) return;
    const exists = allSets.some((set) => set.id === pendingRuleSetSelectionId);
    if (!exists) return;
    setSelectedRuleSetId(pendingRuleSetSelectionId);
    setSelectedGrantSetId(pendingRuleSetSelectionId);
    setPendingRuleSetSelectionId(null);
  }, [allSets, pendingRuleSetSelectionId]);

  const fetchSets = useCallback(
    async () => {
      setLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams();
        if (search.trim()) {
          query.set('search', search.trim());
        }
        query.set('page', '1');
        query.set('pageSize', '50');

        const response = await fetch(`/api/${tenantSlug}/sharing/sets?${query.toString()}`);
        const payload = (await response.json().catch(() => ({}))) as Partial<SetsPayload> & {
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error || 'Failed to load sets');
        }

        setAssetSets(payload.data?.asset_sets || []);
        setProductSets(payload.data?.product_sets || []);
        setProductSetsEnabled(Boolean(payload.capabilities?.product_sets_enabled));
        setShareSetsV2Enabled(Boolean(payload.capabilities?.share_sets_v2));
      } catch (err: any) {
        setError(err?.message || 'Failed to load sets');
      } finally {
        setLoading(false);
      }
    },
    [search, tenantSlug]
  );

  const fetchSetGrants = useCallback(
    async (setId: string, options?: { keepSelectedPartner?: boolean }) => {
      if (!setId) {
        setAvailablePartners([]);
        setActiveGrants([]);
        return;
      }

      setGrantsLoading(true);
      setGrantsError(null);
      try {
        const response = await fetch(`/api/${tenantSlug}/sharing/sets/${setId}/grants`);
        const payload = (await response.json().catch(() => ({}))) as Partial<SetGrantsPayload> & {
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error || 'Failed to load partner assignments');
        }

        const partners = payload.data?.available_partners || [];
        const grants = payload.data?.grants || [];
        setAvailablePartners(partners);
        setActiveGrants(grants.filter((grant) => grant.status === 'active'));

        if (!options?.keepSelectedPartner) {
          setSelectedPartnerId((prev) => {
            if (prev && partners.some((partner) => partner.id === prev)) {
              return prev;
            }
            return partners[0]?.id || '';
          });
        }
      } catch (err: any) {
        setGrantsError(err?.message || 'Failed to load partner assignments');
        setAvailablePartners([]);
        setActiveGrants([]);
      } finally {
        setGrantsLoading(false);
      }
    },
    [tenantSlug]
  );

  const fetchSetRules = useCallback(
    async (setId: string) => {
      if (!setId) {
        setSetRules([]);
        return;
      }

      setRulesLoading(true);
      setRulesError(null);
      try {
        const response = await fetch(`/api/${tenantSlug}/sharing/sets/${setId}/rules`);
        const payload = (await response.json().catch(() => ({}))) as Partial<SetRulesPayload> & {
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error || 'Failed to load set rules');
        }
        setSetRules(payload.data?.rules || []);
      } catch (err: any) {
        setRulesError(err?.message || 'Failed to load set rules');
        setSetRules([]);
      } finally {
        setRulesLoading(false);
      }
    },
    [tenantSlug]
  );

  const fetchFolders = useCallback(async () => {
    try {
      const response = await fetch(`/api/organizations/${tenantSlug}/assets/folders`);
      if (!response.ok) {
        throw new Error(`Failed to fetch folders (${response.status})`);
      }
      const payload = await response.json();
      setFolders((payload?.data || []) as FolderData[]);
    } catch {
      setFolders([]);
    }
  }, [tenantSlug]);

  const fetchProductFamilies = useCallback(async () => {
    try {
      const response = await fetch(`/api/${tenantSlug}/product-families`);
      if (!response.ok) {
        throw new Error(`Failed to fetch product families (${response.status})`);
      }
      const payload = await response.json();
      setProductFamilies((payload?.data || []) as ProductFamilyData[]);
    } catch {
      setProductFamilies([]);
    }
  }, [tenantSlug]);

  const resetRuleForm = useCallback((moduleKey?: ShareSetModule) => {
    setRuleName('');
    setRulePriority('100');
    setRuleIncludeTags('');
    setRuleExcludeTags('');
    setRuleIncludeUsageGroups('');
    setRuleIncludeFolderId('');
    setRuleExcludeFolderId('');
    setRuleIncludeFolderIds([]);
    setRuleExcludeFolderIds([]);
    setRuleIncludeProductFamilyId('');
    setRuleExcludeProductFamilyId('');
    setRuleIncludeProductFamilyIds([]);
    setRuleExcludeProductFamilyIds([]);
    setRuleIncludeProductNameContains('');
    setRuleExcludeProductNameContains('');
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchSets();
    }, 250);
    return () => clearTimeout(timeout);
  }, [fetchSets]);

  useEffect(() => {
    void fetchFolders();
  }, [fetchFolders]);

  useEffect(() => {
    void fetchProductFamilies();
  }, [fetchProductFamilies]);

  useEffect(() => {
    if (!selectedGrantSetId || !shareSetsV2Enabled) {
      setAvailablePartners([]);
      setActiveGrants([]);
      return;
    }
    void fetchSetGrants(selectedGrantSetId);
  }, [fetchSetGrants, selectedGrantSetId, shareSetsV2Enabled]);

  useEffect(() => {
    if (!selectedRuleSetId || !shareSetsV2Enabled) {
      setSetRules([]);
      return;
    }
    void fetchSetRules(selectedRuleSetId);
  }, [fetchSetRules, selectedRuleSetId, shareSetsV2Enabled]);

  useEffect(() => {
    if (!selectedRuleSet) return;
    resetRuleForm(selectedRuleSet.module_key);
  }, [resetRuleForm, selectedRuleSet]);

  useEffect(() => {
    if (!productSetsEnabled && createModule === 'products') {
      setCreateModule('assets');
    }
  }, [createModule, productSetsEnabled]);

  const createSet = useCallback(async () => {
    const trimmedName = createName.trim();
    if (!trimmedName) {
      setCreateError('Set name is required');
      return;
    }

    setCreating(true);
    setCreateError(null);
    try {
      const response = await fetch(`/api/${tenantSlug}/sharing/sets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: trimmedName,
          module: createModule,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        data?: {
          id?: string;
        };
      };
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to create set');
      }

      setCreateName('');
      const createdSetId = payload.data?.id;
      if (createdSetId) {
        setPendingRuleSetSelectionId(createdSetId);
      }
      await fetchSets();
    } catch (err: any) {
      setCreateError(err?.message || 'Failed to create set');
    } finally {
      setCreating(false);
    }
  }, [createModule, createName, fetchSets, tenantSlug]);

  const assignPartnerGrant = useCallback(async () => {
    if (!selectedGrantSetId || !selectedPartnerId) return;

    setGrantsSubmitting(true);
    setGrantsError(null);
    try {
      const response = await fetch(
        `/api/${tenantSlug}/sharing/sets/${selectedGrantSetId}/grants`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            partnerOrganizationId: selectedPartnerId,
            accessLevel: grantAccessLevel,
          }),
        }
      );
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to assign partner to set');
      }

      await Promise.all([
        fetchSetGrants(selectedGrantSetId, { keepSelectedPartner: true }),
        fetchSets(),
      ]);
    } catch (err: any) {
      setGrantsError(err?.message || 'Failed to assign partner to set');
    } finally {
      setGrantsSubmitting(false);
    }
  }, [
    fetchSetGrants,
    fetchSets,
    grantAccessLevel,
    selectedGrantSetId,
    selectedPartnerId,
    tenantSlug,
  ]);

  const revokePartnerGrant = useCallback(
    async (grantId: string) => {
      if (!selectedGrantSetId || !grantId) return;

      setRevokingGrantId(grantId);
      setGrantsError(null);
      try {
        const response = await fetch(
          `/api/${tenantSlug}/sharing/sets/${selectedGrantSetId}/grants?grantId=${encodeURIComponent(grantId)}`,
          { method: 'DELETE' }
        );
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) {
          throw new Error(payload.error || 'Failed to revoke partner assignment');
        }

        await Promise.all([
          fetchSetGrants(selectedGrantSetId, { keepSelectedPartner: true }),
          fetchSets(),
        ]);
      } catch (err: any) {
        setGrantsError(err?.message || 'Failed to revoke partner assignment');
      } finally {
        setRevokingGrantId(null);
      }
    },
    [fetchSetGrants, fetchSets, selectedGrantSetId, tenantSlug]
  );

  const addRuleFolder = useCallback((scope: 'include' | 'exclude') => {
    if (scope === 'include') {
      const nextId = ruleIncludeFolderId.trim();
      if (!nextId) return;
      setRuleIncludeFolderIds((prev) => Array.from(new Set([...prev, nextId])));
      setRuleIncludeFolderId('');
      return;
    }
    const nextId = ruleExcludeFolderId.trim();
    if (!nextId) return;
    setRuleExcludeFolderIds((prev) => Array.from(new Set([...prev, nextId])));
    setRuleExcludeFolderId('');
  }, [ruleExcludeFolderId, ruleIncludeFolderId]);

  const removeRuleFolder = useCallback((scope: 'include' | 'exclude', folderId: string) => {
    if (scope === 'include') {
      setRuleIncludeFolderIds((prev) => prev.filter((id) => id !== folderId));
      return;
    }
    setRuleExcludeFolderIds((prev) => prev.filter((id) => id !== folderId));
  }, []);

  const addRuleProductFamily = useCallback((scope: 'include' | 'exclude') => {
    if (scope === 'include') {
      const nextId = ruleIncludeProductFamilyId.trim();
      if (!nextId) return;
      setRuleIncludeProductFamilyIds((prev) => Array.from(new Set([...prev, nextId])));
      setRuleIncludeProductFamilyId('');
      return;
    }
    const nextId = ruleExcludeProductFamilyId.trim();
    if (!nextId) return;
    setRuleExcludeProductFamilyIds((prev) => Array.from(new Set([...prev, nextId])));
    setRuleExcludeProductFamilyId('');
  }, [ruleExcludeProductFamilyId, ruleIncludeProductFamilyId]);

  const removeRuleProductFamily = useCallback((scope: 'include' | 'exclude', familyId: string) => {
    if (scope === 'include') {
      setRuleIncludeProductFamilyIds((prev) => prev.filter((id) => id !== familyId));
      return;
    }
    setRuleExcludeProductFamilyIds((prev) => prev.filter((id) => id !== familyId));
  }, []);

  const createRule = useCallback(async () => {
    if (!selectedRuleSet) return;

    const payload: Record<string, unknown> = {
      name: ruleName.trim() || null,
      priority: Number.isFinite(Number(rulePriority)) ? Number(rulePriority) : 100,
      isActive: true,
      includeTags: splitCsvTokens(ruleIncludeTags),
      excludeTags: splitCsvTokens(ruleExcludeTags),
      includeFolderIds: ruleIncludeFolderIds,
      excludeFolderIds: ruleExcludeFolderIds,
      includeUsageGroupIds: splitCsvTokens(ruleIncludeUsageGroups),
      includeProductTypes: [],
      excludeProductTypes: [],
      includeProductFamilyIds: selectedRuleSet.module_key === 'products' ? ruleIncludeProductFamilyIds : [],
      excludeProductFamilyIds: selectedRuleSet.module_key === 'products' ? ruleExcludeProductFamilyIds : [],
      includeProductNameContains: selectedRuleSet.module_key === 'products' ? splitCsvTokens(ruleIncludeProductNameContains) : [],
      excludeProductNameContains: selectedRuleSet.module_key === 'products' ? splitCsvTokens(ruleExcludeProductNameContains) : [],
    };

    setRulesSubmitting(true);
    setRulesError(null);
    try {
      const response = await fetch(`/api/${tenantSlug}/sharing/sets/${selectedRuleSet.id}/rules`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error || 'Failed to create rule');
      }
      await fetchSetRules(selectedRuleSet.id);
      resetRuleForm(selectedRuleSet.module_key);
    } catch (err: any) {
      setRulesError(err?.message || 'Failed to create rule');
    } finally {
      setRulesSubmitting(false);
    }
  }, [
    fetchSetRules,
    resetRuleForm,
    ruleExcludeFolderIds,
    ruleExcludeProductFamilyIds,
    ruleExcludeProductNameContains,
    ruleExcludeTags,
    ruleIncludeFolderIds,
    ruleIncludeProductFamilyIds,
    ruleIncludeProductNameContains,
    ruleIncludeTags,
    ruleIncludeUsageGroups,
    ruleName,
    rulePriority,
    selectedRuleSet,
    tenantSlug,
  ]);

  const deleteRule = useCallback(async (ruleId: string) => {
    if (!selectedRuleSet || !ruleId) return;
    setDeletingRuleId(ruleId);
    setRulesError(null);
    try {
      const response = await fetch(
        `/api/${tenantSlug}/sharing/sets/${selectedRuleSet.id}/rules?ruleId=${encodeURIComponent(ruleId)}`,
        { method: 'DELETE' }
      );
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error || 'Failed to delete rule');
      }
      await fetchSetRules(selectedRuleSet.id);
    } catch (err: any) {
      setRulesError(err?.message || 'Failed to delete rule');
    } finally {
      setDeletingRuleId(null);
    }
  }, [fetchSetRules, selectedRuleSet, tenantSlug]);

  if (loading) {
    return <PageLoader text="Loading sets..." size="lg" />;
  }

  return (
    <PageContentContainer mode="content" className="space-y-6">
      <div className="rounded-lg border border-border bg-background p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">Sets Workflow</h2>
            <p className="text-sm text-foreground/80">
              Follow this flow: create a set, select the set, manage membership, then configure rules and partner access.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/${tenantSlug}/assets`}>
              <Button variant="outline" size="sm">Open Assets</Button>
            </Link>
            <Link href={`/${tenantSlug}/products`}>
              <Button variant="outline" size="sm">Open Products</Button>
            </Link>
          </div>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-5">
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-foreground/80">1. Create set</div>
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-foreground/80">2. Select set</div>
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-foreground/80">3. Manage membership</div>
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-foreground/80">4. Configure rules</div>
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-foreground/80">5. Assign partners</div>
        </div>
      </div>

      {!shareSetsV2Enabled ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Legacy mode detected. Apply `packages/database/migrations/20260305_add_share_sets_foundation.sql`, then refresh schema cache and restart the app. Product Sets and Partner Assignments stay disabled until this is available.
        </div>
      ) : null}

      <div className="rounded-lg border border-border bg-background p-4">
        <div className="mb-3 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-foreground/70" />
          <p className="text-sm font-semibold text-foreground">Step 1: Create Set</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[140px]">
            <p className="mb-2 text-xs uppercase tracking-wide text-foreground/70">Module</p>
            <select
              value={createModule}
              onChange={(event) => setCreateModule(event.target.value as ShareSetModule)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
              disabled={creating}
            >
              <option value="assets">Assets</option>
              <option value="products" disabled={!productSetsEnabled}>
                {productSetsEnabled ? 'Products' : 'Products (Unavailable)'}
              </option>
            </select>
          </div>
          <div className="min-w-[220px] flex-1">
            <p className="mb-2 text-xs uppercase tracking-wide text-foreground/70">Set Name</p>
            <Input
              value={createName}
              onChange={(event) => setCreateName(event.target.value)}
              placeholder="Example: Mexico Distributor Core"
              disabled={creating}
            />
          </div>
          <Button onClick={createSet} disabled={creating || !createName.trim()}>
            {creating ? 'Creating...' : 'Create Set'}
          </Button>
        </div>
        <p className="mt-2 text-xs text-foreground/70">
          Use one set per partner group or campaign to keep access rules clear.
        </p>
        {createError ? <p className="mt-3 text-sm text-red-600">{createError}</p> : null}
      </div>

      <div className="rounded-lg border border-border bg-background p-4">
        <div className="mb-3 flex items-center gap-2">
          <ArrowRight className="h-4 w-4 text-foreground/70" />
          <p className="text-sm font-semibold text-foreground">Step 2: Select Set To Edit</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/70" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9"
              placeholder="Search set names..."
            />
          </div>
          <div>
            <select
              value={selectedRuleSetId}
              onChange={(event) => selectSetForWorkspace(event.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
              disabled={allSets.length === 0}
            >
              {allSets.length === 0 ? (
                <option value="">No sets available</option>
              ) : (
                allSets.map((set) => (
                  <option key={set.id} value={set.id}>
                    {set.name} ({getSetModuleLabel(set.module_key)})
                  </option>
                ))
              )}
            </select>
          </div>
        </div>
        {activeSet ? (
          <p className="mt-2 text-xs text-foreground/70">
            Active set: {activeSet.name} ({getSetModuleLabel(activeSet.module_key)})
          </p>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="rounded-lg border border-border bg-background">
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-semibold text-foreground">Asset Sets (Select One To Edit)</p>
          <p className="text-xs text-foreground/70">
            Click a row to make it the active set. Membership is managed in Assets via "Add Selection To Set".
          </p>
        </div>
        {assetSets.length === 0 ? (
          <div className="p-8 text-center">
            <Link2 className="mx-auto h-8 w-8 text-foreground/70" />
            <p className="mt-3 text-sm text-foreground/70">No asset sets found.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {assetSets.map((row) => {
              const isActive = selectedRuleSetId === row.id;
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => selectSetForWorkspace(row.id)}
                  className={`grid w-full grid-cols-1 gap-3 px-4 py-3 text-left md:grid-cols-5 ${
                    isActive ? 'bg-primary/5' : 'hover:bg-muted/30'
                  }`}
                >
                  <div className="md:col-span-2">
                    <p className="text-sm font-medium text-foreground">{row.name}</p>
                    {row.description ? (
                      <p className="text-xs text-foreground/70">{row.description}</p>
                    ) : null}
                  </div>
                  <div className="text-sm text-foreground/80">
                    <span className="font-medium text-foreground">{row.asset_count}</span> assets
                  </div>
                  <div className="text-sm text-foreground/80">
                    <span className="font-medium text-foreground">{row.folder_count}</span> folders
                  </div>
                  <div className="text-sm text-foreground/80">
                    <span className="font-medium text-foreground">{row.scoped_item_count}</span> scoped
                  </div>
                  <div className="text-sm text-foreground/80">
                    <span className="font-medium text-foreground">{row.shared_with_member_count}</span> partners
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border bg-background">
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-semibold text-foreground">Product Sets (Select One To Edit)</p>
          <p className="text-xs text-foreground/70">
            Click a row to make it the active set. Membership is managed in Products via "Add Selection To Set".
          </p>
        </div>
        {productSets.length === 0 ? (
          <div className="p-8 text-center">
            <Package className="mx-auto h-8 w-8 text-foreground/70" />
            <p className="mt-3 text-sm text-foreground/70">No product sets found.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {productSets.map((row) => {
              const isActive = selectedRuleSetId === row.id;
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => selectSetForWorkspace(row.id)}
                  className={`grid w-full grid-cols-1 gap-3 px-4 py-3 text-left md:grid-cols-5 ${
                    isActive ? 'bg-primary/5' : 'hover:bg-muted/30'
                  }`}
                >
                  <div className="md:col-span-2">
                    <p className="text-sm font-medium text-foreground">{row.name}</p>
                    {row.description ? (
                      <p className="text-xs text-foreground/70">{row.description}</p>
                    ) : null}
                  </div>
                  <div className="text-sm text-foreground/80">
                    <span className="font-medium text-foreground">{row.product_count}</span> products
                  </div>
                  <div className="text-sm text-foreground/80">
                    <span className="font-medium text-foreground">{row.variant_count}</span> variants
                  </div>
                  <div className="text-sm text-foreground/80">
                    <span className="font-medium text-foreground">{row.scoped_item_count}</span> scoped
                  </div>
                  <div className="text-sm text-foreground/80">
                    <span className="font-medium text-foreground">{row.shared_with_member_count}</span> partners
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border bg-background p-4">
        <div className="mb-2 flex items-center gap-2">
          <Package className="h-4 w-4 text-foreground/70" />
          <p className="text-sm font-semibold text-foreground">Step 3: Manage Membership</p>
        </div>
        {!activeSet ? (
          <p className="text-sm text-foreground/70">
            Select an asset or product set above to manage it.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-foreground">
              Editing <span className="font-medium">{activeSet.name}</span> ({getSetModuleLabel(activeSet.module_key)})
            </p>
            <p className="text-xs text-foreground/70">
              Add and remove set members in the {activeSet.module_key === 'assets' ? 'Assets' : 'Products'} page using "Add Selection To Set".
            </p>
            <div className="flex flex-wrap gap-2">
              <Link href={activeSet.module_key === 'assets' ? `/${tenantSlug}/assets` : `/${tenantSlug}/products`}>
                <Button size="sm">
                  Manage {activeSet.module_key === 'assets' ? 'Asset' : 'Product'} Membership
                </Button>
              </Link>
              <Link href={activeSet.module_key === 'assets' ? `/${tenantSlug}/products` : `/${tenantSlug}/assets`}>
                <Button size="sm" variant="outline">
                  Open {activeSet.module_key === 'assets' ? 'Products' : 'Assets'}
                </Button>
              </Link>
            </div>
          </div>
        )}
      </div>

      {shareSetsV2Enabled ? (
        <div className="rounded-lg border border-border bg-background">
          <div className="border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <WandSparkles className="h-4 w-4 text-foreground/70" />
              <p className="text-sm font-semibold text-foreground">Step 4: Set Rules</p>
            </div>
            <p className="text-xs text-foreground/70">
              Auto-populate set membership with rules. Asset rules support tags/folders/usage group.
              Product rules support model (family) and name contains matching.
              Market/channel access is still controlled by set scope and partner grants.
            </p>
          </div>

          {allSets.length === 0 ? (
            <div className="p-4 text-sm text-foreground/70">
              Create at least one set before adding rules.
            </div>
          ) : (
            <div className="space-y-4 p-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="md:col-span-1">
                  <p className="mb-2 text-xs uppercase tracking-wide text-foreground/70">Active Set</p>
                  <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-sm text-foreground">
                    {selectedRuleSet ? (
                      <span>{selectedRuleSet.name} ({getSetModuleLabel(selectedRuleSet.module_key)})</span>
                    ) : (
                      <span>No set selected</span>
                    )}
                  </div>
                </div>
                <div className="md:col-span-1">
                  <p className="mb-2 text-xs uppercase tracking-wide text-foreground/70">Rule Name</p>
                  <Input
                    value={ruleName}
                    onChange={(event) => setRuleName(event.target.value)}
                    placeholder="Optional rule name"
                    disabled={!selectedRuleSet}
                  />
                </div>
                <div className="md:col-span-1">
                  <p className="mb-2 text-xs uppercase tracking-wide text-foreground/70">Priority</p>
                  <Input
                    value={rulePriority}
                    onChange={(event) => setRulePriority(event.target.value)}
                    placeholder="100"
                    disabled={!selectedRuleSet}
                  />
                </div>
              </div>

              {selectedRuleSet?.module_key === 'assets' ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <p className="mb-2 text-xs uppercase tracking-wide text-foreground/70">Include Tags (csv)</p>
                    <Input
                      value={ruleIncludeTags}
                      onChange={(event) => setRuleIncludeTags(event.target.value)}
                      placeholder="new, retail, launch"
                    />
                  </div>
                  <div>
                    <p className="mb-2 text-xs uppercase tracking-wide text-foreground/70">Exclude Tags (csv)</p>
                    <Input
                      value={ruleExcludeTags}
                      onChange={(event) => setRuleExcludeTags(event.target.value)}
                      placeholder="draft, deprecated"
                    />
                  </div>
                  <div>
                    <p className="mb-2 text-xs uppercase tracking-wide text-foreground/70">Include Usage Groups (csv)</p>
                    <Input
                      value={ruleIncludeUsageGroups}
                      onChange={(event) => setRuleIncludeUsageGroups(event.target.value)}
                      placeholder={USAGE_GROUP_OPTIONS.map((entry) => entry.id).join(', ')}
                    />
                  </div>
                  <div>
                    <p className="mb-2 text-xs uppercase tracking-wide text-foreground/70">Include Folder</p>
                    <div className="flex gap-2">
                      <select
                        value={ruleIncludeFolderId}
                        onChange={(event) => setRuleIncludeFolderId(event.target.value)}
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                      >
                        <option value="">Select folder</option>
                        {folders.map((folder) => (
                          <option key={folder.id} value={folder.id}>
                            {folder.path || folder.name}
                          </option>
                        ))}
                      </select>
                      <Button type="button" variant="outline" onClick={() => addRuleFolder('include')}>
                        Add
                      </Button>
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-xs uppercase tracking-wide text-foreground/70">Exclude Folder</p>
                    <div className="flex gap-2">
                      <select
                        value={ruleExcludeFolderId}
                        onChange={(event) => setRuleExcludeFolderId(event.target.value)}
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                      >
                        <option value="">Select folder</option>
                        {folders.map((folder) => (
                          <option key={folder.id} value={folder.id}>
                            {folder.path || folder.name}
                          </option>
                        ))}
                      </select>
                      <Button type="button" variant="outline" onClick={() => addRuleFolder('exclude')}>
                        Add
                      </Button>
                    </div>
                  </div>
                  <div className="md:col-span-2 space-y-2">
                    <div className="text-xs text-foreground/70">Included folders</div>
                    <div className="flex flex-wrap gap-2">
                      {ruleIncludeFolderIds.length === 0 ? (
                        <span className="text-xs text-foreground/60">None</span>
                      ) : (
                        ruleIncludeFolderIds.map((folderId) => (
                          <button
                            key={`include-${folderId}`}
                            type="button"
                            onClick={() => removeRuleFolder('include', folderId)}
                            className="rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-muted"
                          >
                            {folderLabelById.get(folderId) || folderId} x
                          </button>
                        ))
                      )}
                    </div>
                    <div className="text-xs text-foreground/70">Excluded folders</div>
                    <div className="flex flex-wrap gap-2">
                      {ruleExcludeFolderIds.length === 0 ? (
                        <span className="text-xs text-foreground/60">None</span>
                      ) : (
                        ruleExcludeFolderIds.map((folderId) => (
                          <button
                            key={`exclude-${folderId}`}
                            type="button"
                            onClick={() => removeRuleFolder('exclude', folderId)}
                            className="rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-muted"
                          >
                            {folderLabelById.get(folderId) || folderId} x
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <p className="mb-2 text-xs uppercase tracking-wide text-foreground/70">Include Product Model</p>
                    <div className="flex gap-2">
                      <select
                        value={ruleIncludeProductFamilyId}
                        onChange={(event) => setRuleIncludeProductFamilyId(event.target.value)}
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                      >
                        <option value="">Select model</option>
                        {productFamilies.map((family) => (
                          <option key={family.id} value={family.id}>
                            {family.name}
                          </option>
                        ))}
                      </select>
                      <Button type="button" variant="outline" onClick={() => addRuleProductFamily('include')}>
                        Add
                      </Button>
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-xs uppercase tracking-wide text-foreground/70">Exclude Product Model</p>
                    <div className="flex gap-2">
                      <select
                        value={ruleExcludeProductFamilyId}
                        onChange={(event) => setRuleExcludeProductFamilyId(event.target.value)}
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                      >
                        <option value="">Select model</option>
                        {productFamilies.map((family) => (
                          <option key={family.id} value={family.id}>
                            {family.name}
                          </option>
                        ))}
                      </select>
                      <Button type="button" variant="outline" onClick={() => addRuleProductFamily('exclude')}>
                        Add
                      </Button>
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-xs uppercase tracking-wide text-foreground/70">Product Name Contains (csv)</p>
                    <Input
                      value={ruleIncludeProductNameContains}
                      onChange={(event) => setRuleIncludeProductNameContains(event.target.value)}
                      placeholder="hydra, whey, peach"
                    />
                  </div>
                  <div>
                    <p className="mb-2 text-xs uppercase tracking-wide text-foreground/70">Exclude Name Contains (csv)</p>
                    <Input
                      value={ruleExcludeProductNameContains}
                      onChange={(event) => setRuleExcludeProductNameContains(event.target.value)}
                      placeholder="test, draft"
                    />
                  </div>
                  <div className="md:col-span-2 space-y-2">
                    <div className="text-xs text-foreground/70">Included models</div>
                    <div className="flex flex-wrap gap-2">
                      {ruleIncludeProductFamilyIds.length === 0 ? (
                        <span className="text-xs text-foreground/60">None</span>
                      ) : (
                        ruleIncludeProductFamilyIds.map((familyId) => (
                          <button
                            key={`include-family-${familyId}`}
                            type="button"
                            onClick={() => removeRuleProductFamily('include', familyId)}
                            className="rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-muted"
                          >
                            {familyLabelById.get(familyId) || familyId} x
                          </button>
                        ))
                      )}
                    </div>
                    <div className="text-xs text-foreground/70">Excluded models</div>
                    <div className="flex flex-wrap gap-2">
                      {ruleExcludeProductFamilyIds.length === 0 ? (
                        <span className="text-xs text-foreground/60">None</span>
                      ) : (
                        ruleExcludeProductFamilyIds.map((familyId) => (
                          <button
                            key={`exclude-family-${familyId}`}
                            type="button"
                            onClick={() => removeRuleProductFamily('exclude', familyId)}
                            className="rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-muted"
                          >
                            {familyLabelById.get(familyId) || familyId} x
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2">
                <Button onClick={createRule} disabled={rulesSubmitting || !selectedRuleSet}>
                  {rulesSubmitting ? 'Saving Rule...' : 'Add Rule'}
                </Button>
                <Button variant="outline" onClick={() => resetRuleForm(selectedRuleSet?.module_key)} disabled={rulesSubmitting}>
                  Reset
                </Button>
              </div>

              {rulesError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {rulesError}
                </div>
              ) : null}

              <div className="rounded-lg border border-border">
                <div className="border-b border-border px-3 py-2 text-sm font-semibold text-foreground">
                  Active Rules
                </div>
                {rulesLoading ? (
                  <div className="p-3 text-sm text-foreground/70">Loading rules...</div>
                ) : setRules.length === 0 ? (
                  <div className="p-3 text-sm text-foreground/70">No rules configured.</div>
                ) : (
                  <div className="divide-y divide-border">
                    {setRules.map((rule) => (
                      <div key={rule.id} className="grid grid-cols-1 gap-2 px-3 py-2 md:grid-cols-7">
                        <div className="md:col-span-2">
                          <p className="text-sm font-medium text-foreground">{rule.name || 'Unnamed rule'}</p>
                          <p className="text-xs text-foreground/70">priority: {rule.priority}</p>
                        </div>
                        <div className="text-xs text-foreground/80">
                          include tags: {rule.include_tags?.join(', ') || '-'}
                        </div>
                        <div className="text-xs text-foreground/80">
                          include usage: {rule.include_usage_group_ids?.join(', ') || '-'}
                        </div>
                        <div className="text-xs text-foreground/80">
                          include models:{' '}
                          {rule.include_product_family_ids?.map((familyId) => familyLabelById.get(familyId) || familyId).join(', ') || '-'}
                        </div>
                        <div className="text-xs text-foreground/80">
                          include name contains: {rule.include_product_name_contains?.join(', ') || '-'}
                        </div>
                        <div className="flex items-center justify-start md:justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => deleteRule(rule.id)}
                            disabled={deletingRuleId === rule.id}
                          >
                            <Trash2 className="mr-1 h-3 w-3" />
                            {deletingRuleId === rule.id ? 'Deleting...' : 'Delete'}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : null}

      {shareSetsV2Enabled ? (
        <div className="rounded-lg border border-border bg-background">
          <div className="border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <Users2 className="h-4 w-4 text-foreground/70" />
              <p className="text-sm font-semibold text-foreground">Step 5: Partner Assignments</p>
            </div>
            <p className="text-xs text-foreground/70">
              Assign sets to active partner relationships for controlled cross-organization visibility.
            </p>
          </div>
          {allSets.length === 0 ? (
            <div className="p-4 text-sm text-foreground/70">
              Create at least one set before assigning to partners.
            </div>
          ) : (
            <div className="space-y-4 p-4">
              <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-sm text-foreground">
                Active set:{' '}
                {activeSet ? `${activeSet.name} (${getSetModuleLabel(activeSet.module_key)})` : 'No set selected'}
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <p className="mb-2 text-xs uppercase tracking-wide text-foreground/70">Partner</p>
                  <select
                    value={selectedPartnerId}
                    onChange={(event) => setSelectedPartnerId(event.target.value)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                    disabled={availablePartners.length === 0}
                  >
                    {availablePartners.length === 0 ? (
                      <option value="">No active partners</option>
                    ) : (
                      availablePartners.map((partner) => (
                        <option key={partner.id} value={partner.id}>
                          {partner.name} ({partner.slug})
                        </option>
                      ))
                    )}
                  </select>
                </div>
                <div>
                  <p className="mb-2 text-xs uppercase tracking-wide text-foreground/70">Access</p>
                  <select
                    value={grantAccessLevel}
                    onChange={(event) => setGrantAccessLevel(event.target.value as 'view' | 'edit')}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                  >
                    <option value="view">view</option>
                    <option value="edit">edit</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <Button
                    className="w-full"
                    onClick={assignPartnerGrant}
                    disabled={grantsSubmitting || !selectedGrantSetId || !selectedPartnerId}
                  >
                    {grantsSubmitting ? 'Assigning...' : 'Assign To Partner'}
                  </Button>
                </div>
              </div>

              {grantsError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {grantsError}
                </div>
              ) : null}

              <div className="rounded-lg border border-border">
                <div className="border-b border-border px-3 py-2 text-sm font-semibold text-foreground">
                  Active Grants
                </div>
                {grantsLoading ? (
                  <div className="p-3 text-sm text-foreground/70">Loading partner grants...</div>
                ) : activeGrants.length === 0 ? (
                  <div className="p-3 text-sm text-foreground/70">
                    No active partner assignments for this set.
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {activeGrants.map((grant) => (
                      <div
                        key={grant.id}
                        className="grid grid-cols-1 items-center gap-2 px-3 py-2 md:grid-cols-5"
                      >
                        <div className="md:col-span-2">
                          <p className="text-sm text-foreground">
                            {grant.partner?.name || grant.partner_organization_id}
                          </p>
                          <p className="text-xs text-foreground/70">
                            {grant.partner?.slug || 'unknown partner'}
                          </p>
                        </div>
                        <div className="text-sm text-foreground/80">access: {grant.access_level}</div>
                        <div className="text-sm text-foreground/80">
                          updated:{' '}
                          {grant.updated_at ? new Date(grant.updated_at).toLocaleDateString() : 'n/a'}
                        </div>
                        <div className="flex justify-start md:justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => revokePartnerGrant(grant.id)}
                            disabled={revokingGrantId === grant.id}
                          >
                            {revokingGrantId === grant.id ? 'Revoking...' : 'Revoke'}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </PageContentContainer>
  );
}


