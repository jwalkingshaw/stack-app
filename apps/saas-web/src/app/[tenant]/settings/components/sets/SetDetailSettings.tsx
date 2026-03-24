'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageSkeleton } from '@/components/ui/loading-skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SettingsSecondLevelPage } from '../settings-page-content';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ShareSetModule = 'assets' | 'products';

interface SetInfo {
  id: string;
  name: string;
  module_key: ShareSetModule;
}

interface SetItem {
  id: string;
  resource_type: 'asset' | 'folder' | 'product' | 'variant';
  resource_id: string;
  include_descendants: boolean;
  market_ids: string[];
  channel_ids: string[];
  locale_ids: string[];
  destination_ids: string[];
  created_at: string | null;
  updated_at: string | null;
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

interface ShareSetDynamicRule {
  id: string;
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
  created_at: string;
  updated_at: string;
}

interface FolderOption {
  id: string;
  name: string;
  path: string;
}

interface FamilyOption {
  id: string;
  name: string;
  code: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function splitCsvTokens(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

const RESOURCE_TYPE_LABELS: Record<SetItem['resource_type'], string> = {
  asset: 'Asset',
  folder: 'Folder',
  product: 'Product',
  variant: 'Variant',
};

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

const PRODUCT_TYPE_OPTIONS = [
  { id: 'parent', label: 'Parent' },
  { id: 'variant', label: 'Variant' },
  { id: 'standalone', label: 'Standalone' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface SetDetailSettingsProps {
  tenantSlug: string;
  setId: string;
}

export default function SetDetailSettings({ tenantSlug, setId }: SetDetailSettingsProps) {
  // Core set info (comes from grants response)
  const [setInfo, setSetInfo] = useState<SetInfo | null>(null);
  const [activeTab, setActiveTab] = useState<'items' | 'grants' | 'rules'>('items');
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  // Items
  const [items, setItems] = useState<SetItem[]>([]);
  const [resolved, setResolved] = useState<Record<string, { name: string; sku?: string | null; parent_id?: string | null; thumbnail_url?: string | null }>>({});
  const [itemsLoading, setItemsLoading] = useState(true);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [removingItemId, setRemovingItemId] = useState<string | null>(null);

  // Grants
  const [grants, setGrants] = useState<PartnerGrant[]>([]);
  const [availablePartners, setAvailablePartners] = useState<PartnerOption[]>([]);
  const [grantsLoading, setGrantsLoading] = useState(true);
  const [grantsError, setGrantsError] = useState<string | null>(null);
  const [addPartnerId, setAddPartnerId] = useState('');
  const [addAccessLevel, setAddAccessLevel] = useState<'view' | 'edit'>('view');
  const [grantsSubmitting, setGrantsSubmitting] = useState(false);
  const [revokingGrantId, setRevokingGrantId] = useState<string | null>(null);

  // Markets containing this set (read-only context)
  const [setMarkets, setSetMarkets] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [setMarketsLoading, setSetMarketsLoading] = useState(true);

  // Rules
  const [rules, setRules] = useState<ShareSetDynamicRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [rulesError, setRulesError] = useState<string | null>(null);
  const [hasLoadedItems, setHasLoadedItems] = useState(false);
  const [hasLoadedRules, setHasLoadedRules] = useState(false);
  const [hasLoadedRuleReferenceData, setHasLoadedRuleReferenceData] = useState(false);
  const [rulesSubmitting, setRulesSubmitting] = useState(false);
  const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null);
  const [togglingRuleId, setTogglingRuleId] = useState<string | null>(null);

  // Rule form
  const [ruleName, setRuleName] = useState('');
  const [rulePriority, setRulePriority] = useState('100');
  const [ruleIncludeTags, setRuleIncludeTags] = useState('');
  const [ruleExcludeTags, setRuleExcludeTags] = useState('');
  const [ruleIncludeUsageGroupIds, setRuleIncludeUsageGroupIds] = useState<string[]>([]);
  const [ruleIncludeFolderId, setRuleIncludeFolderId] = useState('');
  const [ruleExcludeFolderId, setRuleExcludeFolderId] = useState('');
  const [ruleIncludeFolderIds, setRuleIncludeFolderIds] = useState<string[]>([]);
  const [ruleExcludeFolderIds, setRuleExcludeFolderIds] = useState<string[]>([]);
  const [ruleIncludeProductTypes, setRuleIncludeProductTypes] = useState<string[]>([]);
  const [ruleIncludeProductFamilyId, setRuleIncludeProductFamilyId] = useState('');
  const [ruleExcludeProductFamilyId, setRuleExcludeProductFamilyId] = useState('');
  const [ruleIncludeProductFamilyIds, setRuleIncludeProductFamilyIds] = useState<string[]>([]);
  const [ruleExcludeProductFamilyIds, setRuleExcludeProductFamilyIds] = useState<string[]>([]);
  const [ruleIncludeProductNameContains, setRuleIncludeProductNameContains] = useState('');
  const [ruleExcludeProductNameContains, setRuleExcludeProductNameContains] = useState('');

  // Reference data for rule builder
  const [folders, setFolders] = useState<FolderOption[]>([]);
  const [families, setFamilies] = useState<FamilyOption[]>([]);

  // ---------------------------------------------------------------------------
  // Fetch functions
  // ---------------------------------------------------------------------------

  const fetchGrants = useCallback(async () => {
    setGrantsLoading(true);
    setGrantsError(null);
    try {
      const response = await fetch(`/api/${tenantSlug}/sharing/sets/${setId}/grants`);
      const payload = await response.json().catch(() => ({})) as {
        error?: string;
        data?: {
          share_set?: SetInfo;
          grants?: PartnerGrant[];
          available_partners?: PartnerOption[];
        };
      };
      if (!response.ok) throw new Error(payload.error || 'Failed to load grants');
      if (payload.data?.share_set) {
        setSetInfo(payload.data.share_set);
      }
      setGrants(payload.data?.grants || []);
      setAvailablePartners(payload.data?.available_partners || []);
    } catch (err) {
      setGrantsError(getErrorMessage(err, 'Failed to load grants'));
    } finally {
      setGrantsLoading(false);
    }
  }, [setId, tenantSlug]);

  const fetchItems = useCallback(async () => {
    setItemsLoading(true);
    setItemsError(null);
    try {
      const response = await fetch(`/api/${tenantSlug}/sharing/sets/${setId}/items?limit=200`);
      const payload = await response.json().catch(() => ({})) as {
        error?: string;
        data?: {
          items?: SetItem[];
          resolved?: Record<string, { name: string; sku?: string | null; parent_id?: string | null }>;
        };
      };
      if (!response.ok) throw new Error(payload.error || 'Failed to load items');
      setItems(payload.data?.items || []);
      setResolved(payload.data?.resolved || {});
    } catch (err) {
      setItemsError(getErrorMessage(err, 'Failed to load items'));
    } finally {
      setItemsLoading(false);
    }
  }, [setId, tenantSlug]);

  const fetchRules = useCallback(async () => {
    setRulesLoading(true);
    setRulesError(null);
    try {
      const response = await fetch(`/api/${tenantSlug}/sharing/sets/${setId}/rules`);
      const payload = await response.json().catch(() => ({})) as {
        error?: string;
        data?: { rules?: ShareSetDynamicRule[] };
      };
      if (!response.ok) throw new Error(payload.error || 'Failed to load rules');
      setRules(payload.data?.rules || []);
    } catch (err) {
      setRulesError(getErrorMessage(err, 'Failed to load rules'));
    } finally {
      setRulesLoading(false);
    }
  }, [setId, tenantSlug]);

  const fetchFolders = useCallback(async () => {
    try {
      const response = await fetch(`/api/organizations/${tenantSlug}/assets/folders`);
      if (!response.ok) return;
      const payload = await response.json().catch(() => ({})) as { data?: FolderOption[] };
      setFolders(payload.data || []);
    } catch {
      // folders are optional for the rule builder
    }
  }, [tenantSlug]);

  const fetchFamilies = useCallback(async () => {
    try {
      const response = await fetch(`/api/${tenantSlug}/product-families`);
      if (!response.ok) return;
      const payload = await response.json().catch(() => ({})) as { data?: FamilyOption[] };
      setFamilies(payload.data || []);
    } catch {
      // families are optional for the rule builder
    }
  }, [tenantSlug]);

  const fetchSetMarkets = useCallback(async () => {
    setSetMarketsLoading(true);
    try {
      const response = await fetch(`/api/${tenantSlug}/sharing/sets/${setId}/markets`);
      const payload = await response.json().catch(() => ({})) as {
        error?: string;
        data?: { markets?: Array<{ id: string; name: string; code: string }> };
      };
      if (response.ok) {
        setSetMarkets(payload.data?.markets || []);
      }
    } catch {
      // markets context is optional; silent failure
    } finally {
      setSetMarketsLoading(false);
    }
  }, [setId, tenantSlug]);

  // ---------------------------------------------------------------------------
  // Initial load
  // ---------------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    setPageLoading(true);
    setPageError(null);
    setSetInfo(null);
    setGrants([]);
    setAvailablePartners([]);
    setGrantsError(null);
    setItems([]);
    setRules([]);
    setResolved({});
    setItemsLoading(true);
    setRulesLoading(true);
    setHasLoadedItems(false);
    setHasLoadedRules(false);
    setHasLoadedRuleReferenceData(false);
    setSetMarkets([]);
    setFolders([]);
    setFamilies([]);
    void fetchGrants().finally(() => {
      if (!cancelled) {
        setPageLoading(false);
      }
    });
    void fetchSetMarkets();
    return () => {
      cancelled = true;
    };
  }, [fetchGrants, fetchSetMarkets]);

  useEffect(() => {
    if (pageLoading || activeTab !== 'items' || hasLoadedItems) return;
    setHasLoadedItems(true);
    void fetchItems();
  }, [activeTab, fetchItems, hasLoadedItems, pageLoading]);

  useEffect(() => {
    if (pageLoading || activeTab !== 'rules' || hasLoadedRules) return;
    setHasLoadedRules(true);
    void fetchRules();
  }, [activeTab, fetchRules, hasLoadedRules, pageLoading]);

  useEffect(() => {
    if (pageLoading || activeTab !== 'rules' || hasLoadedRuleReferenceData) return;
    setHasLoadedRuleReferenceData(true);
    void fetchFolders();
    void fetchFamilies();
  }, [activeTab, fetchFamilies, fetchFolders, hasLoadedRuleReferenceData, pageLoading]);

  // ---------------------------------------------------------------------------
  // Items actions
  // ---------------------------------------------------------------------------

  const removeItem = useCallback(async (item: SetItem) => {
    if (removingItemId) return;
    setRemovingItemId(item.id);
    setItemsError(null);
    try {
      const response = await fetch(`/api/${tenantSlug}/sharing/sets/${setId}/items`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ resourceType: item.resource_type, resourceId: item.resource_id }],
        }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Failed to remove item');
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch (err) {
      setItemsError(getErrorMessage(err, 'Failed to remove item'));
    } finally {
      setRemovingItemId(null);
    }
  }, [removingItemId, setId, tenantSlug]);

  // ---------------------------------------------------------------------------
  // Grant actions
  // ---------------------------------------------------------------------------

  const addGrant = useCallback(async () => {
    if (!addPartnerId || grantsSubmitting) return;
    setGrantsSubmitting(true);
    setGrantsError(null);
    try {
      const response = await fetch(`/api/${tenantSlug}/sharing/sets/${setId}/grants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partnerOrganizationId: addPartnerId, accessLevel: addAccessLevel }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Failed to add partner');
      setAddPartnerId('');
      await fetchGrants();
    } catch (err) {
      setGrantsError(getErrorMessage(err, 'Failed to add partner'));
    } finally {
      setGrantsSubmitting(false);
    }
  }, [addAccessLevel, addPartnerId, fetchGrants, grantsSubmitting, setId, tenantSlug]);

  const revokeGrant = useCallback(async (grantId: string) => {
    if (revokingGrantId) return;
    setRevokingGrantId(grantId);
    setGrantsError(null);
    try {
      const response = await fetch(
        `/api/${tenantSlug}/sharing/sets/${setId}/grants?grantId=${encodeURIComponent(grantId)}`,
        { method: 'DELETE' }
      );
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Failed to revoke grant');
      await fetchGrants();
    } catch (err) {
      setGrantsError(getErrorMessage(err, 'Failed to revoke grant'));
    } finally {
      setRevokingGrantId(null);
    }
  }, [fetchGrants, revokingGrantId, setId, tenantSlug]);

  // ---------------------------------------------------------------------------
  // Rule actions
  // ---------------------------------------------------------------------------

  const resetRuleForm = useCallback(() => {
    setRuleName('');
    setRulePriority('100');
    setRuleIncludeTags('');
    setRuleExcludeTags('');
    setRuleIncludeUsageGroupIds([]);
    setRuleIncludeFolderId('');
    setRuleExcludeFolderId('');
    setRuleIncludeFolderIds([]);
    setRuleExcludeFolderIds([]);
    setRuleIncludeProductTypes([]);
    setRuleIncludeProductFamilyId('');
    setRuleExcludeProductFamilyId('');
    setRuleIncludeProductFamilyIds([]);
    setRuleExcludeProductFamilyIds([]);
    setRuleIncludeProductNameContains('');
    setRuleExcludeProductNameContains('');
  }, []);

  const createRule = useCallback(async () => {
    if (!setInfo || rulesSubmitting) return;
    setRulesSubmitting(true);
    setRulesError(null);
    try {
      const isAsset = setInfo.module_key === 'assets';
      const body = {
        name: ruleName.trim() || null,
        priority: Number.isFinite(Number(rulePriority)) ? Number(rulePriority) : 100,
        isActive: true,
        includeTags: splitCsvTokens(ruleIncludeTags),
        excludeTags: splitCsvTokens(ruleExcludeTags),
        includeFolderIds: isAsset ? ruleIncludeFolderIds : [],
        excludeFolderIds: isAsset ? ruleExcludeFolderIds : [],
        includeUsageGroupIds: isAsset ? ruleIncludeUsageGroupIds : [],
        includeProductTypes: isAsset ? [] : ruleIncludeProductTypes,
        excludeProductTypes: [],
        includeProductFamilyIds: isAsset ? [] : ruleIncludeProductFamilyIds,
        excludeProductFamilyIds: isAsset ? [] : ruleExcludeProductFamilyIds,
        includeProductNameContains: isAsset ? [] : splitCsvTokens(ruleIncludeProductNameContains),
        excludeProductNameContains: isAsset ? [] : splitCsvTokens(ruleExcludeProductNameContains),
      };
      const response = await fetch(`/api/${tenantSlug}/sharing/sets/${setId}/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Failed to create rule');
      resetRuleForm();
      await fetchRules();
    } catch (err) {
      setRulesError(getErrorMessage(err, 'Failed to create rule'));
    } finally {
      setRulesSubmitting(false);
    }
  }, [
    fetchRules, resetRuleForm, ruleExcludeFolderIds, ruleExcludeProductFamilyIds,
    ruleExcludeProductNameContains, ruleExcludeTags, ruleIncludeFolderIds,
    ruleIncludeProductFamilyIds, ruleIncludeProductNameContains, ruleIncludeProductTypes,
    ruleIncludeTags, ruleIncludeUsageGroupIds, ruleName, rulePriority,
    rulesSubmitting, setId, setInfo, tenantSlug,
  ]);

  const toggleRule = useCallback(async (rule: ShareSetDynamicRule) => {
    if (togglingRuleId) return;
    setTogglingRuleId(rule.id);
    setRulesError(null);
    try {
      const response = await fetch(
        `/api/${tenantSlug}/sharing/sets/${setId}/rules?ruleId=${encodeURIComponent(rule.id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: rule.name,
            isActive: !rule.is_active,
            priority: rule.priority,
            includeTags: rule.include_tags,
            excludeTags: rule.exclude_tags,
            includeFolderIds: rule.include_folder_ids,
            excludeFolderIds: rule.exclude_folder_ids,
            includeUsageGroupIds: rule.include_usage_group_ids,
            includeProductTypes: rule.include_product_types,
            excludeProductTypes: rule.exclude_product_types,
            includeProductFamilyIds: rule.include_product_family_ids,
            excludeProductFamilyIds: rule.exclude_product_family_ids,
            includeProductNameContains: rule.include_product_name_contains,
            excludeProductNameContains: rule.exclude_product_name_contains,
          }),
        }
      );
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Failed to update rule');
      await fetchRules();
    } catch (err) {
      setRulesError(getErrorMessage(err, 'Failed to update rule'));
    } finally {
      setTogglingRuleId(null);
    }
  }, [fetchRules, setId, tenantSlug, togglingRuleId]);

  const deleteRule = useCallback(async (ruleId: string) => {
    if (deletingRuleId) return;
    setDeletingRuleId(ruleId);
    setRulesError(null);
    try {
      const response = await fetch(
        `/api/${tenantSlug}/sharing/sets/${setId}/rules?ruleId=${encodeURIComponent(ruleId)}`,
        { method: 'DELETE' }
      );
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Failed to delete rule');
      setRules((prev) => prev.filter((r) => r.id !== ruleId));
    } catch (err) {
      setRulesError(getErrorMessage(err, 'Failed to delete rule'));
    } finally {
      setDeletingRuleId(null);
    }
  }, [deletingRuleId, setId, tenantSlug]);

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------

  const folderById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);
  const familyById = useMemo(() => new Map(families.map((f) => [f.id, f])), [families]);

  const availableFoldersForInclude = useMemo(
    () => folders.filter((f) => !ruleIncludeFolderIds.includes(f.id)),
    [folders, ruleIncludeFolderIds]
  );
  const availableFoldersForExclude = useMemo(
    () => folders.filter((f) => !ruleExcludeFolderIds.includes(f.id)),
    [folders, ruleExcludeFolderIds]
  );
  const availableFamiliesForInclude = useMemo(
    () => families.filter((f) => !ruleIncludeProductFamilyIds.includes(f.id)),
    [families, ruleIncludeProductFamilyIds]
  );
  const availableFamiliesForExclude = useMemo(
    () => families.filter((f) => !ruleExcludeProductFamilyIds.includes(f.id)),
    [families, ruleExcludeProductFamilyIds]
  );

  const grantedPartnerIds = useMemo(
    () => new Set(grants.map((g) => g.partner_organization_id)),
    [grants]
  );
  const partnersAvailableToAdd = useMemo(
    () => availablePartners.filter((p) => !grantedPartnerIds.has(p.id)),
    [availablePartners, grantedPartnerIds]
  );

  // ---------------------------------------------------------------------------
  // Item counts (for tab badge + summary)
  // ---------------------------------------------------------------------------

  const itemCounts = useMemo(() => {
    const assets = items.filter((i) => i.resource_type === 'asset').length;
    const folders = items.filter((i) => i.resource_type === 'folder').length;
    const products = items.filter((i) => i.resource_type === 'product').length;
    const variants = items.filter((i) => i.resource_type === 'variant').length;
    const scoped = items.filter(
      (i) => i.market_ids.length > 0 || i.channel_ids.length > 0 || i.locale_ids.length > 0
    ).length;
    return { assets, folders, products, variants, scoped, total: items.length };
  }, [items]);

  // Group product items: parent rows with their variants nested underneath
  const groupedProductItems = useMemo(() => {
    if (items.length === 0) return { parents: [] as Array<{ item: SetItem; variants: SetItem[] }>, orphanVariants: [] as SetItem[] };

    const productItemsByResourceId = new Map(
      items.filter((i) => i.resource_type === 'product').map((i) => [i.resource_id, i])
    );
    const variantItems = items.filter((i) => i.resource_type === 'variant');

    const variantsByParentId = new Map<string, SetItem[]>();
    const orphanVariants: SetItem[] = [];

    for (const v of variantItems) {
      const parentId = resolved[v.resource_id]?.parent_id;
      if (parentId && productItemsByResourceId.has(parentId)) {
        const arr = variantsByParentId.get(parentId) || [];
        arr.push(v);
        variantsByParentId.set(parentId, arr);
      } else {
        orphanVariants.push(v);
      }
    }

    const parents = Array.from(productItemsByResourceId.values()).map((item) => ({
      item,
      variants: variantsByParentId.get(item.resource_id) || [],
    }));

    return { parents, orphanVariants };
  }, [items, resolved]);

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  function describeRule(rule: ShareSetDynamicRule, moduleKey: ShareSetModule): string {
    const parts: string[] = [];
    if (rule.include_tags.length) parts.push(`tags: ${rule.include_tags.join(', ')}`);
    if (rule.include_folder_ids.length) {
      const names = rule.include_folder_ids
        .map((id) => folderById.get(id)?.name || id.slice(0, 8))
        .join(', ');
      parts.push(`folders: ${names}`);
    }
    if (moduleKey === 'assets' && rule.include_usage_group_ids.length) {
      parts.push(`usage groups: ${rule.include_usage_group_ids.join(', ')}`);
    }
    if (moduleKey === 'products' && rule.include_product_types.length) {
      parts.push(`types: ${rule.include_product_types.join(', ')}`);
    }
    if (moduleKey === 'products' && rule.include_product_family_ids.length) {
      const names = rule.include_product_family_ids
        .map((id) => familyById.get(id)?.name || id.slice(0, 8))
        .join(', ');
      parts.push(`families: ${names}`);
    }
    if (moduleKey === 'products' && rule.include_product_name_contains.length) {
      parts.push(`name contains: ${rule.include_product_name_contains.join(', ')}`);
    }
    return parts.length ? parts.join(' · ') : 'No include conditions';
  }

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  if (pageLoading) {
    return (
      <div className="h-full bg-background">
        <PageSkeleton text="Loading set..." size="lg" />
      </div>
    );
  }

  const backLink = (
    <Link
      href={`/${tenantSlug}/settings/sets`}
      className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ChevronLeft className="h-4 w-4" />
      <span>Sets</span>
    </Link>
  );

  if (!setInfo) {
    return (
      <SettingsSecondLevelPage page="sets" backLink={backLink}>
        <div className="rounded-md border border-border/60 bg-card p-4 text-sm text-muted-foreground">
          {pageError || grantsError || 'Set not found.'}
        </div>
      </SettingsSecondLevelPage>
    );
  }

  const isAsset = setInfo.module_key === 'assets';

  return (
    <SettingsSecondLevelPage page="sets" backLink={backLink}>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-semibold text-foreground">{setInfo.name}</h2>
          <Badge variant={isAsset ? 'info' : 'purple'}>
            {isAsset ? 'Assets' : 'Products'}
          </Badge>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'items' | 'grants' | 'rules')}>
          <TabsList>
            <TabsTrigger value="items">
              Items
              {!itemsLoading && itemCounts.total > 0 ? (
                <span className="ml-1.5 rounded-full bg-muted-foreground/20 px-1.5 py-0.5 text-xs">
                  {itemCounts.total}
                </span>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="grants">
              Direct Access
              {!grantsLoading && grants.length > 0 ? (
                <span className="ml-1.5 rounded-full bg-muted-foreground/20 px-1.5 py-0.5 text-xs">
                  {grants.length}
                </span>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="rules">
              Dynamic Rules
              {!rulesLoading && rules.length > 0 ? (
                <span className="ml-1.5 rounded-full bg-muted-foreground/20 px-1.5 py-0.5 text-xs">
                  {rules.length}
                </span>
              ) : null}
            </TabsTrigger>
          </TabsList>

          {/* ── Items tab ── */}
          <TabsContent value="items" className="space-y-4 pt-4">
            {itemsError ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {itemsError}
              </div>
            ) : null}

            {itemsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
                ))}
              </div>
            ) : (
              <>
                {/* Summary stats */}
                <div className="rounded-lg border border-border/60 bg-card p-4">
                  {itemCounts.total === 0 ? (
                    <p className="text-sm text-muted-foreground">No items in this set yet.</p>
                  ) : isAsset ? (
                    <div className="flex flex-wrap gap-4 text-sm">
                      <span><span className="font-medium text-foreground">{itemCounts.assets}</span> <span className="text-muted-foreground">assets</span></span>
                      <span><span className="font-medium text-foreground">{itemCounts.folders}</span> <span className="text-muted-foreground">folders</span></span>
                      {itemCounts.scoped > 0 ? (
                        <span><span className="font-medium text-foreground">{itemCounts.scoped}</span> <span className="text-muted-foreground">scoped</span></span>
                      ) : null}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-4 text-sm">
                      <span><span className="font-medium text-foreground">{itemCounts.products}</span> <span className="text-muted-foreground">products</span></span>
                      <span><span className="font-medium text-foreground">{itemCounts.variants}</span> <span className="text-muted-foreground">variants</span></span>
                      {itemCounts.scoped > 0 ? (
                        <span><span className="font-medium text-foreground">{itemCounts.scoped}</span> <span className="text-muted-foreground">scoped</span></span>
                      ) : null}
                    </div>
                  )}
                </div>

                {/* How to manage note */}
                <p className="text-sm text-muted-foreground">
                  {isAsset
                    ? 'Add assets and folders to this set from the Assets view using the "Add to Set" action.'
                    : 'Add products and variants to this set from the Products view.'}
                  {itemCounts.total > 0 ? (
                    <>
                      {' '}
                      <Link
                        href={`/${tenantSlug}/${isAsset ? 'assets' : 'products'}`}
                        className="text-foreground underline underline-offset-2 hover:text-primary"
                      >
                        Go to {isAsset ? 'Assets' : 'Products'} →
                      </Link>
                    </>
                  ) : null}
                </p>

                {/* Removable items list */}
                {itemCounts.total > 0 ? (
                  <div className="space-y-1">
                    {isAsset ? (
                      // Asset set: flat list with resolved names + thumbnails
                      items.map((item) => {
                        const entry = resolved[item.resource_id];
                        return (
                          <div
                            key={item.id}
                            className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              {entry?.thumbnail_url ? (
                                <img
                                  src={entry.thumbnail_url}
                                  alt=""
                                  className="h-8 w-8 shrink-0 rounded object-cover bg-muted"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="h-8 w-8 shrink-0 rounded bg-muted flex items-center justify-center">
                                  <span className="text-[9px] font-medium text-muted-foreground uppercase">
                                    {item.resource_type === 'folder' ? 'dir' : 'file'}
                                  </span>
                                </div>
                              )}
                              <span className="truncate text-sm text-foreground">
                                {entry?.name ?? item.resource_id}
                              </span>
                              {(item.market_ids.length > 0 || item.channel_ids.length > 0 || item.locale_ids.length > 0) ? (
                                <Badge variant="secondary">scoped</Badge>
                              ) : null}
                            </div>
                            <Button
                              variant="ghost"
                              className="ml-2 h-7 shrink-0 px-2 text-muted-foreground hover:text-destructive"
                              disabled={removingItemId === item.id}
                              onClick={() => void removeItem(item)}
                              title="Remove from set"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        );
                      })
                    ) : (
                      // Product set: parents with nested variants
                      <>
                        {groupedProductItems.parents.map(({ item: parent, variants }) => (
                          <div key={parent.id}>
                            {/* Parent product row */}
                            <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                  Product
                                </span>
                                <span className="truncate text-sm font-medium text-foreground">
                                  {resolved[parent.resource_id]?.name ?? parent.resource_id}
                                </span>
                                {resolved[parent.resource_id]?.sku ? (
                                  <span className="shrink-0 text-xs text-muted-foreground">
                                    {resolved[parent.resource_id].sku}
                                  </span>
                                ) : null}
                                {parent.include_descendants ? (
                                  <Badge variant="secondary">+variants</Badge>
                                ) : null}
                                {(parent.market_ids.length > 0 || parent.channel_ids.length > 0 || parent.locale_ids.length > 0) ? (
                                  <Badge variant="secondary">scoped</Badge>
                                ) : null}
                              </div>
                              <Button
                                variant="ghost"
                                className="ml-2 h-7 shrink-0 px-2 text-muted-foreground hover:text-destructive"
                                disabled={removingItemId === parent.id}
                                onClick={() => void removeItem(parent)}
                                title="Remove from set"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                            {/* Variant rows indented */}
                            {variants.length > 0 ? (
                              <div className="ml-6 mt-0.5 space-y-0.5">
                                {variants.map((variant) => (
                                  <div
                                    key={variant.id}
                                    className="flex items-center justify-between rounded-md border border-border/40 bg-muted/30 px-3 py-1.5"
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className="shrink-0 text-xs text-muted-foreground">↳</span>
                                      <span className="truncate text-sm text-foreground">
                                        {resolved[variant.resource_id]?.name ?? variant.resource_id}
                                      </span>
                                      {resolved[variant.resource_id]?.sku ? (
                                        <span className="shrink-0 text-xs text-muted-foreground">
                                          {resolved[variant.resource_id].sku}
                                        </span>
                                      ) : null}
                                      {(variant.market_ids.length > 0 || variant.channel_ids.length > 0 || variant.locale_ids.length > 0) ? (
                                        <Badge variant="secondary">scoped</Badge>
                                      ) : null}
                                    </div>
                                    <Button
                                      variant="ghost"
                                      className="ml-2 h-7 shrink-0 px-2 text-muted-foreground hover:text-destructive"
                                      disabled={removingItemId === variant.id}
                                      onClick={() => void removeItem(variant)}
                                      title="Remove from set"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ))}
                        {/* Orphan variants (parent not in this set) */}
                        {groupedProductItems.orphanVariants.map((variant) => (
                          <div
                            key={variant.id}
                            className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Variant
                              </span>
                              <span className="truncate text-sm text-foreground">
                                {resolved[variant.resource_id]?.name ?? variant.resource_id}
                              </span>
                              {resolved[variant.resource_id]?.sku ? (
                                <span className="shrink-0 text-xs text-muted-foreground">
                                  {resolved[variant.resource_id].sku}
                                </span>
                              ) : null}
                              {(variant.market_ids.length > 0 || variant.channel_ids.length > 0 || variant.locale_ids.length > 0) ? (
                                <Badge variant="secondary">scoped</Badge>
                              ) : null}
                            </div>
                            <Button
                              variant="ghost"
                              className="ml-2 h-7 shrink-0 px-2 text-muted-foreground hover:text-destructive"
                              disabled={removingItemId === variant.id}
                              onClick={() => void removeItem(variant)}
                              title="Remove from set"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                ) : null}
              </>
            )}
          </TabsContent>

          {/* ── Direct Access tab ── */}
          <TabsContent value="grants" className="space-y-4 pt-4">
            {/* In markets — read-only context */}
            <div className="rounded-lg border border-border/60 bg-card p-4 space-y-2">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                In markets
              </div>
              {setMarketsLoading ? (
                <p className="text-xs text-muted-foreground">Loading...</p>
              ) : setMarkets.length > 0 ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    {setMarkets.map((market) => (
                      <Link
                        key={market.id}
                        href={`/${tenantSlug}/settings/markets/${market.id}`}
                        className="inline-flex items-center rounded border border-border/60 px-2 py-0.5 text-xs hover:bg-muted"
                      >
                        {market.name}
                      </Link>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Partners assigned to these markets already have access to this set. Direct grants below are for exclusive or partner-specific content.
                  </p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  This set is not in any market catalog. Add it via Settings → Markets to give all partners in a market access automatically.
                </p>
              )}
            </div>

            {grantsError ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {grantsError}
              </div>
            ) : null}

            {grantsLoading ? (
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
                ))}
              </div>
            ) : (
              <>
                {partnersAvailableToAdd.length > 0 ? (
                  <div className="flex gap-2">
                    <Select value={addPartnerId} onValueChange={setAddPartnerId}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select partner to add" />
                      </SelectTrigger>
                      <SelectContent>
                        {partnersAvailableToAdd.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={addAccessLevel}
                      onValueChange={(v) => setAddAccessLevel(v as 'view' | 'edit')}
                    >
                      <SelectTrigger className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="view">View</SelectItem>
                        <SelectItem value="edit">Edit</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="secondary"
                      disabled={grantsSubmitting || !addPartnerId}
                      onClick={() => void addGrant()}
                    >
                      {grantsSubmitting ? 'Adding...' : 'Add'}
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {availablePartners.length === 0
                      ? 'No partner organizations connected to this workspace.'
                      : 'All connected partners already have access to this set.'}
                  </p>
                )}

                {grants.length > 0 ? (
                  <div className="space-y-2">
                    {grants.map((grant) => (
                      <div
                        key={grant.id}
                        className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2"
                      >
                        <div className="text-sm">
                          <span className="font-medium text-foreground">
                            {grant.partner?.name || grant.partner_organization_id.slice(0, 8)}
                          </span>
                          <Badge variant="neutral" className="ml-2">{grant.access_level}</Badge>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={revokingGrantId === grant.id}
                          onClick={() => void revokeGrant(grant.id)}
                        >
                          {revokingGrantId === grant.id ? 'Revoking...' : 'Revoke'}
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No active partner grants for this set.
                  </p>
                )}
              </>
            )}
          </TabsContent>

          {/* ── Dynamic Rules tab ── */}
          <TabsContent value="rules" className="space-y-4 pt-4">
            {rulesError ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {rulesError}
              </div>
            ) : null}

            {/* Rule builder */}
            <div className="space-y-3 rounded-lg border border-border/60 bg-card p-4">
              <div className="text-sm font-medium text-foreground">Add Rule</div>
              <p className="text-xs text-muted-foreground">
                Rules automatically include matching {isAsset ? 'assets' : 'products'} in this set.
              </p>

              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  placeholder="Rule name (optional)"
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                />
                <Input
                  placeholder="Priority (default 100)"
                  value={rulePriority}
                  onChange={(e) => setRulePriority(e.target.value)}
                  type="number"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Include tags (comma-separated)</label>
                <Input
                  placeholder="e.g. hero, approved"
                  value={ruleIncludeTags}
                  onChange={(e) => setRuleIncludeTags(e.target.value)}
                />
              </div>

              {isAsset ? (
                <>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Include folders</label>
                    {ruleIncludeFolderIds.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 mb-1">
                        {ruleIncludeFolderIds.map((id) => (
                          <span key={id} className="inline-flex items-center gap-1 rounded border border-border/60 px-2 py-0.5 text-xs">
                            {folderById.get(id)?.name || id.slice(0, 8)}
                            <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => setRuleIncludeFolderIds((prev) => prev.filter((x) => x !== id))}>×</button>
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {availableFoldersForInclude.length > 0 ? (
                      <div className="flex gap-2">
                        <Select value={ruleIncludeFolderId} onValueChange={setRuleIncludeFolderId}>
                          <SelectTrigger className="flex-1"><SelectValue placeholder="Select folder" /></SelectTrigger>
                          <SelectContent>
                            {availableFoldersForInclude.map((f) => (
                              <SelectItem key={f.id} value={f.id}>{f.path || f.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button type="button" variant="outline" disabled={!ruleIncludeFolderId}
                          onClick={() => { if (!ruleIncludeFolderId) return; setRuleIncludeFolderIds((prev) => Array.from(new Set([...prev, ruleIncludeFolderId]))); setRuleIncludeFolderId(''); }}>
                          Add
                        </Button>
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Include usage groups</label>
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                      {USAGE_GROUP_OPTIONS.map((opt) => (
                        <label key={opt.id} className="flex cursor-pointer items-center gap-1.5 text-sm">
                          <input type="checkbox" checked={ruleIncludeUsageGroupIds.includes(opt.id)}
                            onChange={(e) => setRuleIncludeUsageGroupIds((prev) => e.target.checked ? Array.from(new Set([...prev, opt.id])) : prev.filter((x) => x !== opt.id))}
                            className="rounded border-border" />
                          {opt.label}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Exclude folders</label>
                    {ruleExcludeFolderIds.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 mb-1">
                        {ruleExcludeFolderIds.map((id) => (
                          <span key={id} className="inline-flex items-center gap-1 rounded border border-border/60 px-2 py-0.5 text-xs">
                            {folderById.get(id)?.name || id.slice(0, 8)}
                            <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => setRuleExcludeFolderIds((prev) => prev.filter((x) => x !== id))}>×</button>
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {availableFoldersForExclude.length > 0 ? (
                      <div className="flex gap-2">
                        <Select value={ruleExcludeFolderId} onValueChange={setRuleExcludeFolderId}>
                          <SelectTrigger className="flex-1"><SelectValue placeholder="Select folder to exclude" /></SelectTrigger>
                          <SelectContent>
                            {availableFoldersForExclude.map((f) => (
                              <SelectItem key={f.id} value={f.id}>{f.path || f.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button type="button" variant="outline" disabled={!ruleExcludeFolderId}
                          onClick={() => { if (!ruleExcludeFolderId) return; setRuleExcludeFolderIds((prev) => Array.from(new Set([...prev, ruleExcludeFolderId]))); setRuleExcludeFolderId(''); }}>
                          Add
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Include product types</label>
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                      {PRODUCT_TYPE_OPTIONS.map((opt) => (
                        <label key={opt.id} className="flex cursor-pointer items-center gap-1.5 text-sm">
                          <input type="checkbox" checked={ruleIncludeProductTypes.includes(opt.id)}
                            onChange={(e) => setRuleIncludeProductTypes((prev) => e.target.checked ? Array.from(new Set([...prev, opt.id])) : prev.filter((x) => x !== opt.id))}
                            className="rounded border-border" />
                          {opt.label}
                        </label>
                      ))}
                    </div>
                  </div>

                  {families.length > 0 ? (
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Include product families</label>
                      {ruleIncludeProductFamilyIds.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 mb-1">
                          {ruleIncludeProductFamilyIds.map((id) => (
                            <span key={id} className="inline-flex items-center gap-1 rounded border border-border/60 px-2 py-0.5 text-xs">
                              {familyById.get(id)?.name || id.slice(0, 8)}
                              <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => setRuleIncludeProductFamilyIds((prev) => prev.filter((x) => x !== id))}>×</button>
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <div className="flex gap-2">
                        <Select value={ruleIncludeProductFamilyId} onValueChange={setRuleIncludeProductFamilyId}>
                          <SelectTrigger className="flex-1"><SelectValue placeholder="Select family" /></SelectTrigger>
                          <SelectContent>
                            {availableFamiliesForInclude.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Button type="button" variant="outline" disabled={!ruleIncludeProductFamilyId}
                          onClick={() => { if (!ruleIncludeProductFamilyId) return; setRuleIncludeProductFamilyIds((prev) => Array.from(new Set([...prev, ruleIncludeProductFamilyId]))); setRuleIncludeProductFamilyId(''); }}>
                          Add
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Include — name contains (comma-separated)</label>
                    <Input placeholder="e.g. summer, v2" value={ruleIncludeProductNameContains} onChange={(e) => setRuleIncludeProductNameContains(e.target.value)} />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Exclude — name contains (comma-separated)</label>
                    <Input placeholder="e.g. draft, archived" value={ruleExcludeProductNameContains} onChange={(e) => setRuleExcludeProductNameContains(e.target.value)} />
                  </div>

                  {families.length > 0 ? (
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Exclude product families</label>
                      {ruleExcludeProductFamilyIds.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 mb-1">
                          {ruleExcludeProductFamilyIds.map((id) => (
                            <span key={id} className="inline-flex items-center gap-1 rounded border border-border/60 px-2 py-0.5 text-xs">
                              {familyById.get(id)?.name || id.slice(0, 8)}
                              <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => setRuleExcludeProductFamilyIds((prev) => prev.filter((x) => x !== id))}>×</button>
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <div className="flex gap-2">
                        <Select value={ruleExcludeProductFamilyId} onValueChange={setRuleExcludeProductFamilyId}>
                          <SelectTrigger className="flex-1"><SelectValue placeholder="Select family to exclude" /></SelectTrigger>
                          <SelectContent>
                            {availableFamiliesForExclude.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Button type="button" variant="outline" disabled={!ruleExcludeProductFamilyId}
                          onClick={() => { if (!ruleExcludeProductFamilyId) return; setRuleExcludeProductFamilyIds((prev) => Array.from(new Set([...prev, ruleExcludeProductFamilyId]))); setRuleExcludeProductFamilyId(''); }}>
                          Add
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </>
              )}

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Exclude tags (comma-separated)</label>
                <Input placeholder="e.g. draft, archived" value={ruleExcludeTags} onChange={(e) => setRuleExcludeTags(e.target.value)} />
              </div>

              <Button variant="accent-blue" disabled={rulesSubmitting} onClick={() => void createRule()}>
                {rulesSubmitting ? 'Creating...' : 'Add rule'}
              </Button>
            </div>

            {/* Existing rules list */}
            {rulesLoading ? (
              <div className="space-y-2">
                {[1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />)}
              </div>
            ) : rules.length === 0 ? (
              <p className="text-sm text-muted-foreground">No rules defined yet.</p>
            ) : (
              <div className="space-y-2">
                {rules.map((rule) => (
                  <div key={rule.id} className="flex items-start justify-between gap-3 rounded-md border border-border/60 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">
                          {rule.name || `Rule (priority ${rule.priority})`}
                        </span>
                        <Badge variant={rule.is_active ? 'success' : 'neutral'}>
                          {rule.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {describeRule(rule, setInfo.module_key)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={togglingRuleId === rule.id}
                        onClick={() => void toggleRule(rule)}
                      >
                        {togglingRuleId === rule.id ? '...' : rule.is_active ? 'Disable' : 'Enable'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground hover:text-destructive"
                        disabled={deletingRuleId === rule.id}
                        onClick={() => void deleteRule(rule.id)}
                        title="Delete rule"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </SettingsSecondLevelPage>
  );
}

