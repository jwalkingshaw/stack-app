"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Package, Zap, FileText, Settings, ImageIcon, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { VariantManagement } from "@/components/products/variant-management";
import { DynamicFieldRenderer } from "@/components/field-types/DynamicFieldRenderer";
import { VariantNavigationHeader } from "@/components/products/VariantNavigationHeader";
import { generateVariantUrl, generateProductSlug } from "@/lib/product-utils";
import { PageLoader } from "@/components/ui/loading-spinner";
import { useMarketContext } from "@/components/market-context";
import { buildTenantPathForScope } from "@/lib/tenant-view-scope";

interface ProductDetailClientProps {
  tenantSlug: string;
  productId: string;
  selectedBrandSlug?: string | null;
}

/**
 * ProductDetailClient - Scalable product detail page with adaptive layouts
 *
 * ARCHITECTURE:
 * - System Sections: Non-deletable, predefined sections (Variants, Media Assets)
 * - User Field Groups: Deletable sections created by users via Field Groups settings
 * - Layout Types: 'form' (left-aligned, constrained width) vs 'full-width' (tables/galleries)
 * - Field-Aware Rendering: Automatically detects wide field types and adjusts layout
 */
export function ProductDetailClient({
  tenantSlug,
  productId,
  selectedBrandSlug: selectedBrandSlugProp,
}: ProductDetailClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedBrandSlug = useMemo(() => {
    const fromProp = (selectedBrandSlugProp || "").trim().toLowerCase();
    if (fromProp.length > 0) return fromProp;
    return (searchParams.get("brand") || "").trim().toLowerCase();
  }, [searchParams, selectedBrandSlugProp]);
  const selectedBrandQuery = useMemo(() => {
    if (!selectedBrandSlug) return "";
    const query = new URLSearchParams();
    query.set("brand", selectedBrandSlug);
    return query.toString();
  }, [selectedBrandSlug]);
  const isSharedBrandView =
    selectedBrandSlug.length > 0 && selectedBrandSlug !== tenantSlug.toLowerCase();
  const [activeSection, setActiveSection] = useState('variants');
  const [product, setProduct] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [fieldGroups, setFieldGroups] = useState<any[]>([]);
  const [loadingFieldGroups, setLoadingFieldGroups] = useState(false);
  const [fieldGroupsCache, setFieldGroupsCache] = useState<Map<string, any[]>>(new Map());
  const [fieldValues, setFieldValues] = useState<Record<string, any>>({});
  const [pendingFieldChanges, setPendingFieldChanges] = useState<Record<string, any>>({});
  const [linkedAssets, setLinkedAssets] = useState<any[]>([]);
  const [loadingLinkedAssets, setLoadingLinkedAssets] = useState(false);
  const [linkedAssetsError, setLinkedAssetsError] = useState<string | null>(null);
  const [isLinkAssetDialogOpen, setIsLinkAssetDialogOpen] = useState(false);
  const [availableAssets, setAvailableAssets] = useState<any[]>([]);
  const [availableAssetQuery, setAvailableAssetQuery] = useState("");
  const [selectedAssetIdsToLink, setSelectedAssetIdsToLink] = useState<Set<string>>(new Set());
  const [loadingAvailableAssets, setLoadingAvailableAssets] = useState(false);
  const [isMutatingLinks, setIsMutatingLinks] = useState(false);
  const [completeness, setCompleteness] = useState<{
    percent: number;
    requiredCount: number;
    completeCount: number;
    missingAttributes: Array<{ code: string; label: string }>;
    isComplete: boolean;
    familyId?: string | null;
  } | null>(null);
  const [completenessLoading, setCompletenessLoading] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const {
    selectedChannelId,
    selectedMarketId,
    selectedLocaleId,
    selectedChannel,
    selectedLocale
  } = useMarketContext();

  // Handle field value changes with auto-save
  const handleFieldChange = (fieldCode: string, value: any) => {
    if (isSharedBrandView) return;
    console.log(`ðŸ“ Field "${fieldCode}" changed to:`, value);
    console.log(`ðŸ“ Field type:`, typeof value);
    console.log(`ðŸ“ Current fieldValues:`, fieldValues);

    // Update local state immediately for responsive UI
    setFieldValues(prev => {
      const newValues = {
        ...prev,
        [fieldCode]: value
      };
      console.log(`ðŸ“ New fieldValues:`, newValues);
      return newValues;
    });

    // Track pending changes
    setPendingFieldChanges(prev => ({
      ...prev,
      [fieldCode]: value
    }));

    // Debounce save - wait 1 second after last change
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      await saveFieldValues({ [fieldCode]: value });
    }, 1000);
  };

  // Save field values to API
  const saveFieldValues = async (fieldsToSave: Record<string, any>) => {
    if (isSharedBrandView) return;
    if (!product?.id) {
      console.error('âŒ Cannot save: product.id is missing');
      return;
    }

    try {
      setSaving(true);
      console.log('ðŸ’¾ Saving field values:', fieldsToSave);
      console.log('ðŸ’¾ Product ID:', product.id);
      console.log('ðŸ’¾ Tenant slug:', tenantSlug);

      const query = new URLSearchParams();
      if (selectedMarketId) query.set('marketId', selectedMarketId);
      if (selectedLocale?.code) query.set('locale', selectedLocale.code);
      if (selectedChannel?.code) query.set('channel', selectedChannel.code);
      if (selectedBrandSlug) query.set('brand', selectedBrandSlug);
      const url = query.toString()
        ? `/api/${tenantSlug}/products/${product.id}?${query.toString()}`
        : `/api/${tenantSlug}/products/${product.id}`;

      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fieldsToSave)
      });

      const responseData = await response.json();
      console.log('ðŸ“¤ Server response:', responseData);

      if (!response.ok) {
        console.error('âŒ Server returned error:', responseData);
        if (responseData.details) {
          console.error('âŒ Validation details:', JSON.stringify(responseData.details, null, 2));
        }
        throw new Error(responseData.error || 'Failed to save field values');
      }

      console.log('âœ… Field values saved successfully');
      setPendingFieldChanges({});
      await fetchCompleteness();
    } catch (error) {
      console.error('âŒ Error saving field values:', error);
      // TODO: Implement proper toast notification system
      // toast({
      //   title: 'Error',
      //   description: 'Failed to save changes. Please try again.',
      //   variant: 'destructive'
      // });
    } finally {
      setSaving(false);
    }
  };

  const staticSections = [
    {
      id: 'variants',
      label: 'Variants',
      icon: Settings,
      completeness: product?.type === 'standalone' ? 0 : 100,
      isSystem: true,
      isFieldGroup: false,
      layoutType: 'full-width',
      isDeletable: false
    },
    {
      id: 'media',
      label: 'Media Assets',
      icon: ImageIcon,
      completeness: 10,
      isSystem: true,
      isFieldGroup: false,
      layoutType: 'full-width',
      isDeletable: false
    }
  ];


  // Define content layout types with field-aware detection
  const getContentLayout = (sectionId: string) => {
    const section = sections.find(s => s.id === sectionId);

    if (!section) return 'form';

    // System sections have predefined layouts
    if (section.isSystem && section.layoutType) {
      return section.layoutType;
    }

    // For field groups, check if they contain wide field types
    if (section.isFieldGroup && 'fieldGroup' in section && section.fieldGroup?.fields) {
      const hasWideFields = section.fieldGroup.fields.some((field: any) => {
        return ['table', 'gallery', 'asset_collection', 'data_grid'].includes(field.field_type);
      });

      if (hasWideFields) {
        return 'full-width';
      }
    }

    // Default to form layout for user-created field groups
    return section.layoutType || 'form';
  };

  // Check if a field group needs special rendering
  const needsWideLayout = (fieldGroup: any) => {
    if (!fieldGroup?.fields) return false;
    return fieldGroup.fields.some((field: any) =>
      ['table', 'gallery', 'asset_collection', 'data_grid', 'repeater', 'image', 'file'].includes(field.field_type)
    );
  };

  const isFieldValueFilled = (value: any) => {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object') return Object.keys(value).length > 0;
    return true;
  };

  // Handle product type conversion (standalone â†’ parent)
  const handleProductTypeChange = (newType: 'parent') => {
    if (product) {
      setProduct({ ...product, type: newType });
    }
  };

  const isFieldAllowed = useCallback((field: any) => {
    if (field?.is_channelable && Array.isArray(field.allowed_channel_ids) && field.allowed_channel_ids.length > 0) {
      if (selectedChannelId && !field.allowed_channel_ids.includes(selectedChannelId)) {
        return false;
      }
    }
    if (field?.is_localizable && Array.isArray(field.allowed_market_ids) && field.allowed_market_ids.length > 0) {
      if (selectedMarketId && !field.allowed_market_ids.includes(selectedMarketId)) {
        return false;
      }
    }
    if (field?.is_localizable && Array.isArray(field.allowed_locale_ids) && field.allowed_locale_ids.length > 0) {
      if (selectedLocaleId && !field.allowed_locale_ids.includes(selectedLocaleId)) {
        return false;
      }
    }
    return true;
  }, [selectedChannelId, selectedMarketId, selectedLocaleId]);

  const filteredFieldGroups = useMemo(() => {
    return fieldGroups.map((group) => ({
      ...group,
      fields: Array.isArray(group.fields)
        ? group.fields.filter(isFieldAllowed)
        : group.fields
    }));
  }, [fieldGroups, isFieldAllowed]);

  const dynamicFieldGroupSections = filteredFieldGroups.map(group => ({
    id: `fieldgroup-${group.field_group.code}`,
    label: group.field_group.name,
    icon: Zap,
    completeness: 0,
    isFieldGroup: true,
    isSystem: false,
    layoutType: 'form', // Default, but can be overridden by field types
    isDeletable: true,
    fieldGroup: group
  }));

  const sections = [...dynamicFieldGroupSections, ...staticSections];
  const linkedAssetIdSet = useMemo(
    () => new Set(linkedAssets.map((link) => link?.asset_id || link?.dam_assets?.id).filter(Boolean)),
    [linkedAssets]
  );
  const filteredAvailableAssets = useMemo(() => {
    const query = availableAssetQuery.trim().toLowerCase();
    return availableAssets.filter((asset) => {
      if (linkedAssetIdSet.has(asset.id)) return false;
      if (!query) return true;
      const haystack = `${asset.originalFilename || asset.filename || ""} ${asset.fileType || ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [availableAssets, availableAssetQuery, linkedAssetIdSet]);

  const fetchLinkedAssets = useCallback(async () => {
    if (!tenantSlug || !product?.id) return;
    try {
      setLoadingLinkedAssets(true);
      setLinkedAssetsError(null);
      const query = new URLSearchParams();
      query.set("product_id", product.id);
      if (selectedBrandSlug) {
        query.set("brand", selectedBrandSlug);
      }
      const response = await fetch(`/api/${tenantSlug}/product-links?${query.toString()}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch linked assets (${response.status})`);
      }
      const payload = await response.json();
      setLinkedAssets((payload?.data || []) as any[]);
    } catch (error) {
      console.error("Failed to fetch linked assets:", error);
      setLinkedAssets([]);
      setLinkedAssetsError("Could not load linked assets.");
    } finally {
      setLoadingLinkedAssets(false);
    }
  }, [tenantSlug, product?.id, selectedBrandSlug]);

  useEffect(() => {
    if (activeSection !== "media") return;
    fetchLinkedAssets();
  }, [activeSection, fetchLinkedAssets]);

  const fetchAvailableAssets = async () => {
    if (!tenantSlug) return;
    try {
      setLoadingAvailableAssets(true);
      const query = new URLSearchParams();
      query.set("limit", "200");
      if (selectedBrandSlug) {
        query.set("brand", selectedBrandSlug);
      }
      const response = await fetch(`/api/${tenantSlug}/assets?${query.toString()}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch assets (${response.status})`);
      }
      const payload = await response.json();
      setAvailableAssets((payload?.data?.assets || []) as any[]);
    } catch (error) {
      console.error("Failed to fetch available assets:", error);
      setAvailableAssets([]);
    } finally {
      setLoadingAvailableAssets(false);
    }
  };

  const handleUnlinkAsset = async (linkId: string) => {
    if (isSharedBrandView) return;
    setIsMutatingLinks(true);
    try {
      const response = await fetch(
        `/api/${tenantSlug}/product-links/${linkId}${selectedBrandQuery ? `?${selectedBrandQuery}` : ""}`,
        {
        method: "DELETE",
        }
      );
      if (!response.ok) {
        throw new Error(`Failed to unlink asset (${response.status})`);
      }
      await fetchLinkedAssets();
    } catch (error) {
      console.error("Failed to unlink asset:", error);
    } finally {
      setIsMutatingLinks(false);
    }
  };

  const handleRelinkAsset = async (link: any) => {
    if (isSharedBrandView) return;
    if (!product?.id) return;
    const assetId = link?.asset_id || link?.dam_assets?.id;
    if (!assetId) return;

    setIsMutatingLinks(true);
    try {
      await fetch(
        `/api/${tenantSlug}/product-links/${link.id}${selectedBrandQuery ? `?${selectedBrandQuery}` : ""}`,
        {
        method: "DELETE",
        }
      );
      await fetch(`/api/${tenantSlug}/product-links${selectedBrandQuery ? `?${selectedBrandQuery}` : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: product.id,
          asset_id: assetId,
          link_context: "product_detail_relink",
          link_type: "manual",
          confidence: 1,
          match_reason: "Relinked from product detail",
        }),
      });
      await fetchLinkedAssets();
    } catch (error) {
      console.error("Failed to relink asset:", error);
    } finally {
      setIsMutatingLinks(false);
    }
  };

  const handleToggleAssetToLink = (assetId: string) => {
    setSelectedAssetIdsToLink((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });
  };

  const handleLinkSelectedAssets = async () => {
    if (isSharedBrandView) return;
    if (!product?.id || selectedAssetIdsToLink.size === 0) return;
    setIsMutatingLinks(true);
    try {
      for (const assetId of selectedAssetIdsToLink) {
        await fetch(`/api/${tenantSlug}/product-links${selectedBrandQuery ? `?${selectedBrandQuery}` : ""}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            product_id: product.id,
            asset_id: assetId,
            link_context: "product_detail",
            link_type: "manual",
            confidence: 1,
            match_reason: "Linked from product detail",
          }),
        });
      }
      setIsLinkAssetDialogOpen(false);
      setSelectedAssetIdsToLink(new Set());
      await fetchLinkedAssets();
    } catch (error) {
      console.error("Failed to link selected assets:", error);
    } finally {
      setIsMutatingLinks(false);
    }
  };

  // Market context handles selection persistence and filtering

  const fetchFieldGroups = useCallback(async (familyId: string) => {
    try {
      // Check cache first
      if (fieldGroupsCache.has(familyId)) {
        console.log('âš¡ Using cached field groups for family:', familyId);
        setFieldGroups(fieldGroupsCache.get(familyId) || []);
        setLoadingFieldGroups(false);
        return;
      }

      setLoadingFieldGroups(true);
      console.log('ðŸ” Fetching field groups for family:', familyId);
      const startTime = Date.now();

      const response = await fetch(`/api/${tenantSlug}/product-families/${familyId}/field-groups`, {
        cache: 'no-store'
      });

      if (response.ok) {
        const groupsData = await response.json();
        console.log('ðŸ“¥ Field groups response received in:', Date.now() - startTime, 'ms');
        console.log('ðŸ“Š Field groups data:', groupsData);

        // Transform the data - extract fields from nested structure
        const processedGroups = groupsData.map((item: any) => {
          // Extract fields from the nested product_field_group_assignments structure
          const allFields = (item.field_groups?.product_field_group_assignments || [])
            .map((assignment: any) => assignment.product_fields)
            .filter(Boolean)
            .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0));

          // Filter out hidden fields
          const visibleFields = allFields.filter((field: any) =>
            !item.hidden_fields?.includes(field.id)
          );

          return {
            id: item.id,
            field_group_id: item.field_group_id,
            field_group: item.field_groups,
            hidden_fields: item.hidden_fields || [],
            sort_order: item.sort_order,
            fields: visibleFields
          };
        });

        console.log('âœ… Field groups processed:', processedGroups.length, 'groups');
        console.log('ðŸ” First field from first group:', processedGroups[0]?.fields?.[0]);

        // Cache the results
        setFieldGroupsCache(prev => new Map(prev.set(familyId, processedGroups)));
        setFieldGroups(processedGroups);
      } else {
        const errorData = await response.json();
        console.error('âŒ Field groups API error:', response.status, errorData);
      }
    } catch (err) {
      console.error('âŒ Error fetching field groups:', err);
    } finally {
      setLoadingFieldGroups(false);
      console.log('ðŸ Field groups loading completed');
    }
  }, [fieldGroupsCache, tenantSlug]);

  const fetchCompleteness = useCallback(async () => {
    if (!product?.id) return;

    try {
      setCompletenessLoading(true);
      const query = new URLSearchParams();
      if (selectedMarketId) query.set('marketId', selectedMarketId);
      if (selectedLocale?.code) query.set('locale', selectedLocale.code);
      if (selectedChannel?.code) query.set('channel', selectedChannel.code);
      if (selectedBrandSlug) query.set('brand', selectedBrandSlug);
      const url = query.toString()
        ? `/api/${tenantSlug}/products/${productId}/completeness?${query.toString()}`
        : `/api/${tenantSlug}/products/${productId}/completeness`;
      const response = await fetch(
        url,
        { cache: 'no-store' }
      );
      const data = await response.json();

      if (!response.ok) {
        console.warn('Completeness API error:', response.status, data);
        return;
      }

      setCompleteness(data.data);
    } catch (err) {
      console.error('Error fetching completeness:', err);
    } finally {
      setCompletenessLoading(false);
    }
  }, [product?.id, tenantSlug, productId, selectedMarketId, selectedLocale?.code, selectedChannel?.code, selectedBrandSlug]);

  // Load product data from API
  useEffect(() => {
    const fetchProduct = async () => {
      try {
        setLoading(true);
        console.log('ðŸ” Fetching product:', productId);
        console.log('ðŸ” GET Request URL:', `/api/${tenantSlug}/products/${productId}`);

        const query = new URLSearchParams();
        if (selectedMarketId) query.set('marketId', selectedMarketId);
        if (selectedLocale?.code) query.set('locale', selectedLocale.code);
        if (selectedChannel?.code) query.set('channel', selectedChannel.code);
        if (selectedBrandSlug) query.set('brand', selectedBrandSlug);
        const url = query.toString()
          ? `/api/${tenantSlug}/products/${productId}?${query.toString()}`
          : `/api/${tenantSlug}/products/${productId}`;
        const response = await fetch(url);
        console.log('ðŸ“¥ GET Response status:', response.status);

        const data = await response.json();
        console.log('ðŸ“¥ GET Response data:', data);

        if (!response.ok) {
          throw new Error(data.error || 'Failed to fetch product');
        }

        if (data.success && data.data) {
          // Transform API data to component state format
          const productData = {
            id: data.data.id,
            productName: data.data.product_name,
            scin: data.data.scin,
            sku: data.data.sku,
            upc: data.data.barcode ?? data.data.upc,
            brand: data.data.brand_line || '',
            category: data.data.product_families?.name || '',
            shortDescription: data.data.short_description || '',
            longDescription: data.data.long_description || '',
            status: data.data.status,
            type: data.data.type,
            parentId: data.data.parent_id,
            parentSku: data.data.parent_product?.sku || '',
            hasVariants: data.data.has_variants,
            variantCount: data.data.variant_count,
            variants: data.data.variants || [],
            msrp: data.data.msrp,
            costOfGoods: data.data.cost_of_goods,
            marginPercent: data.data.margin_percent,
            assetsCount: data.data.assets_count,
            contentScore: data.data.content_score,
            features: data.data.features || [],
            specifications: data.data.specifications || {},
            metaTitle: data.data.meta_title,
            metaDescription: data.data.meta_description,
            keywords: data.data.keywords || [],
            weightG: data.data.weight_g,
            dimensions: data.data.dimensions || {},
            createdAt: data.data.created_at,
            updatedAt: data.data.updated_at,
            family_id: data.data.family_id
          };

          setProduct(productData);

          // Initialize field values from product data
          // Custom fields are stored directly on the product object with their field codes
          const customFieldValues: Record<string, any> = {};
          Object.keys(data.data).forEach(key => {
            // Skip system fields
            const systemFields = ['id', 'organization_id', 'type', 'parent_id', 'product_name', 'scin', 'sku', 'barcode',
              'brand_line', 'family_id', 'status', 'launch_date', 'msrp', 'cost_of_goods', 'margin_percent',
              'assets_count', 'content_score', 'short_description', 'long_description', 'features',
              'specifications', 'meta_title', 'meta_description', 'keywords', 'weight_g', 'dimensions',
              'inheritance', 'is_inherited', 'marketplace_content', 'variant_axis', 'created_at',
              'updated_at', 'created_by', 'last_modified_by', 'has_variants', 'variant_count',
              'product_families', 'parent_product', 'variants'];

            if (!systemFields.includes(key) && data.data[key] !== null && data.data[key] !== undefined) {
              customFieldValues[key] = data.data[key];
            }
          });
          setFieldValues(customFieldValues);
          console.log('ðŸ“¦ Loaded custom field values:', customFieldValues);

          if (data.data.family_id) {
            console.log('ðŸ”— Product has family_id:', data.data.family_id);
            fetchFieldGroups(data.data.family_id);
          } else {
            console.log('â„¹ï¸ Product has no family_id - no field groups to load');
            setLoadingFieldGroups(false);
          }

          // ðŸ”„ REDIRECT LOGIC: If this is a variant accessed directly, redirect to proper hierarchy
          if (productData.type === 'variant') {
            const unscopedVariantUrl = generateVariantUrl(
              tenantSlug,
              productData.parentSku || productData.parentId,
              productData.sku || productData.id
            );
            const scopeRoot = buildTenantPathForScope({
              tenantSlug,
              scope: selectedBrandSlug || null,
            });
            const tenantPrefix = `/${tenantSlug}`;
            const correctUrl = unscopedVariantUrl.startsWith(tenantPrefix)
              ? `${scopeRoot}${unscopedVariantUrl.slice(tenantPrefix.length)}`
              : unscopedVariantUrl;
            const currentPath = buildTenantPathForScope({
              tenantSlug,
              scope: selectedBrandSlug || null,
              suffix: `/products/${productId}`,
            });

            console.log('ðŸ”„ Variant accessed directly. Redirecting to:', correctUrl);
            console.log('ðŸ”„ Current path:', currentPath);

            // Only redirect if we're not already on the correct URL
            if (currentPath !== correctUrl) {
              router.replace(correctUrl);
              return; // Stop execution to prevent rendering
            }
          }

          console.log('âœ… Product loaded:', productData.productName);
        } else {
          throw new Error('Invalid response format');
        }
      } catch (err) {
        console.error('âŒ Error fetching product:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    if (productId && tenantSlug) {
      fetchProduct();
    }
  }, [productId, tenantSlug, selectedMarketId, selectedLocale?.code, selectedChannel?.code, selectedBrandSlug, router, fetchFieldGroups]);

  useEffect(() => {
    if (product?.id) {
      fetchCompleteness();
    }
  }, [product?.id, fetchCompleteness]);
  // Show loading state
  if (loading) {
    return (
      <div className="h-full">
        <PageLoader text="Loading product..." size="lg" />
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Package className="w-8 h-8 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-medium text-foreground mb-2">Product not found</h3>
          <p className="text-muted-foreground mb-4">{error}</p>
          <Link
            href={buildTenantPathForScope({
              tenantSlug,
              scope: selectedBrandSlug || null,
              suffix: '/products',
            })}
          >
            <button className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90">
              Back to Products
            </button>
          </Link>
        </div>
      </div>
    );
  }

  // Show message if no product data
  if (!product) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Package className="w-8 h-8 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">No product data available</p>
        </div>
      </div>
    );
  }

  const completenessPercent =
    completeness?.percent ??
    (completeness?.requiredCount === 0 ? 100 : 0);

  const missingAttributeLabels = (completeness?.missingAttributes || []).map(
    (attr) => attr.label || attr.code
  );
  const missingPreview = missingAttributeLabels.slice(0, 6).join(', ');
  const missingSuffix =
    missingAttributeLabels.length > 6
      ? ` +${missingAttributeLabels.length - 6} more`
      : '';

  return (
    <div className="h-full">
      {isSharedBrandView ? (
        <div className="border-b border-border bg-muted/20 px-6 py-3 text-sm text-muted-foreground">
          Shared brand view is read-only. Editing and product creation are disabled.
        </div>
      ) : null}
      {/* Minimal header */}
      <div className="bg-background">
        <div className="px-6 py-4">
          <div className="flex items-start justify-between gap-6">
            <div className="space-y-2">
              {/* Variant Navigation Header with Cascading Dropdowns */}
              {product.type === 'parent' && product.family_id ? (
                <VariantNavigationHeader
                  tenantSlug={tenantSlug}
                  parentSku={product.sku || product.id}
                  parentName={product.productName}
                  currentVariantSku={undefined}
                  familyId={product.family_id}
                  selectedBrandSlug={selectedBrandSlug || null}
                />
              ) : product.type === 'variant' && product.parentSku && product.family_id ? (
                <VariantNavigationHeader
                  tenantSlug={tenantSlug}
                  parentSku={product.parentSku || product.parentId}
                  parentName={product.productName.split(' - ')[0]} // Extract parent name
                  currentVariantSku={product.sku}
                  familyId={product.family_id}
                  selectedBrandSlug={selectedBrandSlug || null}
                />
              ) : null}

              <div className="flex items-center gap-3">
                <h1 className="text-xl font-semibold text-foreground">
                  {product.productName}
                </h1>
                <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                  product.status === 'Active' ? 'bg-green-100 text-green-700' :
                  product.status === 'Draft' ? 'bg-yellow-100 text-yellow-700' :
                  product.status === 'Enrichment' ? 'bg-blue-100 text-blue-700' :
                  product.status === 'Review' ? 'bg-amber-100 text-amber-700' :
                  product.status === 'Archived' ? 'bg-slate-100 text-slate-700' :
                  'bg-red-100 text-red-700'
                }`}>
                  {product.status}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                <span>SCIN: {product.scin || product.id}</span>
                <span>SKU: {product.sku || '-'}</span>
                <span>Barcode: {product.upc || '-'}</span>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                <span>
                  Type: {product.type === 'parent' ? 'Parent product' : product.type === 'variant' ? 'Variant' : 'Single SKU'}
                </span>
                {product.type === 'parent' && (
                  <button
                    type="button"
                    onClick={() => setActiveSection('variants')}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Variants: {product.variantCount ?? 0}
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-col items-end gap-3">
              <div className="flex flex-wrap items-center gap-4 justify-end">
                <span className="text-xs text-muted-foreground">
                  {saving
                    ? 'Saving changes...'
                    : Object.keys(pendingFieldChanges).length > 0
                    ? 'Unsaved changes'
                    : 'All changes saved'}
                </span>
              </div>

              <div className="w-64 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-foreground">Completeness</span>
                  <span className="text-sm font-semibold text-foreground">
                    {completenessLoading ? '...' : `${completenessPercent}%`}
                  </span>
                </div>
                <div className="mt-2 h-1.5 w-full rounded-full bg-muted">
                  <div
                    className="h-1.5 rounded-full bg-primary transition-all"
                    style={{ width: `${completenessPercent}%` }}
                  />
                </div>
                <div className="mt-1 text-[11px]">
                  {!completeness ? (
                    'Loading attribute completeness...'
                  ) : completeness.requiredCount === 0 ? (
                    product.family_id
                      ? 'No required attributes for this family yet.'
                      : 'Assign a product family to track completeness.'
                  ) : completeness.missingAttributes.length === 0 ? (
                    `${completeness.completeCount}/${completeness.requiredCount} required complete.`
                  ) : (
                    `Missing: ${missingPreview}${missingSuffix}`
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex h-full">
        {/* Minimal sidebar navigation */}
        <div className="w-64 bg-background border-r border-border/60 h-full overflow-y-auto">
          <div className="p-4">
            <h2 className="text-sm font-medium text-foreground mb-3">Sections</h2>
            <nav className="space-y-0.5">
              {/* System sections first */}
              {sections.filter(section => section.isSystem).map((section) => (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-left rounded-md transition-colors text-sm ${
                    activeSection === section.id
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-normal">{section.label}</span>
                  </div>
                </button>
              ))}

              {/* Separator if both system and user sections exist */}
              {sections.some(s => s.isSystem) && sections.some(s => !s.isSystem) && (
                <div className="py-2">
                  <div className="border-t border-border"></div>
                </div>
              )}

              {/* User-created field group sections */}
              {sections.filter(section => !section.isSystem).map((section) => {
                return (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 text-left rounded-md transition-colors text-sm ${
                      activeSection === section.id
                        ? 'bg-muted text-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    }`}
                  >
                  <div className="flex items-center gap-2">
                    <span className="font-normal">{section.label}</span>
                  </div>
                </button>
              );
              })}
            </nav>
          </div>
        </div>

        {/* Main content area */}
        <div className="flex-1 h-full overflow-y-auto">
          <div className="p-6">
            <div className={`w-full ${getContentLayout(activeSection) === 'full-width' ? '' : 'max-w-5xl'}`}>
              <div className="mb-6">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {sections.find(s => s.id === activeSection)?.label || 'Variants'}
                </h2>
              </div>

              <div className="w-full">

                {activeSection === 'variants' && product && (
                  <div>
                    {isSharedBrandView ? (
                      <div className="rounded-lg border border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
                        Variant editing is disabled in shared brand view.
                      </div>
                    ) : (
                      <VariantManagement
                        productId={productId}
                        productSku={product.sku || product.id}
                        tenantSlug={tenantSlug}
                        productType={product.type}
                        productName={product.productName}
                        productFamilyId={product.family_id}
                        onProductTypeChange={handleProductTypeChange}
                      />
                    )}
                  </div>
                )}


                {activeSection.startsWith('fieldgroup-') && (() => {
                  const section = sections.find(s => s.id === activeSection);
                  if (!section || !section.isFieldGroup || !('fieldGroup' in section)) return null;

                  const fieldGroup = section.fieldGroup;
                  const requiredFields = fieldGroup.fields.filter((f: any) => f.is_required);
                  const completedRequired = requiredFields.filter((f: any) =>
                    isFieldValueFilled(fieldValues[f.code])
                  ).length;
                  const missingRequired = requiredFields.length - completedRequired;

                  return (
                    <div className="space-y-5">
                      {fieldGroup.field_group.description && (
                        <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
                          <p className="text-sm text-muted-foreground">
                            {fieldGroup.field_group.description}
                          </p>
                        </div>
                      )}

                      {fieldGroup.fields && fieldGroup.fields.length > 0 ? (
                        <div className="space-y-4">
                          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-4 py-3">
                            <div>
                              <p className="text-sm font-medium text-foreground">Attributes in this section</p>
                              <p className="text-xs text-muted-foreground">
                                {fieldGroup.field_group.name}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{fieldGroup.fields.length} total</span>
                              <span>|</span>
                              <span>{requiredFields.length} required</span>
                              <span>|</span>
                              <span className={missingRequired > 0 ? 'text-amber-700' : 'text-emerald-700'}>
                                {missingRequired > 0 ? `${missingRequired} missing` : 'All required complete'}
                              </span>
                            </div>
                          </div>

                          <div className="rounded-lg border border-border/60 bg-background">
                            {fieldGroup.fields.map((field: any) => {
                              const isWideField = ['table', 'gallery', 'asset_collection', 'data_grid'].includes(
                                field.field_type
                              );
                              return (
                                <div
                                  key={field.id}
                                  className="border-b border-border/50 p-4 last:border-b-0"
                                >
                                  <div className="grid gap-4 md:grid-cols-[minmax(220px,280px),1fr] md:items-start">
                                    <div className="space-y-2">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-sm font-medium text-foreground">
                                          {field.name}
                                        </span>
                                        {field.is_required && (
                                          <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
                                            Required
                                          </span>
                                        )}
                                        {isFieldValueFilled(fieldValues[field.code]) && (
                                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                                            Complete
                                          </span>
                                        )}
                                      </div>
                                      {field.description && (
                                        <p className="text-xs text-muted-foreground">
                                          {field.description}
                                        </p>
                                      )}
                                    </div>

                                    <div className="lg:pt-0.5">
                                      {field.field_type === 'table' ? (
                                        <div
                                          className={
                                            field.options?.table_definition?.meta?.uses_panel_instances
                                              ? 'bg-transparent'
                                              : 'rounded-lg border border-border/60 bg-muted/30 p-4'
                                          }
                                        >
                                          <DynamicFieldRenderer
                                            field={field}
                                            value={fieldValues[field.code]}
                                            onChange={handleFieldChange}
                                            tenantSlug={tenantSlug}
                                            className={
                                              field.options?.table_definition?.meta?.uses_panel_instances
                                                ? 'bg-transparent'
                                                : 'bg-background rounded-lg border border-border/60 p-4'
                                            }
                                          />
                                        </div>
                                      ) : isWideField ? (
                                        <div className="border-2 border-dashed border-border/70 rounded-lg p-8 text-center text-sm text-muted-foreground">
                                          {field.field_type === 'gallery' && 'Image gallery will be rendered here'}
                                          {field.field_type === 'asset_collection' && 'Asset collection will be rendered here'}
                                          {field.field_type === 'data_grid' && 'Data grid will be rendered here'}
                                        </div>
                                      ) : (
                                        <DynamicFieldRenderer
                                          field={field}
                                          value={fieldValues[field.code]}
                                          onChange={handleFieldChange}
                                          tenantSlug={tenantSlug}
                                        />
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <p className="text-muted-foreground">No attributes configured for this group.</p>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {activeSection === 'media' && (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-medium text-foreground">Linked Assets</h3>
                      {!isSharedBrandView ? (
                        <div className="flex items-center gap-2">
                          <Button
                            variant="accent-blue"
                            size="sm"
                            onClick={async () => {
                              setIsLinkAssetDialogOpen(true);
                              await fetchAvailableAssets();
                            }}
                          >
                            Link assets
                          </Button>
                          <Link
                            href={buildTenantPathForScope({
                              tenantSlug,
                              scope: selectedBrandSlug || null,
                              suffix: `/assets?product=${encodeURIComponent(product?.id || "")}`,
                            })}
                            className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
                          >
                            Open in Assets
                            <ExternalLink className="ml-2 h-4 w-4" />
                          </Link>
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground">
                          Asset linking is disabled in shared brand view.
                        </div>
                      )}
                    </div>

                    {loadingLinkedAssets && (
                      <div className="text-sm text-muted-foreground py-6">Loading linked assets...</div>
                    )}

                    {linkedAssetsError && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        {linkedAssetsError}
                      </div>
                    )}

                    {!loadingLinkedAssets && !linkedAssetsError && linkedAssets.length === 0 && (
                      <div className="text-center py-12">
                        <div className="text-muted-foreground mb-4">
                          <div className="w-12 h-12 mx-auto bg-muted rounded-md flex items-center justify-center">
                            <ImageIcon className="w-6 h-6" />
                          </div>
                        </div>
                        <h3 className="text-lg font-medium text-foreground mb-2">No linked assets yet</h3>
                        <p className="text-muted-foreground">Upload assets and link them to this product.</p>
                      </div>
                    )}

                    {!loadingLinkedAssets && !linkedAssetsError && linkedAssets.length > 0 && (
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {linkedAssets.map((link) => (
                          <div key={link.id} className="rounded-lg border border-border bg-card p-4">
                            <div className="text-sm font-medium text-foreground truncate">
                              {link.dam_assets?.filename || "Asset"}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {link.dam_assets?.file_type || "unknown"} | {link.link_context || "linked"}
                            </div>
                            <div className="mt-2 flex items-center gap-2">
                              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                                {link.link_type || "manual"}
                              </span>
                              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                                {(Number(link.confidence || 0) * 100).toFixed(0)}%
                              </span>
                            </div>
                            <div className="mt-3 flex items-center gap-2">
                              {!isSharedBrandView ? (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={isMutatingLinks}
                                    onClick={() => handleRelinkAsset(link)}
                                  >
                                    Relink
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="text-destructive"
                                    disabled={isMutatingLinks}
                                    onClick={() => handleUnlinkAsset(link.id)}
                                  >
                                    Unlink
                                  </Button>
                                </>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <Dialog open={isLinkAssetDialogOpen} onOpenChange={setIsLinkAssetDialogOpen}>
                      <DialogContent className="max-w-3xl">
                        <DialogHeader>
                          <DialogTitle>Link Assets to Product</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-3">
                          <Input
                            value={availableAssetQuery}
                            onChange={(event) => setAvailableAssetQuery(event.target.value)}
                            placeholder="Search assets by filename"
                          />
                          <div className="max-h-[420px] overflow-y-auto rounded-lg border border-border">
                            {loadingAvailableAssets ? (
                              <div className="px-4 py-6 text-sm text-muted-foreground">Loading assets...</div>
                            ) : filteredAvailableAssets.length === 0 ? (
                              <div className="px-4 py-6 text-sm text-muted-foreground">No available assets found.</div>
                            ) : (
                              filteredAvailableAssets.map((asset) => (
                                <label key={asset.id} className="flex items-center gap-3 border-b border-border/50 px-4 py-3 text-sm last:border-b-0">
                                  <input
                                    type="checkbox"
                                    checked={selectedAssetIdsToLink.has(asset.id)}
                                    onChange={() => handleToggleAssetToLink(asset.id)}
                                    className="h-4 w-4 rounded border-border"
                                  />
                                  <div className="min-w-0">
                                    <div className="truncate font-medium text-foreground">
                                      {asset.originalFilename || asset.filename || "Asset"}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      {asset.fileType || "unknown"}
                                    </div>
                                  </div>
                                </label>
                              ))
                            )}
                          </div>
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setIsLinkAssetDialogOpen(false)}>
                            Cancel
                          </Button>
                          <Button
                            disabled={selectedAssetIdsToLink.size === 0 || isMutatingLinks}
                            onClick={handleLinkSelectedAssets}
                          >
                            {isMutatingLinks ? "Linking..." : `Link ${selectedAssetIdsToLink.size} asset${selectedAssetIdsToLink.size === 1 ? "" : "s"}`}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                )}

                {!['variants', 'media'].includes(activeSection) && !activeSection.startsWith('fieldgroup-') && (
                  <div className="text-center py-12">
                    <div className="text-muted-foreground mb-4">
                      <div className="w-12 h-12 mx-auto bg-muted rounded-md flex items-center justify-center">
                        <FileText className="w-6 h-6" />
                      </div>
                    </div>
                    <h3 className="text-lg font-medium text-foreground mb-2">
                      {sections.find(s => s.id === activeSection)?.label}
                    </h3>
                    <p className="text-muted-foreground">Content for this section will be implemented soon.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}



