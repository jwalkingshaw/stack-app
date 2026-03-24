"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import NextImage from "next/image";
import Link from "next/link";
import {
  ArrowUpDown,
  Check,
  MoreHorizontal,
  Plus,
  ChevronDown,
  ChevronRight,
  Package,
  ImageIcon,
  Layers,
  GitBranch,
  Edit,
  Trash2,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SearchInput } from "@/components/ui/search-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";
import { cn } from "@/lib/utils";
import { BulkActionToolbar } from "@/components/dam/bulk-action-toolbar";
import { AddToKitDialog } from "@/components/updates/AddToKitDialog";
import { TranslationPanel } from "@/components/products/TranslationPanel";
import { fetchJsonWithDedupe } from "@/lib/client-request-cache";
import {
  AuthoringScopePicker,
  type AuthoringScopeValue,
  createGlobalAuthoringScope,
  getAuthoringScopeSummary,
  normalizeAuthoringScope,
} from "@/components/scope/authoring-scope-picker";
import { type PIMProduct } from "./mock-pim-data";
import { useMarketContext } from "@/components/market-context";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";


// Type guards for product hierarchy
const isParentProduct = (product: PIMProduct): boolean => product.type === 'parent';
const isVariantProduct = (product: PIMProduct): boolean => product.type === 'variant';
const isStandaloneProduct = (product: PIMProduct): boolean => product.type === 'standalone';
const MAX_INLINE_VARIANTS = 15;
const isViewAllVariantsRow = (product: PIMProduct): boolean =>
  Boolean((product as PIMProduct & { isViewAllLink?: boolean }).isViewAllLink);

type ProductStatus = 'Draft' | 'Enrichment' | 'Review' | 'Active' | 'Discontinued' | 'Archived';

const PRODUCT_STATUSES: ProductStatus[] = [
  'Draft',
  'Enrichment',
  'Review',
  'Active',
  'Discontinued',
  'Archived'
];

const PRODUCT_MODEL_FILTER_ALL = "__all_models__";
const PRODUCT_MODEL_FILTER_UNASSIGNED = "__unassigned_model__";

type ProductApiRow = {
  id?: string;
  organization_id?: string;
  organization_slug?: string;
  organization_name?: string;
  type?: PIMProduct["type"];
  parent_id?: string | null;
  has_variants?: boolean;
  variant_count?: number;
  product_name?: string;
  scin?: string;
  sku?: string | null;
  barcode?: string | null;
  upc?: string | null;
  brand_line?: string;
  product_families?: { name?: string | null } | null;
  variant_axis?: PIMProduct["variantAxis"];
  status?: PIMProduct["status"];
  launch_date?: string;
  msrp?: number;
  cost_of_goods?: number;
  margin_percent?: number;
  assets_count?: number;
  content_score?: number;
  short_description?: string;
  long_description?: string;
  features?: string[];
  specifications?: Record<string, unknown>;
  meta_title?: string;
  meta_description?: string;
  keywords?: string[];
  weight_g?: number;
  dimensions?: Record<string, unknown>;
  inheritance?: PIMProduct["inheritance"];
  is_inherited?: PIMProduct["isInherited"];
  marketplace_content?: Record<string, unknown>;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
  last_modified_by?: string;
};

type ErrorPayload = { error?: string };

interface PIMTableProps {
  tenantSlug: string;
  selectedBrandSlug?: string | null;
  isPartnerAllView?: boolean;
  onProductClick?: (product: PIMProduct, options?: { section?: string }) => void;
  onCreateProduct?: () => void;
}

type ProductShareSetOption = {
  id: string;
  name: string;
  product_count: number;
  variant_count: number;
  item_count: number;
};

type ScopeConstraintOption = {
  value: string;
  label: string;
};

type ScopeFilterMode = "all" | "in_scope" | "out_of_scope";
type ProductBulkScopeMode = "set" | "add" | "clear";

const DEFAULT_VISIBLE_COLUMNS = {
  status: true,
  productName: true,
  assets: true,
  sku: true,
  upc: true,
  scin: true,
  family: true,
  contentScore: true,
  brandLine: false,
  msrp: false,
  costOfGoods: false,
  marginPercent: false,
  assetsCount: false,
  lastModified: false
};

type ProductLinkRecord = {
  product_id?: string | null;
  asset_id?: string | null;
  document_slot_code?: string | null;
  channel_id?: string | null;
  market_id?: string | null;
  locale_id?: string | null;
  destination_id?: string | null;
  is_primary?: boolean | null;
  created_at?: string | null;
  dam_assets?: {
    id?: string | null;
    filename?: string | null;
    s3_url?: string | null;
    thumbnail_urls?: {
      small?: string | null;
      medium?: string | null;
      large?: string | null;
    } | null;
  } | null;
};

type ProductFrontImage = {
  slot: CoreAssetSlot;
  assetId: string;
  previewUrl: string;
  fallbackPreviewUrl: string;
  filename: string | null;
};

type CoreAssetSlot = "front" | "back" | "left" | "right";

const CORE_ASSET_SLOT_ORDER: CoreAssetSlot[] = ["front", "back", "left", "right"];
const CORE_ASSET_SLOT_CODES: Record<CoreAssetSlot, string> = {
  front: "image_front",
  back: "image_back",
  left: "image_left",
  right: "image_right",
};
const MAX_CORE_ASSET_FETCH_PRODUCTS = 160;

const extractNonEmptyUrl = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const cloneAuthoringScope = (scope: AuthoringScopeValue): AuthoringScopeValue => ({
  mode: scope.mode,
  marketIds: [...scope.marketIds],
  channelIds: [...scope.channelIds],
  localeIds: [...scope.localeIds],
  destinationIds: [...scope.destinationIds],
});

const mergeAuthoringScopes = (
  currentScope: Partial<AuthoringScopeValue> | null | undefined,
  incomingScope: AuthoringScopeValue
): AuthoringScopeValue => {
  const current = normalizeAuthoringScope(currentScope);
  const incoming = normalizeAuthoringScope(incomingScope);

  if (incoming.mode !== "scoped") {
    return current;
  }
  if (current.mode !== "scoped") {
    return cloneAuthoringScope(incoming);
  }

  return {
    mode: "scoped",
    marketIds: Array.from(new Set([...current.marketIds, ...incoming.marketIds])),
    channelIds: Array.from(new Set([...current.channelIds, ...incoming.channelIds])),
    localeIds: Array.from(new Set([...current.localeIds, ...incoming.localeIds])),
    destinationIds: Array.from(new Set([...current.destinationIds, ...incoming.destinationIds])),
  };
};

const isScopeDimensionMatch = (selectedId: string | null, scopeIds: string[]): boolean => {
  if (scopeIds.length === 0) return true;
  if (!selectedId) return false;
  return scopeIds.includes(selectedId);
};



export function PIMTable({
  tenantSlug,
  selectedBrandSlug,
  isPartnerAllView = false,
  onProductClick,
  onCreateProduct,
}: PIMTableProps) {
  const {
    channels,
    locales,
    markets,
    selectedDestination,
    selectedDestinationId,
    selectedChannel,
    selectedChannelId,
    selectedLocale,
    selectedLocaleId,
    selectedMarketId,
  } = useMarketContext();
  const normalizedSelectedBrand = (selectedBrandSlug || "").trim().toLowerCase();
  const normalizedTenantSlug = tenantSlug.trim().toLowerCase();
  const isSharedBrandView =
    normalizedSelectedBrand.length > 0 && normalizedSelectedBrand !== normalizedTenantSlug;
  const canCreateProducts = Boolean(onCreateProduct) && !isSharedBrandView;
  const isSharedRow = useCallback(
    (product: Partial<PIMProduct>) => {
      if (isSharedBrandView) return true;
      if (!isPartnerAllView) return false;
      const rowSlug = String(product.organizationSlug || "").trim().toLowerCase();
      return rowSlug.length > 0 && rowSlug !== normalizedTenantSlug;
    },
    [isPartnerAllView, isSharedBrandView, normalizedTenantSlug]
  );
  const [products, setProducts] = useState<PIMProduct[]>([]);
  const [liveContentScoresByProductId, setLiveContentScoresByProductId] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("All");
  const [filterProductModel, setFilterProductModel] = useState<string>(PRODUCT_MODEL_FILTER_ALL);
  const [sortField, setSortField] = useState<keyof PIMProduct>("productName");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [isAddToKitDialogOpen, setIsAddToKitDialogOpen] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [shareSetOptions, setShareSetOptions] = useState<ProductShareSetOption[]>([]);
  const [selectedShareSetId, setSelectedShareSetId] = useState("");
  const [isLoadingShareSets, setIsLoadingShareSets] = useState(false);
  const [isSubmittingShare, setIsSubmittingShare] = useState(false);
  const [newShareSetName, setNewShareSetName] = useState("");
  const [isCreatingShareSet, setIsCreatingShareSet] = useState(false);
  const [shareDialogError, setShareDialogError] = useState<string | null>(null);
  const [shareStatusMessage, setShareStatusMessage] = useState<string | null>(null);
  const [shareMarketIds, setShareMarketIds] = useState<string[]>([]);
  const [shareChannelIds, setShareChannelIds] = useState<string[]>([]);
  const [shareLocaleIds, setShareLocaleIds] = useState<string[]>([]);
  const [filterSetId, setFilterSetId] = useState<string>("");
  const [setFilterItemIds, setSetFilterItemIds] = useState<Set<string>>(new Set());
  const [setFilterLoading, setSetFilterLoading] = useState(false);
  const [isRemovingFromSet, setIsRemovingFromSet] = useState(false);
  const [scopeFilterMode, setScopeFilterMode] = useState<ScopeFilterMode>("all");
  const [bulkScopeDialogOpen, setBulkScopeDialogOpen] = useState(false);
  const [bulkScopeMode, setBulkScopeMode] = useState<ProductBulkScopeMode>("set");
  const [bulkScopeValue, setBulkScopeValue] = useState<AuthoringScopeValue>(createGlobalAuthoringScope());
  const [bulkScopeSubmitting, setBulkScopeSubmitting] = useState(false);
  const [bulkScopeError, setBulkScopeError] = useState<string | null>(null);
  const [bulkScopeStatusMessage, setBulkScopeStatusMessage] = useState<string | null>(null);
  const [bulkDeleteSubmitting, setBulkDeleteSubmitting] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null);
  const [bulkDeleteStatusMessage, setBulkDeleteStatusMessage] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [pendingDeleteProducts, setPendingDeleteProducts] = useState<PIMProduct[]>([]);
  const [canTranslate, setCanTranslate] = useState(false);
  const [isTranslatePanelOpen, setIsTranslatePanelOpen] = useState(false);

  // Product creation workflow state
  const [creationMode, setCreationMode] = useState(false);
  const [creatingProducts, setCreatingProducts] = useState<Partial<PIMProduct>[]>([]);

  const visibleColumns = DEFAULT_VISIBLE_COLUMNS;
  const primaryColumnCount =
    (visibleColumns.status ? 1 : 0) +
    (visibleColumns.productName ? 1 : 0) +
    (visibleColumns.assets ? 1 : 0) +
    (visibleColumns.sku ? 1 : 0) +
    (visibleColumns.upc ? 1 : 0) +
    (visibleColumns.scin ? 1 : 0) +
    (visibleColumns.family ? 1 : 0) +
    (visibleColumns.contentScore ? 1 : 0);
  const tableColumnCount = primaryColumnCount + 1; // + actions

  const [coreAssetImagesByProductId, setCoreAssetImagesByProductId] = useState<Record<string, ProductFrontImage[]>>({});
  const [fallbackCoreAssetImageIds, setFallbackCoreAssetImageIds] = useState<Set<string>>(new Set());
  const [failedCoreAssetImageIds, setFailedCoreAssetImageIds] = useState<Set<string>>(new Set());
  
  // Hierarchy state
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());
  const [showVariantHierarchy, setShowVariantHierarchy] = useState(true);

  const buildScopedProductsUrl = useCallback(() => {
    const query = new URLSearchParams();
    query.set("listMode", "table");
    if (isPartnerAllView) query.set("view", "all");
    if (selectedMarketId) query.set("marketId", selectedMarketId);
    if (selectedChannelId) query.set("channelId", selectedChannelId);
    if (selectedLocaleId) query.set("localeId", selectedLocaleId);
    if (selectedDestinationId) query.set("destinationId", selectedDestinationId);
    if (selectedLocale?.code) query.set("locale", selectedLocale.code);
    if (selectedChannel?.code) query.set("channel", selectedChannel.code);
    if (selectedDestination?.code) query.set("destination", selectedDestination.code);
    if (normalizedSelectedBrand) query.set("brand", normalizedSelectedBrand);

    return query.toString()
      ? `/api/${tenantSlug}/products?${query.toString()}`
      : `/api/${tenantSlug}/products`;
  }, [
    isPartnerAllView,
    normalizedSelectedBrand,
    selectedChannelId,
    selectedChannel?.code,
    selectedDestinationId,
    selectedDestination?.code,
    selectedLocaleId,
    selectedLocale?.code,
    selectedMarketId,
    tenantSlug,
  ]);

  const buildScopedCompletenessBatchUrl = useCallback(() => {
    const query = new URLSearchParams();
    if (selectedMarketId) query.set("marketId", selectedMarketId);
    if (selectedChannelId) query.set("channelId", selectedChannelId);
    if (selectedLocaleId) query.set("localeId", selectedLocaleId);
    if (selectedDestinationId) query.set("destinationId", selectedDestinationId);
    if (selectedLocale?.code) query.set("locale", selectedLocale.code);
    if (selectedChannel?.code) query.set("channel", selectedChannel.code);
    if (selectedDestination?.code) query.set("destination", selectedDestination.code);
    if (normalizedSelectedBrand) query.set("brand", normalizedSelectedBrand);

    return query.toString()
      ? `/api/${tenantSlug}/products/completeness/batch?${query.toString()}`
      : `/api/${tenantSlug}/products/completeness/batch`;
  }, [
    normalizedSelectedBrand,
    selectedChannelId,
    selectedChannel?.code,
    selectedDestinationId,
    selectedDestination?.code,
    selectedLocaleId,
    selectedLocale?.code,
    selectedMarketId,
    tenantSlug,
  ]);

  const productModelOptions = useMemo(() => {
    const models = new Map<string, string>();
    for (const product of products) {
      const label = String(product.family || "").trim();
      if (!label) continue;
      const value = label.toLowerCase();
      if (!models.has(value)) {
        models.set(value, label);
      }
    }
    return Array.from(models.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [products]);

  const buildAssetPreviewPath = useCallback(
    (assetId: string) => {
      const query = new URLSearchParams();
      if (isPartnerAllView) {
        query.set("view", "all");
      }
      if (normalizedSelectedBrand) {
        query.set("brand", normalizedSelectedBrand);
      }
      return query.toString()
        ? `/api/${tenantSlug}/assets/${assetId}/preview?${query.toString()}`
        : `/api/${tenantSlug}/assets/${assetId}/preview`;
    },
    [isPartnerAllView, normalizedSelectedBrand, tenantSlug]
  );

  const resolveCoreAssetImagePreviewUrl = useCallback(
    (link: ProductLinkRecord, assetId: string) => {
      const fallbackPreviewUrl = buildAssetPreviewPath(assetId);
      const thumbnailUrls = link.dam_assets?.thumbnail_urls;
      const directPreviewUrl =
        extractNonEmptyUrl(thumbnailUrls?.small) ||
        extractNonEmptyUrl(thumbnailUrls?.medium) ||
        extractNonEmptyUrl(thumbnailUrls?.large) ||
        extractNonEmptyUrl(link.dam_assets?.s3_url);
      return {
        previewUrl: directPreviewUrl || fallbackPreviewUrl,
        fallbackPreviewUrl,
      };
    },
    [buildAssetPreviewPath]
  );

  const doesScopedLinkMatch = useCallback(
    (link: ProductLinkRecord) => {
      const channel = (link.channel_id || "").trim();
      const market = (link.market_id || "").trim();
      const locale = (link.locale_id || "").trim();
      const destination = (link.destination_id || "").trim();

      if (channel && channel !== selectedChannelId) return false;
      if (market && market !== selectedMarketId) return false;
      if (locale && locale !== selectedLocaleId) return false;
      if (destination) return false;

      return true;
    },
    [selectedChannelId, selectedLocaleId, selectedMarketId]
  );

  const getScopedLinkRank = useCallback(
    (link: ProductLinkRecord) => {
      let rank = 0;
      if ((link.channel_id || "").trim()) rank += 3;
      if ((link.market_id || "").trim()) rank += 3;
      if ((link.locale_id || "").trim()) rank += 3;
      if (link.is_primary) rank += 1;
      return rank;
    },
    []
  );

  const getProductAuthoringScope = useCallback((product: PIMProduct): AuthoringScopeValue => {
    const productWithScope = product as PIMProduct & {
      marketplaceContent?: Record<string, unknown> | null;
      marketplace_content?: Record<string, unknown> | null;
    };
    const rawScope =
      productWithScope.marketplaceContent?.authoringScope ??
      productWithScope.marketplace_content?.authoringScope ??
      null;
    return normalizeAuthoringScope(
      rawScope && typeof rawScope === "object" ? (rawScope as Partial<AuthoringScopeValue>) : null
    );
  }, []);

  const isProductInCurrentScope = useCallback(
    (product: PIMProduct): boolean => {
      const scope = getProductAuthoringScope(product);
      if (scope.mode !== "scoped") return true;
      return (
        isScopeDimensionMatch(selectedMarketId, scope.marketIds) &&
        isScopeDimensionMatch(selectedChannelId, scope.channelIds) &&
        isScopeDimensionMatch(selectedLocaleId, scope.localeIds) &&
        isScopeDimensionMatch(selectedDestinationId, scope.destinationIds)
      );
    },
    [
      getProductAuthoringScope,
      selectedChannelId,
      selectedDestinationId,
      selectedLocaleId,
      selectedMarketId,
    ]
  );
  
  // Get filtered products with hierarchy (memoized for performance)
  const getFilteredProductsWithHierarchy = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    const filtered = products.filter(product => {
      const matchesSearch = normalizedSearch === "" ||
        product.productName.toLowerCase().includes(normalizedSearch) ||
        (product.sku || '').toLowerCase().includes(normalizedSearch) ||
        (product.scin || '').toLowerCase().includes(normalizedSearch) ||
        (product.upc || '').toLowerCase().includes(normalizedSearch) ||
        product.brandLine?.toLowerCase().includes(normalizedSearch);
      
      const matchesStatus = filterStatus === "All" || product.status === filterStatus;
      const modelValue = (product.family || "").trim().toLowerCase();
      const matchesProductModel =
        filterProductModel === PRODUCT_MODEL_FILTER_ALL ||
        (filterProductModel === PRODUCT_MODEL_FILTER_UNASSIGNED
          ? modelValue.length === 0
          : modelValue === filterProductModel);
      const isInCurrentScope = isProductInCurrentScope(product);
      const matchesScope =
        scopeFilterMode === "all" ||
        (scopeFilterMode === "in_scope" && isInCurrentScope) ||
        (scopeFilterMode === "out_of_scope" && !isInCurrentScope);

      const matchesSet = !filterSetId || setFilterItemIds.has(product.id);

      return matchesSearch && matchesStatus && matchesProductModel && matchesScope && matchesSet;
    });

    if (!showVariantHierarchy) {
      return filtered;
    }

    const filteredIdSet = new Set(filtered.map((row) => row.id));
    const variantsByParentId = new Map<string, PIMProduct[]>();
    filtered.forEach((row) => {
      if (!isVariantProduct(row) || !row.parentId) return;
      const existing = variantsByParentId.get(row.parentId) || [];
      existing.push(row);
      variantsByParentId.set(row.parentId, existing);
    });

    const result: PIMProduct[] = [];
    const processedIds = new Set<string>();

    filtered.forEach(product => {
      if (processedIds.has(product.id)) return;

      if (isParentProduct(product)) {
        result.push(product);
        processedIds.add(product.id);

        if (expandedParents.has(product.id)) {
          const variants = variantsByParentId.get(product.id) || [];
          
          // Show first N variants inline.
          const visibleVariants = variants.slice(0, MAX_INLINE_VARIANTS);
          visibleVariants.forEach(variant => {
            result.push(variant);
            processedIds.add(variant.id);
          });

          if (variants.length > MAX_INLINE_VARIANTS) {
            result.push({
              id: `${product.id}_view_all_variants`,
              type: 'standalone' as const,
              parentId: product.id,
              productName: `View all ${variants.length} variants`,
              sku: '',
              assetsCount: 0,
              contentScore: 0,
              lastModified: '',
              lastModifiedBy: '',
              status: 'Active' as const,
              isViewAllLink: true,
            } as PIMProduct & { isViewAllLink: boolean });
          }
        }
      } else if (isVariantProduct(product)) {
        const hasParentInResults = Boolean(product.parentId && filteredIdSet.has(product.parentId));
        if (!hasParentInResults) {
          result.push(product);
          processedIds.add(product.id);
        }
      } else {
        result.push(product);
        processedIds.add(product.id);
      }
    });

    return result;
  }, [
    products,
    searchQuery,
    filterStatus,
    filterProductModel,
    scopeFilterMode,
    isProductInCurrentScope,
    showVariantHierarchy,
    expandedParents,
    filterSetId,
    setFilterItemIds,
  ]);

  // Load set options on mount (for set filter dropdown)
  useEffect(() => {
    void fetchShareSetOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantSlug]);

  // Fetch set item IDs when set filter changes
  useEffect(() => {
    if (!filterSetId) {
      setSetFilterItemIds(new Set());
      return;
    }
    setSetFilterLoading(true);
    fetch(`/api/${tenantSlug}/sharing/sets/${filterSetId}/items?limit=1000&resolve=false`)
      .then((r) => r.json())
      .then((payload: { data?: { items?: Array<{ resource_id: string }> } }) => {
        const ids = new Set<string>(
          (payload.data?.items || []).map((i) => i.resource_id)
        );
        setSetFilterItemIds(ids);
      })
      .catch(() => setSetFilterItemIds(new Set()))
      .finally(() => setSetFilterLoading(false));
  }, [filterSetId, tenantSlug]);

  // Load products
  useEffect(() => {
    const controller = new AbortController();
    let isCancelled = false;

    const loadProducts = async () => {
      try {
        setLoading(true);
        const requestUrl = buildScopedProductsUrl();
        const response = await fetchJsonWithDedupe<{ success?: boolean; data?: ProductApiRow[] }>(requestUrl, {
          ttlMs: 1500,
          requestInit: { signal: controller.signal },
        });
        if (isCancelled) return;

        if (!response.ok) {
          if ([401, 403, 404].includes(response.status)) {
            setProducts([]);
            return;
          }
          throw new Error(`Failed to fetch products: ${response.status}`);
        }
        
        if (response.data?.success && response.data?.data) {
          const rawProducts = Array.isArray(response.data.data)
            ? (response.data.data as ProductApiRow[])
            : [];
          const parentSkuById = new Map<string, string | null>();
          rawProducts.forEach((row) => {
            if (!row.id) return;
            parentSkuById.set(row.id, row.sku ?? null);
          });

          // Transform Supabase data to PIMProduct format
          const transformedProducts = rawProducts.map((product) => ({
            id: product.id || "",
            organizationId: product.organization_id,
            organizationSlug: product.organization_slug,
            organizationName: product.organization_name,
            type: product.type || "standalone",
            parentId: product.parent_id || undefined,
            hasVariants: product.has_variants,
            variantCount: product.variant_count,
            productName: product.product_name || "",
            scin: product.scin,
            sku: product.sku ?? null,
            upc: product.barcode ?? product.upc ?? undefined,
            brandLine: product.brand_line,
            family: product.product_families?.name ?? undefined,
            variantAxis: product.variant_axis || {},
            status: product.status || "Draft",
            launchDate: product.launch_date,
            msrp: product.msrp,
            costOfGoods: product.cost_of_goods,
            marginPercent: product.margin_percent ?? undefined,
            assetsCount: product.assets_count ?? 0,
            contentScore: product.content_score ?? 0,
            shortDescription: product.short_description,
            longDescription: product.long_description,
            features: product.features || [],
            specifications: product.specifications || {},
            metaTitle: product.meta_title,
            metaDescription: product.meta_description,
            keywords: product.keywords || [],
            weightG: product.weight_g,
            dimensions: product.dimensions || {},
            inheritance: product.inheritance || {},
            isInherited: product.is_inherited || {},
            marketplaceContent: product.marketplace_content || {},
            createdBy: product.created_by,
            createdAt: product.created_at,
            updatedAt: product.updated_at,
            lastModifiedBy: product.last_modified_by || product.created_by || "system",
            lastModified: product.updated_at || product.created_at || new Date().toISOString(),
            // Add parent SKU for variants by finding the parent product
            parent_sku: product.type === 'variant' && product.parent_id
              ? parentSkuById.get(product.parent_id)
              : undefined,
          }));
          
          setProducts(transformedProducts);
        } else {
          // No products found - start with empty state
          setProducts([]);
        }
      } catch (error) {
        const abortError = error as { name?: string; message?: string };
        if (
          isCancelled ||
          controller.signal.aborted ||
          abortError?.name === "AbortError" ||
          abortError?.message === "PIM table request disposed"
        ) {
          return;
        }
        console.error("Failed to load products:", error);
        // Start with empty state on error
        setProducts([]);
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    void loadProducts();
    return () => {
      isCancelled = true;
      if (!controller.signal.aborted) {
        controller.abort();
      }
    };
  }, [buildScopedProductsUrl]);

  // Load live completeness (required-field based, scoped to current market/channel/locale/destination).
  useEffect(() => {
    const controller = new AbortController();
    let isCancelled = false;

    const loadLiveCompleteness = async () => {
      if (isPartnerAllView) {
        setLiveContentScoresByProductId({});
        return;
      }

      const productIds = Array.from(
        new Set(
          products
            .map((product) => String(product.id || "").trim())
            .filter((id) => id.length > 0)
        )
      );
      if (productIds.length === 0) {
        setLiveContentScoresByProductId({});
        return;
      }

      const batchUrl = buildScopedCompletenessBatchUrl();
      const chunkSize = 120;
      const nextScores: Record<string, number> = {};

      for (let index = 0; index < productIds.length; index += chunkSize) {
        const chunk = productIds.slice(index, index + chunkSize);
        const response = await fetch(batchUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productIds: chunk }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch completeness batch (${response.status})`);
        }

        const payload = (await response.json().catch(() => null)) as
          | { data?: { scores?: Record<string, unknown> } }
          | null;
        const rawScores = payload?.data?.scores;
        if (!rawScores || typeof rawScores !== "object") {
          continue;
        }

        Object.entries(rawScores).forEach(([productId, value]) => {
          const numericValue =
            typeof value === "number"
              ? value
              : typeof value === "string"
              ? Number.parseFloat(value)
              : Number.NaN;
          if (!Number.isFinite(numericValue)) return;
          nextScores[productId] = Math.min(100, Math.max(0, Math.round(numericValue)));
        });
      }

      if (isCancelled || controller.signal.aborted) return;
      setLiveContentScoresByProductId(nextScores);
    };

    void loadLiveCompleteness().catch((error) => {
      if (isCancelled || controller.signal.aborted) {
        return;
      }
      console.error("Failed to load live product completeness:", error);
      setLiveContentScoresByProductId({});
    });

    return () => {
      isCancelled = true;
      if (!controller.signal.aborted) {
        controller.abort();
      }
    };
  }, [buildScopedCompletenessBatchUrl, isPartnerAllView, products]);

  // Check translation eligibility once on mount (not for shared brand views)
  useEffect(() => {
    if (isSharedBrandView) return;
    let cancelled = false;
    fetch(`/api/${tenantSlug}/localization/eligibility`)
      .then((r) => (r.ok ? r.json() : null))
      .then((payload) => {
        if (!cancelled) setCanTranslate(Boolean(payload?.data?.canTranslateProduct));
      })
      .catch(() => { /* non-critical */ });
    return () => { cancelled = true; };
  }, [isSharedBrandView, tenantSlug]);

  useEffect(() => {
    if (
      filterProductModel === PRODUCT_MODEL_FILTER_ALL ||
      filterProductModel === PRODUCT_MODEL_FILTER_UNASSIGNED
    ) {
      return;
    }
    const stillExists = productModelOptions.some((option) => option.value === filterProductModel);
    if (!stillExists) {
      setFilterProductModel(PRODUCT_MODEL_FILTER_ALL);
    }
  }, [filterProductModel, productModelOptions]);

  useEffect(() => {
    let isCancelled = false;

    const loadCoreAssetImages = async () => {
      const productIdsForPreview = Array.from(
        new Set(
          products
            .map((product) => String(product.id || "").trim())
            .filter((id) => id.length > 0)
        )
      ).slice(0, MAX_CORE_ASSET_FETCH_PRODUCTS);

      if (productIdsForPreview.length === 0) {
        setCoreAssetImagesByProductId({});
        return;
      }

      try {
        const slotRequests = CORE_ASSET_SLOT_ORDER.map(async (slot) => {
          const query = new URLSearchParams({
            document_slot_code: CORE_ASSET_SLOT_CODES[slot],
          });
          if (isPartnerAllView) {
            query.set("view", "all");
          }
          if (normalizedSelectedBrand) {
            query.set("brand", normalizedSelectedBrand);
          }
          query.set("product_ids", productIdsForPreview.join(","));

          const response = await fetch(`/api/${tenantSlug}/product-links?${query.toString()}`);
          if (!response.ok) {
            throw new Error(`Failed to fetch ${slot} image slot links (${response.status})`);
          }
          const payload = await response.json();
          return {
            slot,
            links: (payload?.data || []) as ProductLinkRecord[],
          };
        });

        const slotLinkResults = await Promise.all(slotRequests);
        if (isCancelled) return;

        const productIds = new Set(productIdsForPreview);
        const bestByProductAndSlot = new Map<
          string,
          { rank: number; createdAt: number; image: ProductFrontImage }
        >();

        for (const result of slotLinkResults) {
          for (const link of result.links) {
            const productId = String(link.product_id || "").trim();
            const assetId = String(link.asset_id || link.dam_assets?.id || "").trim();
            if (!productId || !assetId || !productIds.has(productId)) {
              continue;
            }
            if (!doesScopedLinkMatch(link)) {
              continue;
            }

            const rank = getScopedLinkRank(link);
            const createdAt = link.created_at ? Date.parse(link.created_at) || 0 : 0;
            const key = `${productId}:${result.slot}`;
            const existing = bestByProductAndSlot.get(key);
            if (
              !existing ||
              rank > existing.rank ||
              (rank === existing.rank && createdAt > existing.createdAt)
            ) {
              bestByProductAndSlot.set(key, {
                rank,
                createdAt,
                image: {
                  slot: result.slot,
                  assetId,
                  ...resolveCoreAssetImagePreviewUrl(link, assetId),
                  filename: link.dam_assets?.filename || null,
                },
              });
            }
          }
        }

        const nextMap: Record<string, ProductFrontImage[]> = {};
        for (const [key, entry] of bestByProductAndSlot.entries()) {
          const [productId] = key.split(":");
          if (!nextMap[productId]) {
            nextMap[productId] = [];
          }
          nextMap[productId].push(entry.image);
        }

        Object.keys(nextMap).forEach((productId) => {
          nextMap[productId] = nextMap[productId].sort(
            (a, b) => CORE_ASSET_SLOT_ORDER.indexOf(a.slot) - CORE_ASSET_SLOT_ORDER.indexOf(b.slot)
          );
        });

        setCoreAssetImagesByProductId(nextMap);
        setFallbackCoreAssetImageIds(new Set());
        setFailedCoreAssetImageIds(new Set());
      } catch (error) {
        if (isCancelled) return;
        console.error("Failed to load core asset image slot links:", error);
        setCoreAssetImagesByProductId({});
      }
    };

    void loadCoreAssetImages();
    return () => {
      isCancelled = true;
    };
  }, [
    resolveCoreAssetImagePreviewUrl,
    doesScopedLinkMatch,
    getScopedLinkRank,
    isPartnerAllView,
    normalizedSelectedBrand,
    products,
    tenantSlug,
  ]);

  // Exit creation mode
  const handleExitCreationMode = () => {
    setCreationMode(false);
    setCreatingProducts([]);
  };

  // Save new product to database
  const handleSaveNewProduct = async (productData: Partial<PIMProduct>) => {
    console.log('💾 Saving new product:', productData);
    
    if (!productData.productName) {
      console.error('❌ Product name is required');
      return;
    }

    try {
      const url = buildScopedProductsUrl();
      console.log('🌐 Making API call to:', url);
      console.log('🌐 Product name:', productData.productName);
      console.log('🌐 SKU:', productData.sku);
      console.log('🌐 Type:', productData.type || 'parent');
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: productData.type || 'parent',
          parent_id: productData.parentId,
          product_name: productData.productName,
          sku: productData.sku,
          barcode: productData.upc,
          brand_line: productData.brandLine,
          family_id: productData.family, // TODO: Map family name to ID
          status: productData.status || 'Draft',
          msrp: productData.msrp,
          cost_of_goods: productData.costOfGoods,
          margin_percent: productData.marginPercent,
        })
      });

      const data = await response.json();

      if (data.success) {
        // Transform and add to products list
        const savedProduct = {
          id: data.data.id,
          type: data.data.type,
          parentId: data.data.parent_id,
          hasVariants: data.data.has_variants,
          variantCount: data.data.variant_count,
          productName: data.data.product_name,
          scin: data.data.scin,
          sku: data.data.sku,
          upc: data.data.barcode ?? data.data.upc,
          brandLine: data.data.brand_line,
          family: data.data.product_families?.name,
          status: data.data.status,
          msrp: data.data.msrp,
          costOfGoods: data.data.cost_of_goods,
          marginPercent: data.data.margin_percent,
          assetsCount: data.data.assets_count,
          contentScore: data.data.content_score,
          createdAt: data.data.created_at,
          updatedAt: data.data.updated_at,
          lastModified: data.data.updated_at,
          lastModifiedBy: data.data.last_modified_by || 'Unknown'
        };

        setProducts(prev => [savedProduct, ...prev]);
        // Remove the created product from creating products and exit creation mode if this was the last one
        setCreatingProducts(prev => {
          const remaining = prev.filter(p => p.id !== productData.id);
          if (remaining.length === 0) {
            setCreationMode(false);
          }
          return remaining;
        });
        console.log('✅ Product created successfully');
      } else {
        console.error('❌ Failed to create product:', data.error);
      }
    } catch (error) {
      console.error('❌ Error creating product:', error);
      console.error('❌ Error message:', error instanceof Error ? error.message : 'Unknown error');
      console.error('❌ Error type:', typeof error);
      console.error('❌ Product data:', productData);
      console.error('❌ Tenant slug:', tenantSlug);
    }
  };

  const getEffectiveContentScore = useCallback(
    (product: PIMProduct): number => {
      const liveValue = liveContentScoresByProductId[product.id];
      if (Number.isFinite(liveValue)) {
        return liveValue;
      }
      return typeof product.contentScore === "number" ? product.contentScore : 0;
    },
    [liveContentScoresByProductId]
  );

  // Get filtered products with hierarchy, then sort (memoized for performance)
  const filteredAndSortedProducts = useMemo(() => {
    const rows = [...getFilteredProductsWithHierarchy];

    const compareBySortField = (a: PIMProduct, b: PIMProduct) => {
      if (sortField === "contentScore") {
        const aScore = getEffectiveContentScore(a);
        const bScore = getEffectiveContentScore(b);
        const comparison = aScore - bScore;
        return sortDirection === "asc" ? comparison : -comparison;
      }

      const aValue = a[sortField];
      const bValue = b[sortField];
      
      // Handle different data types
      let comparison = 0;
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        comparison = aValue.toLowerCase().localeCompare(bValue.toLowerCase());
      } else if (typeof aValue === 'number' && typeof bValue === 'number') {
        comparison = aValue - bValue;
      } else {
        // Handle undefined/null values
        if (aValue === undefined && bValue === undefined) return 0;
        if (aValue === undefined) return 1;
        if (bValue === undefined) return -1;
        comparison = String(aValue).localeCompare(String(bValue));
      }
      
      return sortDirection === "asc" ? comparison : -comparison;
    };

    if (!showVariantHierarchy) {
      return rows.sort(compareBySortField);
    }

    const rowById = new Map(rows.map((row) => [row.id, row]));
    const getGroupId = (row: PIMProduct) => {
      if (isViewAllVariantsRow(row) && row.parentId && rowById.has(row.parentId)) {
        return row.parentId;
      }
      if (isVariantProduct(row) && row.parentId && rowById.has(row.parentId)) {
        return row.parentId;
      }
      return row.id;
    };

    return rows.sort((a, b) => {
      const aGroupId = getGroupId(a);
      const bGroupId = getGroupId(b);

      if (aGroupId !== bGroupId) {
        const aRoot = rowById.get(aGroupId) || a;
        const bRoot = rowById.get(bGroupId) || b;
        return compareBySortField(aRoot, bRoot);
      }

      const aRank = isViewAllVariantsRow(a) ? 2 : isVariantProduct(a) ? 1 : 0;
      const bRank = isViewAllVariantsRow(b) ? 2 : isVariantProduct(b) ? 1 : 0;
      if (aRank !== bRank) return aRank - bRank;

      return compareBySortField(a, b);
    });
  }, [getEffectiveContentScore, getFilteredProductsWithHierarchy, showVariantHierarchy, sortField, sortDirection]);

  const realProductIds = useMemo(() => {
    return new Set(products.map((product) => product.id));
  }, [products]);

  const selectableProductIds = useMemo(() => {
    return filteredAndSortedProducts
      .filter((product) => realProductIds.has(product.id) && !isSharedRow(product))
      .map((product) => product.id);
  }, [filteredAndSortedProducts, isSharedRow, realProductIds]);

  const selectedShareableProducts = useMemo(() => {
    return products.filter((product) => selectedProductIds.has(product.id) && !isSharedRow(product));
  }, [isSharedRow, products, selectedProductIds]);

  const openDeleteDialogForProducts = useCallback((productsToDelete: PIMProduct[]) => {
    const filtered = productsToDelete.filter((product) => !isSharedRow(product));
    if (filtered.length === 0) {
      return;
    }
    setPendingDeleteProducts(filtered);
    setDeleteConfirmText("");
    setBulkDeleteError(null);
    setBulkDeleteStatusMessage(null);
    setShareStatusMessage(null);
    setBulkScopeStatusMessage(null);
    setShowDeleteDialog(true);
  }, [isSharedRow]);

  const shareMarketOptions = useMemo<ScopeConstraintOption[]>(
    () =>
      markets.map((market) => ({
        value: market.id,
        label: `${market.name} (${market.code})`,
      })),
    [markets]
  );

  const shareChannelOptions = useMemo<ScopeConstraintOption[]>(
    () =>
      channels.map((channel) => ({
        value: channel.id,
        label: `${channel.name} (${channel.code})`,
      })),
    [channels]
  );

  const shareLocaleOptions = useMemo<ScopeConstraintOption[]>(
    () =>
      locales.map((locale) => ({
        value: locale.id,
        label: `${locale.name} (${locale.code})`,
      })),
    [locales]
  );

  const outOfScopeCount = useMemo(
    () => products.reduce((count, product) => (isProductInCurrentScope(product) ? count : count + 1), 0),
    [isProductInCurrentScope, products]
  );

  const statusFilterLabel = filterStatus === "All" ? "Status" : filterStatus;
  const modelFilterLabel =
    filterProductModel === PRODUCT_MODEL_FILTER_ALL
      ? "Model"
      : filterProductModel === PRODUCT_MODEL_FILTER_UNASSIGNED
        ? "Unassigned"
        : productModelOptions.find((model) => model.value === filterProductModel)?.label || "Model";
  const scopeFilterLabel =
    scopeFilterMode === "all"
      ? "Scope"
      : scopeFilterMode === "in_scope"
        ? "In Current Scope"
        : "Missing In Scope";

  const applyCurrentScopeToShareSelection = useCallback(() => {
    setShareMarketIds(selectedMarketId ? [selectedMarketId] : []);
    setShareChannelIds(selectedChannelId ? [selectedChannelId] : []);
    setShareLocaleIds(selectedLocaleId ? [selectedLocaleId] : []);
  }, [selectedChannelId, selectedLocaleId, selectedMarketId]);

  const clearShareScopeConstraints = useCallback(() => {
    setShareMarketIds([]);
    setShareChannelIds([]);
    setShareLocaleIds([]);
  }, []);

  // Selection handlers
  const handleProductSelect = useCallback((productId: string, event?: React.MouseEvent | React.ChangeEvent) => {
    event?.stopPropagation();
    
    const product = products.find(p => p.id === productId);
    if (!product) return;
    if (isSharedRow(product)) return;
    
    setSelectedProductIds(prev => {
      const newSet = new Set(prev);
      const isCurrentlySelected = newSet.has(productId);
      
      if (isParentProduct(product)) {
        // Parent product selection - toggle parent + all variants
        const variants = products.filter(p => p.parentId === productId);
        
        if (isCurrentlySelected) {
          // Unselect parent and all variants
          newSet.delete(productId);
          variants.forEach(variant => newSet.delete(variant.id));
        } else {
          // Select parent and all variants
          newSet.add(productId);
          variants.forEach(variant => newSet.add(variant.id));
        }
      } else {
        // Regular product or variant selection
        if (isCurrentlySelected) {
          newSet.delete(productId);
          
          // If this was a variant, check if we should unselect the parent
          if (isVariantProduct(product) && product.parentId) {
            const parentVariants = products.filter(p => p.parentId === product.parentId);
            const remainingSelectedVariants = parentVariants.filter(v => newSet.has(v.id));
            
            // If no variants of this parent are selected, unselect the parent too
            if (remainingSelectedVariants.length === 0) {
              newSet.delete(product.parentId);
            }
          }
        } else {
          newSet.add(productId);
          
          // If this is a variant and we're selecting it, check if all variants are now selected
          if (isVariantProduct(product) && product.parentId) {
            const parentVariants = products.filter(p => p.parentId === product.parentId);
            const selectedVariants = parentVariants.filter(v => newSet.has(v.id) || v.id === productId);
            
            // If all variants are selected, auto-select the parent
            if (selectedVariants.length === parentVariants.length) {
              newSet.add(product.parentId);
            }
          }
        }
      }
      
      return newSet;
    });
  }, [isSharedRow, products]);

  const handleSelectAll = useCallback(() => {
    const isAllSelectableSelected =
      selectableProductIds.length > 0 &&
      selectableProductIds.every((id) => selectedProductIds.has(id));

    if (isAllSelectableSelected) {
      setSelectedProductIds(new Set());
    } else {
      setSelectedProductIds(new Set(selectableProductIds));
    }
    setShareStatusMessage(null);
    setBulkScopeStatusMessage(null);
    setBulkDeleteError(null);
    setBulkDeleteStatusMessage(null);
  }, [selectableProductIds, selectedProductIds]);

  const handleClearSelection = useCallback(() => {
    setSelectedProductIds(new Set());
    setShareStatusMessage(null);
    setBulkScopeStatusMessage(null);
    setBulkDeleteError(null);
    setBulkDeleteStatusMessage(null);
  }, []);

  const fetchShareSetOptions = useCallback(async (): Promise<ProductShareSetOption[]> => {
    setIsLoadingShareSets(true);
    setShareDialogError(null);
    try {
      const response = await fetch(
        `/api/${tenantSlug}/sharing/sets?module=products&page=1&pageSize=200`
      );
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        data?: { product_sets?: ProductShareSetOption[] };
      };

      if (!response.ok) {
        throw new Error(payload.error || "Failed to load product sets");
      }

      const options = payload.data?.product_sets || [];
      setShareSetOptions(options);
      setSelectedShareSetId((prev) => {
        if (prev && options.some((set) => set.id === prev)) {
          return prev;
        }
        return options[0]?.id || "";
      });
      return options;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load product sets.";
      setShareDialogError(message);
      setShareSetOptions([]);
      setSelectedShareSetId("");
      return [];
    } finally {
      setIsLoadingShareSets(false);
    }
  }, [tenantSlug]);

  const openShareDialog = useCallback(async () => {
    if (isSharedBrandView || selectedShareableProducts.length === 0) {
      return;
    }
    setShareDialogError(null);
    setShareStatusMessage(null);
    setNewShareSetName("");
    clearShareScopeConstraints();
    setIsShareDialogOpen(true);
    if (shareSetOptions.length === 0) {
      await fetchShareSetOptions();
    }
  }, [
    clearShareScopeConstraints,
    fetchShareSetOptions,
    isSharedBrandView,
    selectedShareableProducts.length,
    shareSetOptions.length,
  ]);

  const handleCreateShareSetInline = useCallback(async () => {
    const name = newShareSetName.trim();
    if (!name) {
      setShareDialogError("Enter a set name.");
      return;
    }

    setIsCreatingShareSet(true);
    setShareDialogError(null);
    try {
      const response = await fetch(`/api/${tenantSlug}/sharing/sets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          module: "products",
          name,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        data?: { id?: string; name?: string };
      };

      if (!response.ok) {
        throw new Error(payload.error || "Failed to create product set.");
      }

      const createdId = payload.data?.id || "";
      const createdName = payload.data?.name || name;
      if (createdId) {
        setShareSetOptions((prev) => {
          if (prev.some((set) => set.id === createdId)) {
            return prev;
          }
          return [
            {
              id: createdId,
              name: createdName,
              product_count: 0,
              variant_count: 0,
              item_count: 0,
            },
            ...prev,
          ];
        });
        setSelectedShareSetId(createdId);
      }
      setNewShareSetName("");
      await fetchShareSetOptions();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create product set.";
      setShareDialogError(message);
    } finally {
      setIsCreatingShareSet(false);
    }
  }, [fetchShareSetOptions, newShareSetName, tenantSlug]);

  const handleConfirmShareSelection = useCallback(async () => {
    if (!selectedShareSetId) {
      setShareDialogError("Select a set first.");
      return;
    }
    if (selectedShareableProducts.length === 0) {
      setShareDialogError("Select at least one product or variant.");
      return;
    }

    setIsSubmittingShare(true);
    setShareDialogError(null);
    try {
      const items = selectedShareableProducts.map((product) => ({
        resourceType: product.type === "variant" ? "variant" : "product",
        resourceId: product.id,
        marketIds: shareMarketIds,
        channelIds: shareChannelIds,
        localeIds: shareLocaleIds,
      }));

      const response = await fetch(
        `/api/${tenantSlug}/sharing/sets/${selectedShareSetId}/items`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ items }),
        }
      );

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || `Failed to update set (${response.status})`);
      }

      const itemLabel = `${selectedShareableProducts.length} product${
        selectedShareableProducts.length === 1 ? "" : "s"
      }`;
      setShareStatusMessage(`Added ${itemLabel} to the selected set.`);
      setIsShareDialogOpen(false);
      setSelectedProductIds(new Set());
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update set.";
      setShareDialogError(message);
    } finally {
      setIsSubmittingShare(false);
    }
  }, [
    selectedShareSetId,
    selectedShareableProducts,
    shareChannelIds,
    shareLocaleIds,
    shareMarketIds,
    tenantSlug,
  ]);

  // Bulk action handlers
  const handleBulkEdit = () => {
    if (selectedShareableProducts.length === 0) {
      return;
    }
    setBulkScopeMode("set");
    setBulkScopeValue(createGlobalAuthoringScope());
    setBulkScopeError(null);
    setBulkScopeDialogOpen(true);
  };

  const handleApplyBulkScope = useCallback(async () => {
    if (selectedShareableProducts.length === 0) {
      setBulkScopeError("Select at least one product or variant.");
      return;
    }
    if (bulkScopeMode === "add") {
      const normalizedIncoming = normalizeAuthoringScope(bulkScopeValue);
      const hasDimensions =
        normalizedIncoming.mode === "scoped" &&
        (normalizedIncoming.marketIds.length > 0 ||
          normalizedIncoming.channelIds.length > 0 ||
          normalizedIncoming.localeIds.length > 0 ||
          normalizedIncoming.destinationIds.length > 0);
      if (!hasDimensions) {
        setBulkScopeError("Choose at least one scope dimension to add.");
        return;
      }
    }

    setBulkScopeSubmitting(true);
    setBulkScopeError(null);
    setBulkScopeStatusMessage(null);
    const successfulUpdates = new Map<string, AuthoringScopeValue>();
    const failures: string[] = [];

    try {
      const chunks: PIMProduct[][] = [];
      const batchSize = 4;
      for (let index = 0; index < selectedShareableProducts.length; index += batchSize) {
        chunks.push(selectedShareableProducts.slice(index, index + batchSize));
      }

      for (const chunk of chunks) {
        const results = await Promise.allSettled(
          chunk.map(async (product) => {
            const currentScope = getProductAuthoringScope(product);
            const nextScope =
              bulkScopeMode === "clear"
                ? createGlobalAuthoringScope()
                : bulkScopeMode === "add"
                ? mergeAuthoringScopes(currentScope, bulkScopeValue)
                : normalizeAuthoringScope(bulkScopeValue);

            const response = await fetch(`/api/${tenantSlug}/products/${product.id}`, {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                initialScope: nextScope,
              }),
            });

            if (!response.ok) {
              const payload = (await response.json().catch(() => ({}))) as {
                error?: string;
              };
              throw new Error(payload.error || `Failed (${response.status})`);
            }

            return {
              productId: product.id,
              scope: nextScope,
            };
          })
        );

        for (const result of results) {
          if (result.status === "fulfilled") {
            successfulUpdates.set(result.value.productId, result.value.scope);
            continue;
          }
          const reason =
            result.reason instanceof Error
              ? result.reason.message
              : "Unknown scope update failure";
          failures.push(reason);
        }
      }

      if (successfulUpdates.size > 0) {
        setProducts((previous) =>
          previous.map((product) => {
            const scope = successfulUpdates.get(product.id);
            if (!scope) return product;
            const productWithScope = product as PIMProduct & {
              marketplaceContent?: Record<string, unknown> | null;
              marketplace_content?: Record<string, unknown> | null;
            };
            return {
              ...productWithScope,
              marketplaceContent: {
                ...(productWithScope.marketplaceContent || {}),
                authoringScope: scope,
              },
              marketplace_content: {
                ...(productWithScope.marketplace_content || {}),
                authoringScope: scope,
              },
            } as PIMProduct;
          })
        );
      }

      if (failures.length > 0) {
        setBulkScopeError(`Updated ${successfulUpdates.size}, failed ${failures.length}.`);
      } else {
        setBulkScopeDialogOpen(false);
        setBulkScopeStatusMessage(
          `Updated authoring scope for ${successfulUpdates.size} product${
            successfulUpdates.size === 1 ? "" : "s"
          }.`
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to apply authoring scope.";
      setBulkScopeError(message);
    } finally {
      setBulkScopeSubmitting(false);
    }
  }, [
    bulkScopeMode,
    bulkScopeValue,
    getProductAuthoringScope,
    selectedShareableProducts,
    tenantSlug,
  ]);

  const handleBulkStatusUpdate = () => {
    // TODO: Open status update modal
    console.log('Bulk status update for:', Array.from(selectedProductIds));
  };

  const handleBulkMove = () => {
    // TODO: Implement bulk category/brand line move
    console.log('Bulk move products:', Array.from(selectedProductIds));
  };

  const handleBulkDelete = useCallback(() => {
    if (selectedShareableProducts.length === 0 || bulkDeleteSubmitting) {
      return;
    }
    openDeleteDialogForProducts(selectedShareableProducts);
  }, [bulkDeleteSubmitting, openDeleteDialogForProducts, selectedShareableProducts]);

  const handleConfirmDelete = useCallback(async () => {
    if (pendingDeleteProducts.length === 0 || bulkDeleteSubmitting) {
      return;
    }
    if (deleteConfirmText.trim().toLowerCase() !== "delete") {
      return;
    }

    setBulkDeleteSubmitting(true);
    setBulkDeleteError(null);
    setBulkDeleteStatusMessage(null);
    setShareStatusMessage(null);
    setBulkScopeStatusMessage(null);

    try {
      const deletedIds = new Set<string>();
      const failures: Array<{ name: string; message: string }> = [];
      const deletionQueue = [...pendingDeleteProducts].sort((a, b) => {
        const rank = (product: PIMProduct) =>
          isVariantProduct(product) ? 0 : isStandaloneProduct(product) ? 1 : 2;
        return rank(a) - rank(b);
      });

      for (const product of deletionQueue) {
        const query = new URLSearchParams();
        if (normalizedSelectedBrand) {
          query.set("brand", normalizedSelectedBrand);
        }
        const url = query.toString()
          ? `/api/${tenantSlug}/products/${product.id}?${query.toString()}`
          : `/api/${tenantSlug}/products/${product.id}`;

        const response = await fetch(url, { method: "DELETE" });
        if (response.ok) {
          deletedIds.add(product.id);
          continue;
        }

        let payload: ErrorPayload | null = null;
        try {
          payload = await response.json();
        } catch {
          payload = null;
        }

        failures.push({
          name: product.productName || product.sku || product.id,
          message:
            payload?.error || `Failed with ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`,
        });
      }

      if (deletedIds.size > 0) {
        setProducts((previous) => previous.filter((product) => !deletedIds.has(product.id)));
        setSelectedProductIds((previous) => {
          const next = new Set(previous);
          deletedIds.forEach((id) => next.delete(id));
          return next;
        });
        setBulkDeleteStatusMessage(
          `Deleted ${deletedIds.size} product${deletedIds.size === 1 ? "" : "s"}.`
        );
      }

      if (failures.length > 0) {
        const preview = failures
          .slice(0, 3)
          .map((failure) => `${failure.name}: ${failure.message}`)
          .join(" | ");
        const suffix = failures.length > 3 ? ` (+${failures.length - 3} more)` : "";
        setBulkDeleteError(
          `Could not delete ${failures.length} product${failures.length === 1 ? "" : "s"}: ${preview}${suffix}`
        );
      }

      setShowDeleteDialog(false);
      setDeleteConfirmText("");
      setPendingDeleteProducts([]);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete selected products.";
      setBulkDeleteError(message);
    } finally {
      setBulkDeleteSubmitting(false);
    }
  }, [
    bulkDeleteSubmitting,
    deleteConfirmText,
    normalizedSelectedBrand,
    pendingDeleteProducts,
    tenantSlug,
  ]);

  const handleBulkShare = () => {
    void openShareDialog();
  };

  const handleRemoveFromSet = useCallback(async () => {
    if (!filterSetId || selectedShareableProducts.length === 0 || isRemovingFromSet) return;
    setIsRemovingFromSet(true);
    setShareStatusMessage(null);
    try {
      const items = selectedShareableProducts.map((p) => ({
        resourceType: p.type === "variant" ? "variant" : "product",
        resourceId: p.id,
      }));
      const response = await fetch(`/api/${tenantSlug}/sharing/sets/${filterSetId}/items`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Failed to remove from set");
      // Remove the IDs from local set filter so the rows disappear immediately
      setSetFilterItemIds((prev) => {
        const next = new Set(prev);
        for (const p of selectedShareableProducts) next.delete(p.id);
        return next;
      });
      setSelectedProductIds(new Set());
      setShareStatusMessage(
        `Removed ${selectedShareableProducts.length} item${selectedShareableProducts.length === 1 ? "" : "s"} from set.`
      );
    } catch (err) {
      setShareDialogError(err instanceof Error ? err.message : "Failed to remove from set.");
    } finally {
      setIsRemovingFromSet(false);
    }
  }, [filterSetId, isRemovingFromSet, selectedShareableProducts, tenantSlug]);

  const handleBulkAddToKit = () => {
    if (isSharedBrandView || selectedShareableProducts.length === 0) return;
    setIsAddToKitDialogOpen(true);
  };

  const handleBulkTranslate = useCallback(() => {
    if (isSharedBrandView || selectedShareableProducts.length === 0) return;
    if (selectedShareableProducts.length > 100) {
      // API limit — surface to user via the dialog (which shows the warning itself)
    }
    setIsTranslatePanelOpen(true);
  }, [isSharedBrandView, selectedShareableProducts.length]);

  const handleStatusChange = async (product: Partial<PIMProduct>, status: ProductStatus) => {
    if (!product.id) {
      return;
    }
    if (isSharedRow(product)) {
      return;
    }
    try {
      // Status is a core product column, not scoped field-value content.
      // Use the global product PATCH route (no scope query params).
      const query = new URLSearchParams();
      if (normalizedSelectedBrand) {
        query.set("brand", normalizedSelectedBrand);
      }
      const url = query.toString()
        ? `/api/${tenantSlug}/products/${product.id}?${query.toString()}`
        : `/api/${tenantSlug}/products/${product.id}`;

      const response = await fetch(url, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        let payload: ErrorPayload | null = null;
        try {
          payload = await response.json();
        } catch {
          payload = null;
        }
        throw new Error(
          payload?.error
            ? `Failed to update product status (${response.status}): ${payload.error}`
            : `Failed to update product status (${response.status})`
        );
      }

      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, status } : p));
    } catch (error) {
      console.error('Failed to update product status', error);
    }
  };

  // Sorting handlers
  const handleSort = useCallback((field: keyof PIMProduct) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  }, [sortField, sortDirection]);

  // Completion score formatting and color coding
  const normalizeContentScore = (score: unknown) => {
    const numericScore =
      typeof score === "number"
        ? score
        : typeof score === "string"
        ? Number.parseFloat(score)
        : Number.NaN;
    if (!Number.isFinite(numericScore)) return 0;
    return Math.min(100, Math.max(0, Math.round(numericScore)));
  };

  const getContentScoreBarColor = (score: number) => {
    if (score >= 90) return "#00d66b";
    if (score >= 70) return "#f4cb16";
    if (score >= 50) return "#ff9f0a";
    return "#ff3b5c";
  };

  // Hierarchy handling functions
  const toggleParentExpansion = (parentId: string) => {
    setExpandedParents(prev => {
      const newSet = new Set(prev);
      if (newSet.has(parentId)) {
        newSet.delete(parentId);
      } else {
        newSet.add(parentId);
      }
      return newSet;
    });
  };

  // Calculate summary stats with variant awareness
  const stats = {
    total: products.length,
    parents: products.filter(p => isParentProduct(p)).length,
    variants: products.filter(p => isVariantProduct(p)).length,
    standalone: products.filter(p => isStandaloneProduct(p)).length,
    active: products.filter(p => p.status === "Active").length,
    draft: products.filter(p => p.status === "Draft").length
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-1/3" />
          <div className="h-64 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Summary */}
      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Summary</span>
        <span>Total {stats.total}</span>
        <span>Parents {stats.parents}</span>
        <span>Variants {stats.variants}</span>
        <span>Single SKU {stats.standalone}</span>
        <span>Active {stats.active}</span>
        <span>Draft {stats.draft}</span>
      </div>

      {/* Search and Controls */}
      <div className="flex items-center justify-between gap-4">
        {creationMode ? (
          <div className="flex items-center gap-4 flex-1">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-primary rounded-full"></div>
              <span className="text-sm font-medium text-blue-900">Product Creation Mode</span>
              <span className="text-xs text-muted-foreground">({creatingProducts.length} products)</span>
            </div>

            <Button
              onClick={onCreateProduct}
              size="sm"
              disabled={!canCreateProducts}
              className="gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Product
            </Button>

            <Button
              onClick={handleExitCreationMode}
              variant="outline"
              size="sm"
            >
              Done
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-1 flex-wrap items-center gap-3">
            {/* Search */}
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search name, SKU, SCIN, or barcode"
              className="w-full min-w-[260px] flex-1 md:max-w-2xl"
              inputClassName="h-8"
            />

            {/* Status Filter */}
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-8 !w-auto shrink-0 border-0 bg-transparent px-3 shadow-none hover:bg-[var(--color-secondary-button-hover)] data-[state=open]:bg-[var(--color-secondary-button-hover)] [&_svg]:hidden">
                <span className="truncate">{statusFilterLabel}</span>
              </SelectTrigger>
              <SelectContent className="!w-auto min-w-[200px]">
                <SelectItem value="All">All Status</SelectItem>
                <SelectItem value="Draft">Draft</SelectItem>
                <SelectItem value="Enrichment">Enrichment</SelectItem>
                <SelectItem value="Review">Review</SelectItem>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Discontinued">Discontinued</SelectItem>
                <SelectItem value="Archived">Archived</SelectItem>
              </SelectContent>
            </Select>

            {/* Product Model Filter */}
            <Select value={filterProductModel} onValueChange={setFilterProductModel}>
              <SelectTrigger className="h-8 !w-auto shrink-0 border-0 bg-transparent px-3 shadow-none hover:bg-[var(--color-secondary-button-hover)] data-[state=open]:bg-[var(--color-secondary-button-hover)] [&_svg]:hidden">
                <span className="truncate">{modelFilterLabel}</span>
              </SelectTrigger>
              <SelectContent className="!w-auto min-w-[240px]">
                <SelectItem value={PRODUCT_MODEL_FILTER_ALL}>All Models</SelectItem>
                <SelectItem value={PRODUCT_MODEL_FILTER_UNASSIGNED}>Unassigned</SelectItem>
                {productModelOptions.map((model) => (
                  <SelectItem key={model.value} value={model.value}>
                    {model.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={scopeFilterMode} onValueChange={(value) => setScopeFilterMode(value as ScopeFilterMode)}>
              <SelectTrigger className="h-8 !w-auto shrink-0 border-0 bg-transparent px-3 shadow-none hover:bg-[var(--color-secondary-button-hover)] data-[state=open]:bg-[var(--color-secondary-button-hover)] [&_svg]:hidden">
                <span className="truncate">{scopeFilterLabel}</span>
              </SelectTrigger>
              <SelectContent className="!w-auto min-w-[240px]">
                <SelectItem value="all">All Scopes</SelectItem>
                <SelectItem value="in_scope">In Current Scope</SelectItem>
                <SelectItem value="out_of_scope">Missing In Scope</SelectItem>
              </SelectContent>
            </Select>

            {/* Set filter */}
            {shareSetOptions.length > 0 && (
              <Select value={filterSetId || "__all__"} onValueChange={(v) => setFilterSetId(v === "__all__" ? "" : v)}>
                <SelectTrigger className="h-8 !w-auto shrink-0 border-0 bg-transparent px-3 shadow-none hover:bg-[var(--color-secondary-button-hover)] data-[state=open]:bg-[var(--color-secondary-button-hover)] [&_svg]:hidden">
                  <span className="truncate">
                    {filterSetId
                      ? (shareSetOptions.find((s) => s.id === filterSetId)?.name ?? "Set")
                      : "Set"}
                  </span>
                </SelectTrigger>
                <SelectContent className="!w-auto min-w-[200px]">
                  <SelectItem value="__all__">All Sets</SelectItem>
                  {shareSetOptions.map((set) => (
                    <SelectItem key={set.id} value={set.id}>
                      {set.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {outOfScopeCount > 0 ? (
              <Badge variant="outline" className="px-2 py-0.5 text-xs">
                {outOfScopeCount} missing in current scope
              </Badge>
            ) : null}
          </div>

          {/* Add Product Button on the right */}
          {canCreateProducts ? (
            <Button
              onClick={onCreateProduct}
              className="h-8 px-3 text-sm flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Product
            </Button>
          ) : null}
        </>
        )}

        {shareStatusMessage ? (
          <p className="text-sm text-emerald-700">{shareStatusMessage}</p>
        ) : null}
        {bulkScopeStatusMessage ? (
          <p className="text-sm text-blue-700">{bulkScopeStatusMessage}</p>
        ) : null}
        {bulkDeleteStatusMessage ? (
          <p className="text-sm text-emerald-700">{bulkDeleteStatusMessage}</p>
        ) : null}
        {bulkDeleteError ? (
          <p className="text-sm text-red-600">{bulkDeleteError}</p>
        ) : null}
      </div>

      {/* Products Table */}
      <div className="bg-background border border-muted/30 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse">
            {/* Table Header */}
            <thead className="bg-muted/50">
              <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                {/* Status */}
                {visibleColumns.status && (
                  <th
                    className="w-[220px] px-4 py-3 text-left text-xs font-medium text-muted-foreground/80 uppercase tracking-wider cursor-pointer hover:bg-muted/60 transition-colors"
                    onClick={() => handleSort("status")}
                  >
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          setShowVariantHierarchy(!showVariantHierarchy);
                        }}
                        className="h-4 w-4 p-0 hover:bg-muted/60"
                        title={showVariantHierarchy ? "Flatten view" : "Show hierarchy"}
                      >
                        {showVariantHierarchy ? <GitBranch className="w-3 h-3" /> : <Layers className="w-3 h-3" />}
                      </Button>
                      <input
                        type="checkbox"
                        checked={
                          selectableProductIds.length > 0 &&
                          selectableProductIds.every((id) => selectedProductIds.has(id))
                        }
                        onChange={handleSelectAll}
                        className="w-3 h-3 text-[var(--color-accent-blue)] border-input rounded focus:ring-[var(--color-accent-blue-hover)]"
                        onClick={(event) => event.stopPropagation()}
                      />
                      <span>Status</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                )}

                {/* Product Name */}
                {visibleColumns.productName && (
                  <th
                    className="px-4 py-3 text-left text-xs font-medium text-muted-foreground/80 uppercase tracking-wider cursor-pointer hover:bg-muted/60 transition-colors min-w-96 w-96"
                    onClick={() => handleSort("productName")}
                  >
                    <div className="flex items-center gap-1">
                      Product Name
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                )}

                {/* Assets */}
                {visibleColumns.assets && (
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground/80 uppercase tracking-wider min-w-[180px]">
                    Assets
                  </th>
                )}

                {/* SKU */}
                {visibleColumns.sku && (
                  <th
                    className="px-4 py-3 text-left text-xs font-medium text-muted-foreground/80 uppercase tracking-wider cursor-pointer hover:bg-muted/60 transition-colors"
                    onClick={() => handleSort("sku")}
                  >
                    <div className="flex items-center gap-1">
                      SKU
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                )}

                {/* Barcode */}
                {visibleColumns.upc && (
                  <th
                    className="px-4 py-3 text-left text-xs font-medium text-muted-foreground/80 uppercase tracking-wider cursor-pointer hover:bg-muted/60 transition-colors"
                    onClick={() => handleSort("upc")}
                  >
                    <div className="flex items-center gap-1">
                      Barcode
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                )}

                {/* SCIN */}
                {visibleColumns.scin && (
                  <th
                    className="px-4 py-3 text-left text-xs font-medium text-muted-foreground/80 uppercase tracking-wider cursor-pointer hover:bg-muted/60 transition-colors"
                    onClick={() => handleSort("scin")}
                  >
                    <div className="flex items-center gap-1">
                      SCIN
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                )}

                {/* Product Model */}
                {visibleColumns.family && (
                  <th
                    className="px-4 py-3 text-left text-xs font-medium text-muted-foreground/80 uppercase tracking-wider cursor-pointer hover:bg-muted/60 transition-colors"
                    onClick={() => handleSort("family")}
                  >
                    <div className="flex items-center gap-1">
                      Product Model
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                )}

                {/* Completeness */}
                {visibleColumns.contentScore && (
                  <th
                    className="px-4 py-3 text-left text-xs font-medium text-muted-foreground/80 uppercase tracking-wider cursor-pointer hover:bg-muted/60 transition-colors"
                    onClick={() => handleSort("contentScore")}
                  >
                    <div className="flex items-center gap-1">
                      Complete
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                )}

                {/* Actions */}
                <th className="px-6 py-3 text-right text-sm font-medium text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="bg-white">
              {/* Creation Mode - Show creating products only */}
              {creationMode ? (
                creatingProducts.map((product, index) => (
                <tr key={product.id} className="bg-blue-50 border-2 border-muted/30 h-12" style={{ borderBottom: index === creatingProducts.length - 1 ? "none" : "1px solid #e5e7eb" }}>
                  {/* Status */}
                  {visibleColumns.status && (
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          disabled
                          className="w-3 h-3"
                        />
                        <Select
                          value={product.status || "Draft"}
                          onValueChange={(value) => handleStatusChange(product, value as ProductStatus)}
                          disabled={isSharedBrandView}
                        >
                          <SelectTrigger
                            className="h-8 w-[140px]"
                            onPointerDown={(event) => event.stopPropagation()}
                          >
                            <SelectValue placeholder="Draft" />
                          </SelectTrigger>
                          <SelectContent>
                            {PRODUCT_STATUSES.map((statusOption) => (
                              <SelectItem key={statusOption} value={statusOption}>
                                {statusOption}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </td>
                  )}

                  {/* Product Name */}
                  {visibleColumns.productName && (
                    <td className="px-6 py-4 max-w-120">
                      <div className="break-words">
                        {product.productName || <span className="text-muted-foreground">Enter product name...</span>}
                      </div>
                    </td>
                  )}

                  {/* Assets */}
                  {visibleColumns.assets && (
                    <td className="px-6 py-4">
                      <span className="text-sm text-muted-foreground">-</span>
                    </td>
                  )}

                  {/* SKU */}
                  {visibleColumns.sku && (
                    <td className="px-6 py-4">
                      <span className="font-normal">
                        {product.sku || <span className="text-muted-foreground">Enter SKU...</span>}
                      </span>
                    </td>
                  )}

                  {/* Barcode */}
                  {visibleColumns.upc && (
                    <td className="px-6 py-4">
                      <span className="font-normal">
                        {product.upc || <span className="text-muted-foreground">Enter barcode...</span>}
                      </span>
                    </td>
                  )}

                  {/* SCIN */}
                  {visibleColumns.scin && (
                    <td className="px-6 py-4">
                      <span className="font-normal text-muted-foreground">
                        Auto
                      </span>
                    </td>
                  )}

                  {/* Product Model */}
                  {visibleColumns.family && (
                    <td className="px-6 py-4">
                      {product.family || <span className="text-muted-foreground">Select model...</span>}
                    </td>
                  )}

                  {/* Completeness */}
                  {visibleColumns.contentScore && (
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      -
                    </td>
                  )}

                  {/* Actions */}
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          console.log('✅ Manual "Done" triggered for:', product.productName);
                          if (product.productName) {
                            handleSaveNewProduct(product);
                          } else {
                            console.error('Product name is required');
                          }
                        }}
                        disabled={!product.productName}
                        className="h-7 px-3 text-xs bg-primary hover:bg-primary/90"
                      >
                        <Check className="w-3 h-3 mr-1" />
                        Done
                      </Button>
                    </div>
                  </td>
                </tr>
                ))
              ) : (
                filteredAndSortedProducts.map((product, index) => {
                const isSelected = selectedProductIds.has(product.id);
                const nextProduct = filteredAndSortedProducts[index + 1];
                const prevProduct = filteredAndSortedProducts[index - 1];
                const isSharedProductRow = isSharedRow(product);
                const isInCurrentScope = isProductInCurrentScope(product);
                const isViewAllLink = isViewAllVariantsRow(product);
                const normalizedContentScore = normalizeContentScore(
                  getEffectiveContentScore(product)
                );
                
                // Determine if this row is part of an expanded variant group
                const isInExpandedGroup = (isVariantProduct(product) || isViewAllLink) && 
                  expandedParents.has(product.parentId || '');
                const isFirstInGroup = isInExpandedGroup && 
                  (!prevProduct || prevProduct.parentId !== product.parentId);
                const isLastInGroup = isInExpandedGroup && 
                  (!nextProduct || nextProduct.parentId !== product.parentId);

                if (isViewAllLink) {
                  const parentProduct = products.find((p) => p.id === product.parentId);
                  return (
                    <tr
                      key={product.id}
                      className={cn(
                        "bg-muted/20 hover:bg-muted/30 transition-colors cursor-pointer",
                        isInExpandedGroup && "border-l-2 border-r-2 border-gray-300",
                        isLastInGroup && "border-b-2 border-gray-300"
                      )}
                      style={{
                        borderBottom:
                          index === filteredAndSortedProducts.length - 1 ? "none" : "1px solid #e5e7eb",
                      }}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (parentProduct) {
                          onProductClick?.(parentProduct, { section: "variants" });
                        }
                      }}
                    >
                      <td colSpan={tableColumnCount} className="px-6 py-3">
                        <button
                          type="button"
                          className="text-sm text-blue-700 hover:underline"
                          onClick={(event) => {
                            event.stopPropagation();
                            if (parentProduct) {
                              onProductClick?.(parentProduct, { section: "variants" });
                            }
                          }}
                        >
                          {product.productName}
                        </button>
                      </td>
                    </tr>
                  );
                }
                
                return (
                  <tr
                    key={product.id}
                    className={cn(
                      "hover:bg-muted/20 transition-colors cursor-pointer",
                      isSelected && "bg-blue-50 hover:bg-blue-100",
                      !isInCurrentScope && "bg-amber-50/40",
                      // Visual grouping for expanded variants
                      isInExpandedGroup && "bg-blue-50/30",
                      isFirstInGroup && "border-t-2 border-gray-300",
                      isInExpandedGroup && "border-l-2 border-r-2 border-gray-300"
                    )}
                    style={{
                      borderBottom: isLastInGroup
                        ? "2px solid #d1d5db"
                        : (index === filteredAndSortedProducts.length - 1 && !(isParentProduct(product) && expandedParents.has(product.id)) && !isInExpandedGroup)
                        ? "none"
                        : "1px solid #e5e7eb"
                    }}
                    onClick={() => onProductClick?.(product)}
                  >
                    {/* Status */}
                    {visibleColumns.status && (
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        {/* Hierarchy indicators - always reserve space */}
                        <div className="flex items-center gap-1" style={{ marginLeft: isVariantProduct(product) ? '16px' : '0px' }}>
                          {showVariantHierarchy && isParentProduct(product) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleParentExpansion(product.id);
                              }}
                              className="h-4 w-4 p-0 hover:bg-gray-200"
                            >
                              {expandedParents.has(product.id) ? (
                                <ChevronDown className="w-3 h-3" />
                              ) : (
                                <ChevronRight className="w-3 h-3" />
                              )}
                            </Button>
                          )}
                          {showVariantHierarchy && isVariantProduct(product) && (
                            <div className="w-3 h-3 flex items-center justify-center">
                              <div className="w-2 h-px bg-gray-300" />
                            </div>
                          )}
                          {/* Reserve space for chevron even when not showing hierarchy or for standalone products */}
                          {(!showVariantHierarchy || isStandaloneProduct(product)) && (
                            <div className="w-4 h-4"></div>
                          )}
                        </div>
                        
                        {/* Checkbox */}
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => handleProductSelect(product.id, e)}
                          onClick={(e) => e.stopPropagation()}
                          disabled={isSharedProductRow}
                          className="w-3 h-3 text-[var(--color-accent-blue)] border-input rounded focus:ring-[var(--color-accent-blue-hover)]"
                        />

                        {isParentProduct(product) ? (
                          <div className="text-sm text-foreground">
                            Variants ({product.variantCount || 0})
                          </div>
                        ) : (
                          <Select
                            value={product.status || "Draft"}
                            onValueChange={(value) => handleStatusChange(product, value as ProductStatus)}
                            disabled={isSharedProductRow}
                          >
                            <SelectTrigger
                              className="h-8 w-[140px]"
                              onPointerDown={(event) => event.stopPropagation()}
                            >
                              <SelectValue placeholder="Draft" />
                            </SelectTrigger>
                            <SelectContent>
                              {PRODUCT_STATUSES.map((statusOption) => (
                                <SelectItem key={statusOption} value={statusOption}>
                                  {statusOption}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </td>
                    )}

                    {/* Product Name */}
                    {visibleColumns.productName && (
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <div className="font-normal flex-1 min-w-0 text-sm text-foreground">
                              {product.productName}
                            </div>
                            {isVariantProduct(product) && product.isInherited?.productName && (
                              <div className="w-2 h-2 bg-blue-400 rounded-full flex-shrink-0" title="Inherited from parent" />
                            )}
                          </div>

                          <div className="flex items-center gap-2 flex-wrap">
                            {!isInCurrentScope ? (
                              <Badge variant="outline" className="px-2 py-0.5 text-xs border-amber-300 text-amber-800">
                                Missing in scope
                              </Badge>
                            ) : null}
                            {isParentProduct(product) && (
                              <span className="text-sm text-muted-foreground whitespace-nowrap">
                                {product.variantCount ? `Variations (${product.variantCount})` : "Variations (0)"}
                              </span>
                            )}
                            {isVariantProduct(product) && product.variantAxis && (
                              <div className="flex gap-2 flex-wrap">
                                {Object.entries(product.variantAxis).map(([key, value]) => (
                                  <span key={key} className="text-xs text-muted-foreground">
                                    {value}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    )}

                    {/* Assets */}
                    {visibleColumns.assets && (
                      <td className="px-4 py-4">
                        {(() => {
                          const coreImages = coreAssetImagesByProductId[product.id] || [];
                          const visibleImages = coreImages.slice(0, CORE_ASSET_SLOT_ORDER.length);
                          if (visibleImages.length === 0) {
                            return product.assetsCount > 0 ? (
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <ImageIcon className="w-4 h-4" />
                                <span>{product.assetsCount} linked</span>
                              </div>
                            ) : null;
                          }

                          return (
                            <div className="flex items-center gap-3">
                              {visibleImages.map((image) => {
                                const failed = failedCoreAssetImageIds.has(image.assetId);
                                const usingFallback = fallbackCoreAssetImageIds.has(image.assetId);
                                const imageSrc = usingFallback ? image.fallbackPreviewUrl : image.previewUrl;
                                return (
                                  <div
                                    key={`${product.id}-${image.slot}-${image.assetId}`}
                                    className="h-14 w-14 overflow-hidden"
                                    title={`${image.slot.toUpperCase()}: ${image.filename || image.assetId}`}
                                  >
                                    {failed ? (
                                      <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                                        {image.slot[0].toUpperCase()}
                                      </div>
                                    ) : (
                                      <NextImage
                                        src={imageSrc}
                                        alt={image.filename || `${product.productName} ${image.slot}`}
                                        className="h-full w-full object-cover"
                                        loading="lazy"
                                        width={56}
                                        height={56}
                                        unoptimized
                                        onError={() => {
                                          if (!usingFallback && image.previewUrl !== image.fallbackPreviewUrl) {
                                            setFallbackCoreAssetImageIds((previous) => {
                                              if (previous.has(image.assetId)) {
                                                return previous;
                                              }
                                              const next = new Set(previous);
                                              next.add(image.assetId);
                                              return next;
                                            });
                                            return;
                                          }
                                          setFailedCoreAssetImageIds((previous) => {
                                            if (previous.has(image.assetId)) {
                                              return previous;
                                            }
                                            const next = new Set(previous);
                                            next.add(image.assetId);
                                            return next;
                                          });
                                        }}
                                      />
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </td>
                    )}

                    {/* SKU */}
                    {visibleColumns.sku && (
                      <td className="px-6 py-4">
                        <div className="text-sm text-foreground font-normal">
                          {product.sku}
                        </div>
                      </td>
                    )}

                    {/* Barcode */}
                    {visibleColumns.upc && (
                      <td className="px-6 py-4">
                        <div className="text-sm text-foreground font-normal">
                          {product.upc || '-'}
                        </div>
                      </td>
                    )}

                    {/* SCIN */}
                    {visibleColumns.scin && (
                      <td className="px-6 py-4">
                        <div className="text-sm text-foreground font-normal">
                          {product.scin || product.id}
                        </div>
                      </td>
                    )}

                    {/* Product Model */}
                    {visibleColumns.family && (
                      <td className="px-6 py-4">
                        <div className="text-sm text-foreground">
                          {product.family || "Unassigned"}
                        </div>
                      </td>
                    )}

                    {/* Completeness */}
                    {visibleColumns.contentScore && (
                      <td className="px-6 py-4 text-sm">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="h-[6px] w-[74px] overflow-hidden rounded-full"
                            style={{ backgroundColor: "rgba(31, 41, 55, 0.2)" }}
                            role="progressbar"
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={normalizedContentScore}
                            aria-label={`Product completion ${normalizedContentScore}%`}
                          >
                            <div
                              className="h-full rounded-full transition-[width] duration-200 ease-out"
                              style={{
                                width: `${normalizedContentScore}%`,
                                backgroundColor: getContentScoreBarColor(normalizedContentScore),
                                minWidth: normalizedContentScore > 0 ? "0.375rem" : "0",
                              }}
                            />
                          </div>
                          <span
                            className="text-sm font-medium tabular-nums"
                            style={{ color: "#6b7280" }}
                          >
                            {normalizedContentScore}%
                          </span>
                        </div>
                      </td>
                    )}

                    {/* Actions */}
                    <td className="px-6 py-4 text-right text-sm font-medium">
                      <div className="flex items-center justify-end">
                        {!isSharedProductRow ? (
                          <DropdownMenu.Root>
                            <DropdownMenu.Trigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenu.Trigger>
                            <DropdownMenu.Portal>
                              <DropdownMenu.Content
                                className="min-w-[160px] bg-white text-foreground font-sans rounded-lg shadow-lg border border-border p-1 z-50"
                                sideOffset={5}
                                align="end"
                                alignOffset={-8}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <DropdownMenu.Item
                                  className="flex items-center gap-2 px-3 py-2 text-sm font-sans cursor-pointer rounded-md hover:bg-muted outline-none"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onProductClick?.(product);
                                  }}
                                >
                                  <Edit className="w-4 h-4" />
                                  Edit
                                </DropdownMenu.Item>
                                <DropdownMenu.Item
                                  className="flex items-center gap-2 px-3 py-2 text-sm font-sans cursor-pointer rounded-md hover:bg-muted outline-none text-red-600"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openDeleteDialogForProducts([product]);
                                  }}
                                >
                                  <Trash2 className="w-4 h-4" />
                                  Delete
                                </DropdownMenu.Item>
                              </DropdownMenu.Content>
                            </DropdownMenu.Portal>
                          </DropdownMenu.Root>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              }))
              }
            </tbody>
          </table>
        </div>

        {/* Empty State */}
      {filteredAndSortedProducts.length === 0 && (
        <div className="text-center py-12">
          <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No products found
          </h3>
        </div>
      )}
      </div>

      <Dialog
        open={bulkScopeDialogOpen}
        onOpenChange={(open) => {
          setBulkScopeDialogOpen(open);
          if (!open) {
            setBulkScopeError(null);
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Bulk Edit Authoring Scope</DialogTitle>
            <DialogDescription>
              Apply scope changes to {selectedShareableProducts.length} selected product
              {selectedShareableProducts.length === 1 ? "" : "s"} and variants.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
              Current view context:{" "}
              <span className="font-medium text-foreground">
                {selectedMarketId ? markets.find((market) => market.id === selectedMarketId)?.name || "Market selected" : "All markets"}
              </span>
              {" / "}
              <span className="font-medium text-foreground">
                {selectedChannel?.name || "All channels"}
              </span>
              {" / "}
              <span className="font-medium text-foreground">
                {selectedLocale?.code || "All languages"}
              </span>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Operation</label>
              <Select
                value={bulkScopeMode}
                onValueChange={(value) => setBulkScopeMode(value as ProductBulkScopeMode)}
              >
                <SelectTrigger className="h-8 w-[220px]">
                  <SelectValue placeholder="Choose operation" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="set">Set scope</SelectItem>
                  <SelectItem value="add">Add to scope</SelectItem>
                  <SelectItem value="clear">Clear to global</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {bulkScopeMode === "set" || bulkScopeMode === "add" ? (
              <AuthoringScopePicker
                value={bulkScopeValue}
                onChange={setBulkScopeValue}
                title="Scope values"
                description="Set replaces existing scope. Add merges with existing scope per product."
              />
            ) : (
              <p className="text-xs text-muted-foreground">
                Clear removes scoped limits and sets selected products to global authoring scope.
              </p>
            )}
            <div className="rounded-md border border-border bg-muted/10 p-3 text-xs text-muted-foreground">
              Result:{" "}
              <span className="font-medium text-foreground">
                {bulkScopeMode === "clear"
                  ? "Global"
                  : bulkScopeMode === "add"
                  ? `Add ${getAuthoringScopeSummary(bulkScopeValue)}`
                  : `Set to ${getAuthoringScopeSummary(bulkScopeValue)}`}
              </span>
            </div>
            {bulkScopeError ? (
              <p className="text-sm text-destructive">{bulkScopeError}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBulkScopeDialogOpen(false)}
              disabled={bulkScopeSubmitting}
              className="h-8 px-3 text-sm"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                void handleApplyBulkScope();
              }}
              disabled={bulkScopeSubmitting}
              className="h-8 px-3 text-sm"
            >
              {bulkScopeSubmitting ? "Applying..." : "Apply Scope"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isShareDialogOpen}
        onOpenChange={(open) => {
          setIsShareDialogOpen(open);
          if (!open) {
            setShareDialogError(null);
            setNewShareSetName("");
            clearShareScopeConstraints();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Selection To Product Set</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
              Selected:{" "}
              <span className="font-medium text-foreground">
                {selectedShareableProducts.length} product
                {selectedShareableProducts.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Product Set</label>
              <Select value={selectedShareSetId} onValueChange={setSelectedShareSetId}>
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Select a product set" />
                </SelectTrigger>
                <SelectContent>
                  {shareSetOptions.map((set) => (
                    <SelectItem key={set.id} value={set.id}>
                      {set.name} ({set.product_count} products, {set.variant_count} variants)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center justify-between">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 px-3 text-sm"
                  onClick={() => {
                    void fetchShareSetOptions();
                  }}
                  disabled={isLoadingShareSets}
                >
                  {isLoadingShareSets ? "Loading..." : "Refresh sets"}
                </Button>
                <Link href={`/${tenantSlug}/settings/sets`} className="text-sm text-primary hover:underline">
                  Manage sets
                </Link>
              </div>
              <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Optional Scope Constraints
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 px-3 text-sm"
                      onClick={applyCurrentScopeToShareSelection}
                    >
                      Use Current View
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 px-3 text-sm"
                      onClick={clearShareScopeConstraints}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Empty scope means these products/variants are visible in all markets/channels/locales
                  allowed by the partner grant.
                </p>
                <div className="grid gap-2 md:grid-cols-3">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Markets</label>
                    <MultiSelect
                      options={shareMarketOptions}
                      value={shareMarketIds}
                      onChange={setShareMarketIds}
                      placeholder="Select one or more markets"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Channels</label>
                    <MultiSelect
                      options={shareChannelOptions}
                      value={shareChannelIds}
                      onChange={setShareChannelIds}
                      placeholder="Select one or more channels"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Locales</label>
                    <MultiSelect
                      options={shareLocaleOptions}
                      value={shareLocaleIds}
                      onChange={setShareLocaleIds}
                      placeholder="Select one or more locales"
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Create New Product Set
                </p>
                <div className="flex items-center gap-2">
                  <Input
                    value={newShareSetName}
                    onChange={(event) => setNewShareSetName(event.target.value)}
                    placeholder="Example: Retail Core Range"
                    disabled={isCreatingShareSet}
                    className="h-8"
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 px-3 text-sm"
                    onClick={() => {
                      void handleCreateShareSetInline();
                    }}
                    disabled={isCreatingShareSet || !newShareSetName.trim()}
                  >
                    {isCreatingShareSet ? "Creating..." : "Create"}
                  </Button>
                </div>
              </div>
              {!isLoadingShareSets && shareSetOptions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No product sets found yet. Create one above or in Settings.
                </p>
              ) : null}
              {shareDialogError ? (
                <p className="text-sm text-destructive">{shareDialogError}</p>
              ) : null}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-8 px-3 text-sm" onClick={() => setIsShareDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                void handleConfirmShareSelection();
              }}
              disabled={isSubmittingShare || !selectedShareSetId || selectedShareableProducts.length === 0}
              className="h-8 px-3 text-sm"
            >
              {isSubmittingShare ? "Adding..." : "Add To Set"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showDeleteDialog}
        onOpenChange={(open) => {
          setShowDeleteDialog(open);
          if (!open) {
            setDeleteConfirmText("");
            setPendingDeleteProducts([]);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Delete Product{pendingDeleteProducts.length === 1 ? "" : "s"}</DialogTitle>
            <DialogDescription>
              This action permanently deletes the selected product records.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <p className="font-medium">You are about to delete:</p>
              <p>
                {pendingDeleteProducts.length} product{pendingDeleteProducts.length === 1 ? "" : "s"}
              </p>
              <p className="mt-1">
                This cannot be undone. Parent products with remaining variants will not be deleted.
              </p>
            </div>

            <div className="rounded-md border border-border bg-muted/20 p-3">
              <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                Selected items
              </p>
              <div className="space-y-1 text-sm">
                {pendingDeleteProducts.slice(0, 8).map((product) => (
                  <p key={product.id} className="text-foreground">
                    {product.productName || product.sku || product.id}
                    <span className="ml-2 text-muted-foreground">
                      ({isVariantProduct(product) ? "Variant" : isParentProduct(product) ? "Parent" : "Single SKU"})
                    </span>
                  </p>
                ))}
                {pendingDeleteProducts.length > 8 ? (
                  <p className="text-muted-foreground">
                    +{pendingDeleteProducts.length - 8} more
                  </p>
                ) : null}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                To confirm, type <span className="rounded bg-muted px-1 font-mono">delete</span>
              </label>
              <Input
                value={deleteConfirmText}
                onChange={(event) => setDeleteConfirmText(event.target.value)}
                placeholder="Type 'delete' to confirm"
                className="h-8"
              />
            </div>

            {bulkDeleteError ? (
              <p className="text-sm text-destructive">{bulkDeleteError}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowDeleteDialog(false);
                setDeleteConfirmText("");
                setPendingDeleteProducts([]);
              }}
              disabled={bulkDeleteSubmitting}
              className="h-8 px-3 text-sm"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                void handleConfirmDelete();
              }}
              disabled={bulkDeleteSubmitting || deleteConfirmText.trim().toLowerCase() !== "delete"}
              className="h-8 px-3 text-sm"
            >
              {bulkDeleteSubmitting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Action Toolbar */}
      <BulkActionToolbar
        selectedCount={isSharedBrandView ? 0 : selectedShareableProducts.length}
        onAddToSet={handleBulkShare}
        onRemoveFromSet={filterSetId && !isSharedBrandView ? handleRemoveFromSet : undefined}
        activeSetName={filterSetId ? (shareSetOptions.find((s) => s.id === filterSetId)?.name ?? undefined) : undefined}
        onEdit={handleBulkEdit}
        onTag={handleBulkStatusUpdate}
        onDelete={handleBulkDelete}
        onAddToKit={!isSharedBrandView ? handleBulkAddToKit : undefined}
        onTranslate={canTranslate && !isSharedBrandView ? handleBulkTranslate : undefined}
        onClear={handleClearSelection}
      />

      {canTranslate && !isSharedBrandView && (
        <TranslationPanel
          tenantSlug={tenantSlug}
          productId={selectedShareableProducts[0]?.id ?? ''}
          productIds={selectedShareableProducts.map((p) => p.id)}
          open={isTranslatePanelOpen}
          onOpenChange={setIsTranslatePanelOpen}
          initialSourceLocaleId={selectedLocaleId ?? undefined}
          productInfoById={Object.fromEntries(
            selectedShareableProducts.map((p) => [
              p.id,
              {
                name: p.productName,
                thumbnailUrl: coreAssetImagesByProductId[p.id]?.[0]?.previewUrl,
              },
            ])
          )}
        />
      )}

      <AddToKitDialog
        tenantSlug={tenantSlug}
        open={isAddToKitDialogOpen}
        onOpenChange={setIsAddToKitDialogOpen}
        items={selectedShareableProducts.map((p) => ({
          type: "product" as const,
          id: p.id,
          name: p.productName ?? undefined,
        }))}
      />
    </div>
  );
}

