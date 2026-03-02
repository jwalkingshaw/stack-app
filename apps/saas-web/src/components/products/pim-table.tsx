"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
import {
  AuthoringScopePicker,
  type AuthoringScopeValue,
  createGlobalAuthoringScope,
  getAuthoringScopeSummary,
  normalizeAuthoringScope,
} from "@/components/scope/authoring-scope-picker";
import { type PIMProduct } from "./mock-pim-data";
import { getProductUrl } from "@/lib/product-utils";
import { useMarketContext } from "@/components/market-context";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";


// Type guards for product hierarchy
const isParentProduct = (product: PIMProduct): boolean => product.type === 'parent';
const isVariantProduct = (product: PIMProduct): boolean => product.type === 'variant';
const isStandaloneProduct = (product: PIMProduct): boolean => product.type === 'standalone';

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

interface PIMTableProps {
  tenantSlug: string;
  selectedBrandSlug?: string | null;
  isPartnerAllView?: boolean;
  onProductClick?: (product: PIMProduct) => void;
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
  productName: true,
  scin: true,
  sku: true,
  family: true,
  upc: true,
  status: true,
  lastModified: true,
  brandLine: false,
  msrp: false,
  costOfGoods: false,
  marginPercent: false,
  assetsCount: false,
  contentScore: false
};

type ProductLinkRecord = {
  product_id?: string | null;
  asset_id?: string | null;
  channel_id?: string | null;
  market_id?: string | null;
  locale_id?: string | null;
  destination_id?: string | null;
  is_primary?: boolean | null;
  created_at?: string | null;
  dam_assets?: {
    id?: string | null;
    filename?: string | null;
  } | null;
};

type ProductFrontImage = {
  assetId: string;
  previewUrl: string;
  filename: string | null;
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
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("All");
  const [filterProductModel, setFilterProductModel] = useState<string>(PRODUCT_MODEL_FILTER_ALL);
  const [sortField, setSortField] = useState<keyof PIMProduct>("productName");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
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
  const [scopeFilterMode, setScopeFilterMode] = useState<ScopeFilterMode>("all");
  const [bulkScopeDialogOpen, setBulkScopeDialogOpen] = useState(false);
  const [bulkScopeMode, setBulkScopeMode] = useState<ProductBulkScopeMode>("set");
  const [bulkScopeValue, setBulkScopeValue] = useState<AuthoringScopeValue>(createGlobalAuthoringScope());
  const [bulkScopeSubmitting, setBulkScopeSubmitting] = useState(false);
  const [bulkScopeError, setBulkScopeError] = useState<string | null>(null);
  const [bulkScopeStatusMessage, setBulkScopeStatusMessage] = useState<string | null>(null);

  // Product creation workflow state
  const [creationMode, setCreationMode] = useState(false);
  const [creatingProducts, setCreatingProducts] = useState<Partial<PIMProduct>[]>([]);

  const visibleColumns = DEFAULT_VISIBLE_COLUMNS;

  const [frontImageByProductId, setFrontImageByProductId] = useState<Record<string, ProductFrontImage>>({});
  const [failedFrontImageAssetIds, setFailedFrontImageAssetIds] = useState<Set<string>>(new Set());
  
  // Hierarchy state
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());
  const [showVariantHierarchy, setShowVariantHierarchy] = useState(true);

  const buildScopedProductsUrl = useCallback(() => {
    const query = new URLSearchParams();
    if (isPartnerAllView) query.set("view", "all");
    if (selectedMarketId) query.set("marketId", selectedMarketId);
    if (selectedLocale?.code) query.set("locale", selectedLocale.code);
    if (selectedChannel?.code) query.set("channel", selectedChannel.code);
    if (normalizedSelectedBrand) query.set("brand", normalizedSelectedBrand);

    return query.toString()
      ? `/api/${tenantSlug}/products?${query.toString()}`
      : `/api/${tenantSlug}/products`;
  }, [
    isPartnerAllView,
    normalizedSelectedBrand,
    selectedChannel?.code,
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
    let filtered = products.filter(product => {
      const matchesSearch = searchQuery === "" || 
        product.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (product.sku || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (product.scin || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (product.upc || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.brandLine?.toLowerCase().includes(searchQuery.toLowerCase());
      
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

      return matchesSearch && matchesStatus && matchesProductModel && matchesScope;
    });

    if (!showVariantHierarchy) {
      return filtered;
    }

    const result: PIMProduct[] = [];
    const processedIds = new Set<string>();

    filtered.forEach(product => {
      if (processedIds.has(product.id)) return;

      if (isParentProduct(product)) {
        result.push(product);
        processedIds.add(product.id);

        if (expandedParents.has(product.id)) {
          const variants = filtered.filter(p => p.parentId === product.id);
          
          // Show first 15 variants
          const visibleVariants = variants.slice(0, 15);
          visibleVariants.forEach(variant => {
            result.push(variant);
            processedIds.add(variant.id);
          });
          
          // Add "view all" link as pseudo-product if there are more than 15 variants
          if (variants.length > 15) {
            result.push({
              id: `${product.id}_view_all`,
              type: 'standalone' as const,
              productName: `View all ${variants.length} variations`,
              sku: '',
              assetsCount: 0,
              contentScore: 0,
              lastModified: '',
              lastModifiedBy: '',
              status: 'Active' as const,
              // Special flag to identify this as a "view all" row
              isViewAllLink: true,
              parentId: product.id
            } as PIMProduct & { isViewAllLink: boolean });
          }
        }
      } else if (isVariantProduct(product)) {
        const hasParentInResults = filtered.some(p => p.id === product.parentId);
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
  ]);

  // Load products
  useEffect(() => {
    const controller = new AbortController();
    let isCancelled = false;

    const loadProducts = async () => {
      try {
        setLoading(true);
        const response = await fetch(buildScopedProductsUrl(), {
          signal: controller.signal,
        });
        if (isCancelled) return;

        if (!response.ok) {
          if ([401, 403, 404].includes(response.status)) {
            setProducts([]);
            return;
          }
          throw new Error(`Failed to fetch products: ${response.status}`);
        }
        const data = await response.json();
        if (isCancelled) return;
        
        if (data.success && data.data) {
          // Transform Supabase data to PIMProduct format
          const transformedProducts = data.data.map((product: any) => ({
            id: product.id,
            organizationId: product.organization_id,
            organizationSlug: product.organization_slug,
            organizationName: product.organization_name,
            type: product.type,
            parentId: product.parent_id,
            hasVariants: product.has_variants,
            variantCount: product.variant_count,
            productName: product.product_name,
            scin: product.scin,
            sku: product.sku,
            upc: product.barcode ?? product.upc,
            brandLine: product.brand_line,
            family: product.product_families?.name,
            variantAxis: product.variant_axis || {},
            status: product.status,
            launchDate: product.launch_date,
            msrp: product.msrp,
            costOfGoods: product.cost_of_goods,
            marginPercent: product.margin_percent,
            assetsCount: product.assets_count,
            contentScore: product.content_score,
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
            lastModifiedBy: product.last_modified_by,
            lastModified: product.updated_at,
            // Add parent SKU for variants by finding the parent product
            parent_sku: product.type === 'variant' && product.parent_id
              ? data.data.find((p: any) => p.id === product.parent_id)?.sku
              : undefined,
          }));
          
          setProducts(transformedProducts);
        } else {
          // No products found - start with empty state
          setProducts([]);
        }
      } catch (error) {
        if (isCancelled || (error as Error)?.name === "AbortError") {
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
      controller.abort();
    };
  }, [buildScopedProductsUrl]);

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

    const loadFrontImages = async () => {
      if (products.length === 0) {
        setFrontImageByProductId({});
        return;
      }

      try {
        const query = new URLSearchParams({
          document_slot_code: "image_front",
        });
        if (isPartnerAllView) {
          query.set("view", "all");
        }
        if (normalizedSelectedBrand) {
          query.set("brand", normalizedSelectedBrand);
        }

        const response = await fetch(`/api/${tenantSlug}/product-links?${query.toString()}`);
        if (!response.ok) {
          throw new Error(`Failed to fetch image slots (${response.status})`);
        }

        const payload = await response.json();
        if (isCancelled) return;

        const links = (payload?.data || []) as ProductLinkRecord[];
        const productIds = new Set(products.map((product) => product.id));
        const bestByProduct = new Map<
          string,
          { rank: number; createdAt: number; image: ProductFrontImage }
        >();

        for (const link of links) {
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
          const existing = bestByProduct.get(productId);
          if (
            !existing ||
            rank > existing.rank ||
            (rank === existing.rank && createdAt > existing.createdAt)
          ) {
            bestByProduct.set(productId, {
              rank,
              createdAt,
              image: {
                assetId,
                previewUrl: buildAssetPreviewPath(assetId),
                filename: link.dam_assets?.filename || null,
              },
            });
          }
        }

        const nextMap: Record<string, ProductFrontImage> = {};
        for (const [productId, entry] of bestByProduct.entries()) {
          nextMap[productId] = entry.image;
        }
        setFrontImageByProductId(nextMap);
        setFailedFrontImageAssetIds(new Set());
      } catch (error) {
        if (isCancelled) return;
        console.error("Failed to load front image slot links:", error);
        setFrontImageByProductId({});
      }
    };

    void loadFrontImages();
    return () => {
      isCancelled = true;
    };
  }, [
    buildAssetPreviewPath,
    doesScopedLinkMatch,
    getScopedLinkRank,
    isPartnerAllView,
    normalizedSelectedBrand,
    products,
    tenantSlug,
  ]);

  // Start product creation workflow (clear view)
  const handleStartCreation = () => {
    const newId = `new_${Date.now()}`;
    const newProductRow: Partial<PIMProduct> = {
      id: newId,
      type: 'parent',
      productName: '',
      sku: '',
      status: 'Draft',
      brandLine: '',
      family: '',
      contentScore: 0,
      assetsCount: 0,
      variantCount: 0,
      hasVariants: false,
    };
    
    setCreationMode(true);
    setCreatingProducts([newProductRow]);
  };

  // Add another product row in creation mode
  const handleAddProductRow = () => {
    const newId = `new_${Date.now()}`;
    const newProductRow: Partial<PIMProduct> = {
      id: newId,
      type: 'parent',
      productName: '',
      sku: '',
      upc: '',
      status: 'Draft',
      brandLine: '',
      family: '',
      contentScore: 0,
      assetsCount: 0,
      variantCount: 0,
      hasVariants: false,
    };
    
    setCreatingProducts(prev => [...prev, newProductRow]);
  };

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
  // Get filtered products with hierarchy, then sort (memoized for performance)
  const filteredAndSortedProducts = useMemo(() => {
    return getFilteredProductsWithHierarchy.sort((a, b) => {
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
    });
  }, [getFilteredProductsWithHierarchy, sortField, sortDirection]);

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
  }, [selectableProductIds, selectedProductIds]);

  const handleClearSelection = useCallback(() => {
    setSelectedProductIds(new Set());
    setShareStatusMessage(null);
    setBulkScopeStatusMessage(null);
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

  const handleBulkDelete = () => {
    // TODO: Show confirmation modal then delete
    if (confirm(`Delete ${selectedProductIds.size} selected products?`)) {
      console.log('Bulk deleting products:', Array.from(selectedProductIds));
      setProducts(prev => prev.filter(p => !selectedProductIds.has(p.id)));
      setSelectedProductIds(new Set());
    }
  };

  const handleBulkShare = () => {
    void openShareDialog();
  };

  const handleStatusChange = async (product: Partial<PIMProduct>, status: ProductStatus) => {
    if (!product.id) {
      return;
    }
    if (isSharedRow(product)) {
      return;
    }
    try {
      const response = await fetch(`/api/organizations/${tenantSlug}/products/${product.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        throw new Error(`Failed to update product status (${response.status})`);
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

  // Content score color coding
  const getContentScoreColor = (score: number) => {
    if (score >= 90) return "text-green-600";
    if (score >= 70) return "text-yellow-600"; 
    return "text-red-600";
  };

  // Margin color coding
  const getMarginColor = (margin?: number) => {
    if (!margin) return "text-muted-foreground";
    if (margin >= 55) return "text-green-600";
    if (margin >= 45) return "text-yellow-600";
    return "text-red-600";
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

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
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
              <SelectTrigger className="h-8 w-[140px] shrink-0">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
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
              <SelectTrigger className="h-8 w-[190px] shrink-0">
                <SelectValue placeholder="Product Model" />
              </SelectTrigger>
              <SelectContent>
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
              <SelectTrigger className="h-8 w-[190px] shrink-0">
                <SelectValue placeholder="Scope Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Scopes</SelectItem>
                <SelectItem value="in_scope">In Current Scope</SelectItem>
                <SelectItem value="out_of_scope">Missing In Scope</SelectItem>
              </SelectContent>
            </Select>

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

        {/* Selection Info */}
        {!creationMode && selectedShareableProducts.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-700 rounded-lg border border-muted/30">
            <span className="text-sm font-medium">
              {selectedShareableProducts.length} selected
            </span>
            {!isSharedBrandView ? (
              <Button size="sm" variant="outline" className="h-8 px-3 text-sm" onClick={handleBulkShare}>
                Share selected
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              onClick={handleClearSelection}
              className="h-8 w-8 p-0 hover:bg-blue-100"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        )}
        {shareStatusMessage ? (
          <p className="text-sm text-emerald-700">{shareStatusMessage}</p>
        ) : null}
        {bulkScopeStatusMessage ? (
          <p className="text-sm text-blue-700">{bulkScopeStatusMessage}</p>
        ) : null}
      </div>

      {/* Products Table */}
      <div className="bg-background border border-muted/30 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse">
            {/* Table Header */}
            <thead className="bg-muted/50">
              <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                {/* Hierarchy Toggle + Select All */}
                <th className="w-16 px-4 py-3">
                  <div className="flex items-center gap-1">
                    {/* Reserve space to align with chevron position in body rows */}
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowVariantHierarchy(!showVariantHierarchy)}
                        className="h-4 w-4 p-0 hover:bg-muted/60"
                        title={showVariantHierarchy ? "Flatten view" : "Show hierarchy"}
                      >
                        {showVariantHierarchy ? <GitBranch className="w-3 h-3" /> : <Layers className="w-3 h-3" />}
                      </Button>
                    </div>

                    {/* Select All Checkbox */}
                    <input
                      type="checkbox"
                      checked={
                        selectableProductIds.length > 0 &&
                        selectableProductIds.every((id) => selectedProductIds.has(id))
                      }
                      onChange={handleSelectAll}
                      className="w-3 h-3 text-blue-600 border-input rounded focus:ring-blue-500"
                    />
                  </div>
                </th>

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

                {/* Brand Line */}
                {visibleColumns.brandLine && (
                  <th 
                    className="px-4 py-3 text-left text-xs font-medium text-muted-foreground/80 uppercase tracking-wider cursor-pointer hover:bg-muted/60 transition-colors"
                    onClick={() => handleSort("brandLine")}
                  >
                    <div className="flex items-center gap-1">
                      Brand Line
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                )}

                {/* Family */}
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

                {/* Status */}
                {visibleColumns.status && (
                  <th 
                    className="px-4 py-3 text-left text-xs font-medium text-muted-foreground/80 uppercase tracking-wider cursor-pointer hover:bg-muted/60 transition-colors"
                    onClick={() => handleSort("status")}
                  >
                    <div className="flex items-center gap-1">
                      Status
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                )}

                {/* MSRP */}
                {visibleColumns.msrp && (
                  <th 
                    className="px-4 py-3 text-left text-xs font-medium text-muted-foreground/80 uppercase tracking-wider cursor-pointer hover:bg-muted/60 transition-colors"
                    onClick={() => handleSort("msrp")}
                  >
                    <div className="flex items-center gap-1">
                      MSRP
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                )}

                {/* Cost of Goods */}
                {visibleColumns.costOfGoods && (
                  <th 
                    className="px-4 py-3 text-left text-xs font-medium text-muted-foreground/80 uppercase tracking-wider cursor-pointer hover:bg-muted/60 transition-colors"
                    onClick={() => handleSort("costOfGoods")}
                  >
                    <div className="flex items-center gap-1">
                      COGS
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                )}

                {/* Margin % */}
                {visibleColumns.marginPercent && (
                  <th 
                    className="px-4 py-3 text-left text-xs font-medium text-muted-foreground/80 uppercase tracking-wider cursor-pointer hover:bg-muted/60 transition-colors"
                    onClick={() => handleSort("marginPercent")}
                  >
                    <div className="flex items-center gap-1">
                      Margin %
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                )}

                {/* Assets */}
                {visibleColumns.assetsCount && (
                  <th 
                    className="px-4 py-3 text-left text-xs font-medium text-muted-foreground/80 uppercase tracking-wider cursor-pointer hover:bg-muted/60 transition-colors"
                    onClick={() => handleSort("assetsCount")}
                  >
                    <div className="flex items-center gap-1">
                      Assets
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                )}

                {/* Content Score */}
                {visibleColumns.contentScore && (
                  <th 
                    className="px-4 py-3 text-left text-xs font-medium text-muted-foreground/80 uppercase tracking-wider cursor-pointer hover:bg-muted/60 transition-colors"
                    onClick={() => handleSort("contentScore")}
                  >
                    <div className="flex items-center gap-1">
                      Content Score
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                )}

                {/* Last Modified */}
                {visibleColumns.lastModified && (
                  <th 
                    className="px-4 py-3 text-left text-xs font-medium text-muted-foreground/80 uppercase tracking-wider cursor-pointer hover:bg-muted/60 transition-colors"
                    onClick={() => handleSort("lastModified")}
                  >
                    <div className="flex items-center gap-1">
                      Last Modified
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
                  {/* Hierarchy + Checkbox */}
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        disabled
                        className="w-4 h-4"
                      />
                    </div>
                  </td>

                  {/* Product Name */}
                  {visibleColumns.productName && (
                    <td className="px-6 py-4 max-w-120">
                      <div className="break-words">
                        {product.productName || <span className="text-muted-foreground">Enter product name...</span>}
                      </div>
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

                  {/* SKU */}
                  {visibleColumns.sku && (
                    <td className="px-6 py-4">
                      <span className="font-normal">
                        {product.sku || <span className="text-muted-foreground">Enter SKU...</span>}
                      </span>
                    </td>
                  )}

                  {/* Brand Line */}
                  {visibleColumns.brandLine && (
                    <td className="px-6 py-4">
                      {product.brandLine || <span className="text-muted-foreground">Enter brand line...</span>}
                    </td>
                  )}

                  {/* Family */}
                  {visibleColumns.family && (
                    <td className="px-6 py-4">
                      {product.family || <span className="text-muted-foreground">Select model...</span>}
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

                  {/* Status */}
                    {visibleColumns.status && (
                      <td className="px-6 py-4">
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
                const isViewAllLink = (product as any).isViewAllLink;
                const isSharedProductRow = isSharedRow(product);
                const isInCurrentScope = isProductInCurrentScope(product);
                
                // Determine if this row is part of an expanded variant group
                const isInExpandedGroup = (isVariantProduct(product) || isViewAllLink) && 
                  expandedParents.has(product.parentId || '');
                const isFirstInGroup = isInExpandedGroup && 
                  (!prevProduct || (prevProduct.parentId !== product.parentId && !(prevProduct as any).isViewAllLink));
                const isLastInGroup = isInExpandedGroup && 
                  (!nextProduct || (nextProduct.parentId !== product.parentId && !isViewAllLink));
                
                // Special handling for "View all variations" link
                if (isViewAllLink) {
                  return (
                    <tr
                      key={product.id}
                      className={cn(
                        "hover:bg-muted/20 transition-colors cursor-pointer",
                        "bg-blue-50/30 border-l-2 border-r-2 border-muted/30",
                        isLastInGroup && "border-b-2 border-muted/30"
                      )}
                      style={{ borderBottom: index === filteredAndSortedProducts.length - 1 ? "none" : "1px solid #e5e7eb" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        // Find the parent product and navigate to its detail page
                        const parentProduct = products.find(p => p.id === product.parentId);
                        if (parentProduct) {
                          onProductClick?.(parentProduct);
                        }
                      }}
                    >
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-1">
                          <div className="flex items-center gap-1" style={{ marginLeft: '16px' }}>
                            <div className="w-3 h-3 flex items-center justify-center">
                              <div className="w-2 h-px bg-gray-300" />
                            </div>
                          </div>
                          {/* No checkbox for view all link */}
                        </div>
                      </td>
                      
                      {/* Product Name - View All Link */}
                      {visibleColumns.productName && (
                        <td className="px-6 py-4" colSpan={Object.values(visibleColumns).filter(Boolean).length + 1}>
                          <div className="flex items-center gap-3">
                            <div className="flex-shrink-0 w-12 h-12"></div>
                            <div className="flex-1 min-w-0">
                              <div className="text-blue-600 hover:underline font-normal text-sm">
                                {product.productName}
                              </div>
                            </div>
                          </div>
                        </td>
                      )}
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
                    {/* Hierarchy + Checkbox */}
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1">
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
                          className="w-3 h-3 text-blue-600 border-input rounded focus:ring-blue-500"
                        />
                      </div>
                    </td>

                    {/* Product Name with Image */}
                    {visibleColumns.productName && (
                      <td className="px-6 py-4">
                        <div className="flex items-start gap-3">
                          {/* Product Image */}
                          <div className="flex-shrink-0 w-12 h-12 bg-gray-100 rounded-lg border border-muted/30 flex items-center justify-center overflow-hidden">
                            {(() => {
                              const frontImage = frontImageByProductId[product.id];
                              const canRenderFrontImage =
                                Boolean(frontImage) &&
                                !failedFrontImageAssetIds.has(frontImage.assetId);

                              if (frontImage && canRenderFrontImage) {
                                return (
                                  <img
                                    src={frontImage.previewUrl}
                                    alt={frontImage.filename || `${product.productName} front image`}
                                    className="h-full w-full object-cover"
                                    loading="lazy"
                                    onError={() => {
                                      setFailedFrontImageAssetIds((previous) => {
                                        if (previous.has(frontImage.assetId)) {
                                          return previous;
                                        }
                                        const next = new Set(previous);
                                        next.add(frontImage.assetId);
                                        return next;
                                      });
                                    }}
                                  />
                                );
                              }

                              if (product.assetsCount > 0) {
                                return (
                                  <div className="w-full h-full bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center">
                                    <ImageIcon className="w-5 h-5 text-muted-foreground" />
                                  </div>
                                );
                              }

                              return <div className="text-xs text-muted-foreground text-center">No image</div>;
                            })()}
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            {/* Clear product name display */}
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <div className="font-normal flex-1 min-w-0 text-sm text-foreground">
                                  {product.productName}
                                </div>
                                
                                {/* Content inheritance indicator */}
                                {isVariantProduct(product) && product.isInherited?.productName && (
                                  <div className="w-2 h-2 bg-blue-400 rounded-full flex-shrink-0" title="Inherited from parent" />
                                )}
                              </div>
                              
                              {/* Secondary info row */}
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs text-muted-foreground whitespace-nowrap">
                                  {isParentProduct(product)
                                    ? 'Parent product'
                                    : isVariantProduct(product)
                                    ? 'Variant'
                                    : 'Single SKU'}
                                </span>
                                {!isInCurrentScope ? (
                                  <Badge variant="outline" className="px-2 py-0.5 text-xs border-amber-300 text-amber-800">
                                    Missing in scope
                                  </Badge>
                                ) : null}
                                {/* Variation count indicator for parents */}
                                {isParentProduct(product) && (
                                  <span className="text-sm text-muted-foreground whitespace-nowrap">
                                    {product.variantCount && product.variantCount > 15 ? (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onProductClick?.(product);
                                        }}
                                        className="text-sm text-muted-foreground hover:underline"
                                      >
                                        View {product.variantCount} variations
                                      </button>
                                    ) : (
                                      `Variations (${product.variantCount})`
                                    )}
                                  </span>
                                )}
                                
                                {/* Variant attributes for variants */}
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
                            
                            {/* Simplified product metadata - no categories or parent references for cleaner display */}
                          </div>
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

                    {/* SKU */}
                    {visibleColumns.sku && (
                      <td className="px-6 py-4">
                        <div className="text-sm text-foreground font-normal">
                          {product.sku}
                        </div>
                      </td>
                    )}

                    {/* Brand Line */}
                    {visibleColumns.brandLine && (
                      <td className="px-6 py-4">
                        <div className="text-sm text-foreground">
                          {product.brandLine || '-'}
                        </div>
                      </td>
                    )}

                    {/* Family */}
                    {visibleColumns.family && (
                      <td className="px-6 py-4">
                        <div className="text-sm text-foreground">
                          {product.family || "Unassigned"}
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

                    {/* Status */}
                    {visibleColumns.status && (
                      <td className="px-6 py-4">
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
                      </td>
                    )}

                    {/* MSRP */}
                    {visibleColumns.msrp && (
                      <td className="px-6 py-4">
                        <div className="text-sm text-foreground">
                          {product.msrp ? `$${product.msrp}` : '-'}
                        </div>
                      </td>
                    )}

                    {/* Cost of Goods */}
                    {visibleColumns.costOfGoods && (
                      <td className="px-6 py-4">
                        <div className="text-sm text-foreground">
                          {product.costOfGoods ? `$${product.costOfGoods}` : '-'}
                        </div>
                      </td>
                    )}

                    {/* Margin % */}
                    {visibleColumns.marginPercent && (
                      <td className="px-6 py-4 text-sm">
                        <span className={cn("font-medium", getMarginColor(product.marginPercent))}>
                          {product.marginPercent ? `${product.marginPercent}%` : '-'}
                        </span>
                      </td>
                    )}

                    {/* Assets */}
                    {visibleColumns.assetsCount && (
                      <td className="px-6 py-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <ImageIcon className="w-4 h-4" />
                          {product.assetsCount}
                        </div>
                      </td>
                    )}

                    {/* Content Score */}
                    {visibleColumns.contentScore && (
                      <td className="px-6 py-4 text-sm">
                        <span className={cn("text-sm font-medium", getContentScoreColor(product.contentScore))}>
                          {product.contentScore}%
                        </span>
                      </td>
                    )}

                    {/* Last Modified */}
                    {visibleColumns.lastModified && (
                      <td className="px-6 py-4 text-sm text-muted-foreground">
                        <div>{formatDate(product.lastModified)}</div>
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
                                    console.log('Delete product:', product.id);
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

      {/* Bulk Action Toolbar */}
      <BulkActionToolbar
        selectedCount={isSharedBrandView ? 0 : selectedShareableProducts.length}
        onEdit={handleBulkEdit}
        onTag={handleBulkStatusUpdate}
        onMove={handleBulkMove}
        onDelete={handleBulkDelete}
        onShare={handleBulkShare}
        onClear={handleClearSelection}
      />
    </div>
  );
}

