"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Package, FileText, ImageIcon, Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { buildCanonicalProductIdentifier, parseProductIdentifier } from "@/lib/product-utils";
import { VariantNavigationHeader } from "@/components/products/VariantNavigationHeader";
import { DynamicFieldRenderer } from "@/components/field-types/DynamicFieldRenderer";
import { PageLoader } from "@/components/ui/loading-spinner";
import { PageContentContainer } from "@/components/ui/page-content-container";
import { cn } from "@/lib/utils";
import { useMarketContext } from "@/components/market-context";
import { useRouter, useSearchParams } from "next/navigation";
import { buildTenantPathForScope } from "@/lib/tenant-view-scope";
import { fetchJsonWithDedupe } from "@/lib/client-request-cache";
import {
  createGlobalAuthoringScope,
  getAuthoringScopeSummary,
  normalizeAuthoringScope,
} from "@/components/scope/authoring-scope-picker";

interface VariantDetailClientProps {
  tenantSlug: string;
  productId: string;
  variantId: string;
  selectedBrandSlug?: string | null;
}

type SectionConfig = {
  id: string;
  label: string;
  icon: any;
  isSystem: boolean;
  isFieldGroup?: boolean;
  fieldGroup?: any;
};

async function parseJsonSafely(response: Response): Promise<any | null> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function VariantDetailClient({
  tenantSlug,
  productId,
  variantId,
  selectedBrandSlug: selectedBrandSlugProp,
}: VariantDetailClientProps) {
  const TABLE_HEAVY_FIELD_TYPES = ['table', 'gallery', 'asset_collection', 'data_grid'];
  const getResolvedField = (field: any) => field?.product_field || field;
  const isConstrainedPanelTable = (field: any) => {
    const resolved = getResolvedField(field);
    return (
      resolved?.field_type === 'table' &&
      resolved?.options?.table_definition?.meta?.uses_panel_instances === true
    );
  };
  const isLayoutWideField = (field: any) => {
    const resolved = getResolvedField(field);
    if (!resolved) return false;
    if (resolved.field_type !== 'table') {
      return TABLE_HEAVY_FIELD_TYPES.includes(resolved.field_type);
    }
    return !isConstrainedPanelTable(resolved);
  };

  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedBrandSlug = (selectedBrandSlugProp || searchParams.get("brand") || "")
    .trim()
    .toLowerCase();
  const isSharedBrandView =
    selectedBrandSlug.length > 0 && selectedBrandSlug !== tenantSlug.toLowerCase();
  const {
    channels,
    locales,
    markets,
    selectedChannelId,
    selectedLocaleId,
    selectedChannel,
    selectedLocale,
    selectedMarketId,
    selectedDestinationId,
    selectedMarket,
    selectedDestination,
    availableDestinations,
    isLoading: marketContextLoading,
  } = useMarketContext();
  const [activeSection, setActiveSection] = useState('overview');
  const [variant, setVariant] = useState<any>(null);
  const [parentProduct, setParentProduct] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [fieldGroups, setFieldGroups] = useState<any[]>([]);
  const [fieldValues, setFieldValues] = useState<Record<string, any>>({});
  const [pendingFieldChanges, setPendingFieldChanges] = useState<Record<string, any>>({});
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [overrideModes, setOverrideModes] = useState<Record<string, boolean>>({});
  const [overrideDrafts, setOverrideDrafts] = useState<Record<string, any>>({});
  const [localizationEligibilityLoading, setLocalizationEligibilityLoading] = useState(false);
  const [canUseTranslateProduct, setCanUseTranslateProduct] = useState(false);
  const [translateRestrictionMessage, setTranslateRestrictionMessage] = useState<string | null>(null);

  const resolveSystemFieldCode = (field: any): string =>
    String(field?.options?.system_key || field?.code || '')
      .trim()
      .toLowerCase();

  const isScinSystemField = (field: any): boolean =>
    resolveSystemFieldCode(field) === 'scin';

  const buildScopeQueryString = useCallback(() => {
    const query = new URLSearchParams();
    if (selectedMarketId) query.set('marketId', selectedMarketId);
    if (selectedLocale?.code) query.set('locale', selectedLocale.code);
    if (selectedChannel?.code) query.set('channel', selectedChannel.code);
    if (selectedDestination?.code) query.set('destination', selectedDestination.code);
    if (selectedBrandSlug) query.set('brand', selectedBrandSlug);
    return query.toString();
  }, [selectedMarketId, selectedLocale?.code, selectedChannel?.code, selectedDestination?.code, selectedBrandSlug]);

  const isScopeReady = React.useMemo(() => {
    if (marketContextLoading) return false;
    if (markets.length > 0 && !selectedMarketId) return false;
    if (channels.length > 0 && !selectedChannel?.code) return false;
    if (locales.length > 0 && !selectedLocale?.code) return false;
    if (availableDestinations.length > 0 && !selectedDestination?.code) return false;
    return true;
  }, [
    marketContextLoading,
    markets.length,
    selectedMarketId,
    channels.length,
    selectedChannel?.code,
    locales.length,
    selectedLocale?.code,
    availableDestinations.length,
    selectedDestination?.code,
  ]);

  const authoringScope = React.useMemo(() => {
    const rawScope =
      variant?.marketplace_content?.authoringScope ??
      variant?.marketplaceContent?.authoringScope ??
      null;
    return normalizeAuthoringScope(rawScope) || createGlobalAuthoringScope();
  }, [variant]);

  const parentVariantInheritanceConfig = React.useMemo(() => {
    const rawConfig =
      parentProduct?.marketplace_content?.variantInheritance ??
      parentProduct?.marketplaceContent?.variantInheritance ??
      {};

    return {
      inheritByDefault:
        typeof rawConfig?.inheritByDefault === "boolean"
          ? rawConfig.inheritByDefault
          : true,
      allowChildOverrides:
        typeof rawConfig?.allowChildOverrides === "boolean"
          ? rawConfig.allowChildOverrides
          : true,
    };
  }, [parentProduct]);

  const isCurrentViewInsideAuthoringScope = React.useMemo(() => {
    if (authoringScope.mode !== "scoped") return true;

    const matchesDimension = (selectedId: string | null, allowedIds: string[]) =>
      allowedIds.length === 0 || (selectedId ? allowedIds.includes(selectedId) : false);

    return (
      matchesDimension(selectedMarketId, authoringScope.marketIds) &&
      matchesDimension(selectedChannelId, authoringScope.channelIds) &&
      matchesDimension(selectedLocaleId, authoringScope.localeIds) &&
      matchesDimension(selectedDestinationId, authoringScope.destinationIds)
    );
  }, [
    authoringScope,
    selectedMarketId,
    selectedChannelId,
    selectedLocaleId,
    selectedDestinationId,
  ]);

  const buildProductUrl = useCallback((id: string) => {
    const scopeQuery = buildScopeQueryString();
    return scopeQuery
      ? `/api/${tenantSlug}/products/${id}?${scopeQuery}`
      : `/api/${tenantSlug}/products/${id}`;
  }, [tenantSlug, buildScopeQueryString]);

  const formatPreviewValue = (value: any) => {
    if (value === null || value === undefined || value === '') return 'â€”';
    if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : 'â€”';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  const valuesEqual = (a: any, b: any) => {
    if (a === b) return true;
    if (Array.isArray(a) || Array.isArray(b) || typeof a === 'object' || typeof b === 'object') {
      return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    }
    return false;
  };

  const isFieldValueFilled = (value: any) => {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object') return Object.keys(value).length > 0;
    return true;
  };

  const extractCustomFieldValues = (productData: any) => {
    const systemFields = [
      'id',
      'organization_id',
      'type',
      'parent_id',
      'product_name',
      'scin',
      'sku',
      'barcode',
      'brand_line',
      'family_id',
      'status',
      'launch_date',
      'msrp',
      'cost_of_goods',
      'margin_percent',
      'assets_count',
      'content_score',
      'short_description',
      'long_description',
      'features',
      'specifications',
      'meta_title',
      'meta_description',
      'keywords',
      'weight_g',
      'dimensions',
      'inheritance',
      'is_inherited',
      'marketplace_content',
      'variant_axis',
      'created_at',
      'updated_at',
      'created_by',
      'last_modified_by',
      'has_variants',
      'variant_count',
      'product_families',
      'parent_product',
      'variants',
      'siblings'
    ];

    const custom: Record<string, any> = {};
    Object.keys(productData || {}).forEach((key) => {
      if (!systemFields.includes(key) && productData[key] !== null && productData[key] !== undefined) {
        custom[key] = productData[key];
      }
    });
    return custom;
  };

  const systemSections: SectionConfig[] = [
    { id: 'overview', label: 'Overview', icon: Package, isSystem: true, isFieldGroup: false },
    { id: 'attributes-all', label: 'All Attributes', icon: FileText, isSystem: true, isFieldGroup: false },
    { id: 'attributes-required', label: 'Required', icon: FileText, isSystem: true, isFieldGroup: false },
    { id: 'attributes-missing', label: 'Missing', icon: FileText, isSystem: true, isFieldGroup: false },
    { id: 'assets', label: 'Assets', icon: ImageIcon, isSystem: true, isFieldGroup: false }
  ];

  const fieldGroupSections: SectionConfig[] = fieldGroups.map((fg) => ({
    id: `fieldgroup-${fg.field_group.id}`,
    label: fg.field_group.name,
    icon: FileText,
    isSystem: false,
    isFieldGroup: true,
    fieldGroup: fg
  }));

  const sections: SectionConfig[] = [...systemSections, ...fieldGroupSections];

  useEffect(() => {
    const validSections = new Set(sections.map((section) => section.id));
    if (!validSections.has(activeSection)) {
      setActiveSection('overview');
    }
  }, [activeSection, sections]);

  // Handle field value changes with auto-save
  const handleFieldChange = (fieldCode: string, value: any) => {
    if (isSharedBrandView) return;
    if (fieldCode === 'scin') return;
    console.log(`ðŸ“ Field "${fieldCode}" changed to:`, value);

    // Update local state immediately for responsive UI
    setFieldValues(prev => ({
      ...prev,
      [fieldCode]: value
    }));

    // Track pending changes
    setPendingFieldChanges(prev => ({
      ...prev,
      [fieldCode]: value
    }));

    if (fieldCode === 'title' || fieldCode === 'sku' || fieldCode === 'barcode') {
      setVariant((prev: any) => {
        if (!prev) return prev;
        if (fieldCode === 'title') {
          return { ...prev, product_name: value ?? '' };
        }
        if (fieldCode === 'sku') {
          return { ...prev, sku: value ?? '' };
        }
        return { ...prev, barcode: value ?? '' };
      });
    }

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
    if (!variant?.id) {
      console.error('âŒ Cannot save: variant.id is missing');
      return;
    }

    const normalizedFieldsToSave: Record<string, any> = {};
    Object.entries(fieldsToSave).forEach(([key, value]) => {
      const normalizedKey = key.trim().toLowerCase();
      if (normalizedKey === 'scin') {
        return;
      }
      if (normalizedKey === 'title') {
        normalizedFieldsToSave.product_name = value;
        return;
      }
      normalizedFieldsToSave[key] = value;
    });

    if (Object.keys(normalizedFieldsToSave).length === 0) {
      return;
    }

    try {
      setSaving(true);
      console.log('ðŸ’¾ Saving field values:', fieldsToSave);

      const response = await fetch(buildProductUrl(variant.id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(normalizedFieldsToSave)
      });

      const responseData = await parseJsonSafely(response);

      if (!response.ok) {
        throw new Error(responseData?.error || 'Failed to save changes');
      }

      // Clear pending changes for saved fields
      setPendingFieldChanges(prev => {
        const newPending = { ...prev };
        Object.keys(fieldsToSave).forEach(key => delete newPending[key]);
        return newPending;
      });

      console.log('âœ… Changes saved successfully');
    } catch (error: any) {
      console.error('âŒ Error saving field values:', error);
      toast.error(error.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const setOverrideValue = (fieldCode: string, value: any) => {
    if (fieldCode === 'scin') return;
    setFieldValues(prev => ({
      ...prev,
      [fieldCode]: value
    }));

    setPendingFieldChanges(prev => ({
      ...prev,
      [fieldCode]: value
    }));

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      await saveFieldValues({ [fieldCode]: value });
    }, 1000);
  };

  const clearOverrideValue = async (fieldCode: string) => {
    if (fieldCode === 'scin') return;
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    setFieldValues(prev => {
      const next = { ...prev };
      delete next[fieldCode];
      return next;
    });

    setPendingFieldChanges(prev => {
      const next = { ...prev };
      delete next[fieldCode];
      return next;
    });

    await saveFieldValues({ [fieldCode]: null });
  };

  const enableOverrideMode = (fieldCode: string, parentValue: any) => {
    if (fieldCode === 'scin') return;
    setOverrideModes(prev => ({
      ...prev,
      [fieldCode]: true
    }));
    setOverrideDrafts(prev => ({
      ...prev,
      [fieldCode]: parentValue ?? ''
    }));
  };

  const disableOverrideMode = async (
    fieldCode: string,
    options?: { persist?: boolean }
  ) => {
    if (fieldCode === 'scin') return;
    const hasOverrideValue = Object.prototype.hasOwnProperty.call(fieldValues, fieldCode);
    const shouldPersist = options?.persist ?? hasOverrideValue;
    setOverrideModes(prev => {
      const next = { ...prev, [fieldCode]: false };
      return next;
    });
    setOverrideDrafts(prev => {
      const next = { ...prev };
      delete next[fieldCode];
      return next;
    });
    if (shouldPersist) {
      await clearOverrideValue(fieldCode);
    }
  };

  const isAutoEditableByParentDefault = useCallback(
    (params: {
      fieldCode: string;
      hasOverride: boolean;
      isScinField: boolean;
      isVariantAxis: boolean;
    }) => {
      if (params.isScinField || params.isVariantAxis || params.hasOverride) return false;
      if (!parentVariantInheritanceConfig.allowChildOverrides) return false;
      if (parentVariantInheritanceConfig.inheritByDefault) return false;
      // If user explicitly selected inherit for this field, keep it inherited.
      if (overrideModes[params.fieldCode] === false) return false;
      return true;
    },
    [overrideModes, parentVariantInheritanceConfig.allowChildOverrides, parentVariantInheritanceConfig.inheritByDefault]
  );

  // Load variant data and field groups from API
  useEffect(() => {
    const fetchVariant = async () => {
      try {
        setLoading(true);
        console.log('ðŸ” Fetching variant:', variantId, 'of parent:', productId);

        // Dedicated variant endpoints are not available; resolve variants via product endpoint.
        const variantResult = await fetchJsonWithDedupe<any>(buildProductUrl(variantId), {
          ttlMs: 3000,
        });
        const variantPayload = variantResult.data;
        if (!variantResult.ok) {
          throw new Error(variantPayload?.error || 'Failed to fetch variant');
        }
        if (!variantPayload?.success || !variantPayload?.data) {
          throw new Error('Invalid variant response format');
        }

        const variantData = variantPayload.data;
        if (variantData.type !== 'variant') {
          throw new Error('Requested record is not a variant');
        }
        setVariant(variantData);

        const parentIdentifier = variantData.parent_id || productId;
        const parentResult = await fetchJsonWithDedupe<any>(buildProductUrl(parentIdentifier), {
          ttlMs: 3000,
        });
        const parentPayload = parentResult.data;
        const parentData =
          parentResult.ok && parentPayload?.success && parentPayload?.data
            ? parentPayload.data
            : null;

        const canonicalParentIdentifier = buildCanonicalProductIdentifier(
          parentIdentifier,
          parentData?.product_name || variantData?.parent_product?.product_name || null
        );
        const canonicalVariantIdentifier = buildCanonicalProductIdentifier(
          variantData.id,
          variantData.product_name || variantData.sku || null
        );
        const parsedParentIdentifier = parseProductIdentifier((productId || "").trim());
        const parsedVariantIdentifier = parseProductIdentifier((variantId || "").trim());
        const hasParentUuidWithSlug =
          Boolean(parsedParentIdentifier.uuid) &&
          (productId || "").trim().length > (parsedParentIdentifier.uuid?.length || 0);
        const hasVariantUuidWithSlug =
          Boolean(parsedVariantIdentifier.uuid) &&
          (variantId || "").trim().length > (parsedVariantIdentifier.uuid?.length || 0);
        const shouldCanonicalizeParent = !hasParentUuidWithSlug;
        const shouldCanonicalizeVariant = !hasVariantUuidWithSlug;
        if (
          (shouldCanonicalizeParent &&
            (productId || "").trim().toLowerCase() !==
              canonicalParentIdentifier.toLowerCase()) ||
          (shouldCanonicalizeVariant &&
            (variantId || "").trim().toLowerCase() !==
              canonicalVariantIdentifier.toLowerCase())
        ) {
          const canonicalPath = buildTenantPathForScope({
            tenantSlug,
            scope: selectedBrandSlug || null,
            suffix: `/products/${canonicalParentIdentifier}/variants/${canonicalVariantIdentifier}`,
          });
          router.replace(canonicalPath);
          return;
        }

        if (parentResult.ok && parentPayload?.success && parentPayload?.data) {
          setParentProduct(parentData);

          // Fetch parent's field groups (variant inherits parent's field groups)
          if (parentData.family_id) {
            const scopeQuery = buildScopeQueryString();
            console.log('ðŸ” Fetching field groups for family:', parentData.family_id);
            const fieldGroupsUrl = scopeQuery
              ? `/api/${tenantSlug}/product-families/${parentData.family_id}/field-groups?${scopeQuery}`
              : `/api/${tenantSlug}/product-families/${parentData.family_id}/field-groups`;
            const fieldGroupsResult = await fetchJsonWithDedupe<any[]>(fieldGroupsUrl, {
              ttlMs: 5000,
            });
            if (fieldGroupsResult.ok) {
              const groupsData = fieldGroupsResult.data || [];
              console.log('ðŸ“¦ Field groups response:', groupsData);

              // Transform the data - extract fields from nested structure (same as ProductDetailClient)
              const processedGroups = groupsData.map((item: any) => {
                const allFields = (item.field_groups?.product_field_group_assignments || [])
                  .map((assignment: any) => assignment.product_fields)
                  .filter(Boolean)
                  .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0));

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

              console.log('âœ… Setting field groups:', processedGroups);
              setFieldGroups(processedGroups);
            } else {
              console.error('âŒ Field groups fetch failed:', fieldGroupsResult.status);
            }
          } else {
            console.log('âš ï¸ No family_id on parent product');
          }

          const parentValuesMap = extractCustomFieldValues(parentData);
          parentValuesMap.title = parentData.product_name ?? '';
          parentValuesMap.sku = parentData.sku ?? '';
          parentValuesMap.barcode = parentData.barcode ?? parentData.upc ?? '';
          parentValuesMap.scin = parentData.scin ?? parentData.id ?? '';
          setParentProduct((prev: any) => ({
            ...prev,
            field_values_map: parentValuesMap
          }));
        }

        const valuesMap = extractCustomFieldValues(variantData);
        valuesMap.title = variantData.product_name ?? '';
        valuesMap.sku = variantData.sku ?? '';
        valuesMap.barcode = variantData.barcode ?? variantData.upc ?? '';
        valuesMap.scin = variantData.scin ?? variantData.id ?? '';
        setFieldValues(valuesMap);

        console.log('âœ… Variant loaded:', variantData.product_name);
      } catch (err) {
        console.error('âŒ Error fetching variant:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    if (variantId && productId && tenantSlug && isScopeReady) {
      fetchVariant();
    }
  }, [
    variantId,
    productId,
    tenantSlug,
    selectedBrandSlug,
    router,
    buildProductUrl,
    buildScopeQueryString,
    isScopeReady,
  ]);

  // Helper to get parent field value for inheritance display
  const getParentFieldValue = (fieldCode: string) => {
    if (!parentProduct) return null;

    // Use the parent's field values map
    if (parentProduct.field_values_map?.[fieldCode] !== undefined) {
      return parentProduct.field_values_map[fieldCode];
    }

    if (fieldCode === 'title') return parentProduct.product_name ?? null;
    if (fieldCode === 'sku') return parentProduct.sku ?? null;
    if (fieldCode === 'barcode') return parentProduct.barcode ?? parentProduct.upc ?? null;
    if (fieldCode === 'scin') return parentProduct.scin ?? parentProduct.id ?? null;
    return null;
  };

  const fieldGroupStats = React.useMemo(() => {
    return fieldGroups.map((group) => {
      const fields = Array.isArray(group.fields) ? group.fields : [];
      const requiredFields = fields.filter((field: any) => {
        const productField = field.product_field || field;
        return Boolean(productField?.is_required);
      });

      const completeRequired = requiredFields.filter((field: any) => {
        const productField = field.product_field || field;
        const fieldCode = productField?.code;
        if (!fieldCode) return false;

        if (isScinSystemField(productField)) {
          return isFieldValueFilled(variant?.scin || variant?.id);
        }

        const hasOverride = Object.prototype.hasOwnProperty.call(fieldValues, fieldCode);
        const parentValue = getParentFieldValue(fieldCode);
        const autoEditable = isAutoEditableByParentDefault({
          fieldCode,
          hasOverride,
          isScinField: false,
          isVariantAxis: false,
        });
        const overrideEnabled =
          hasOverride ||
          (parentVariantInheritanceConfig.allowChildOverrides &&
            (overrideModes[fieldCode] === true || autoEditable));
        const effectiveValue = overrideEnabled
          ? hasOverride
            ? fieldValues[fieldCode]
            : overrideDrafts[fieldCode] ?? parentValue
          : parentValue;
        return isFieldValueFilled(effectiveValue);
      }).length;

      return {
        group,
        sectionId: `fieldgroup-${group.field_group.id}`,
        totalFieldCount: fields.length,
        requiredFieldCount: requiredFields.length,
        missingRequiredCount: Math.max(requiredFields.length - completeRequired, 0),
      };
    });
  }, [
    fieldGroups,
    fieldValues,
    isAutoEditableByParentDefault,
    overrideDrafts,
    overrideModes,
    parentProduct,
    parentVariantInheritanceConfig.allowChildOverrides,
    variant,
  ]);

  const requiredFieldGroupStats = React.useMemo(
    () => fieldGroupStats.filter((stats) => stats.requiredFieldCount > 0),
    [fieldGroupStats]
  );
  const missingFieldGroupStats = React.useMemo(
    () => fieldGroupStats.filter((stats) => stats.missingRequiredCount > 0),
    [fieldGroupStats]
  );
  const attributeFilterSections = ['attributes-all', 'attributes-required', 'attributes-missing'];
  const scopePillClass =
    "inline-flex h-6 items-center rounded-full border border-border/60 bg-background px-2.5 text-xs text-muted-foreground";
  const scopeAuthoringPillClass =
    "inline-flex h-6 items-center rounded-full border border-indigo-200 bg-indigo-50 px-2.5 text-xs text-indigo-700";
  const scopeAlertPillClass =
    "inline-flex h-6 items-center rounded-full border border-rose-200 bg-rose-50 px-2.5 text-xs text-rose-700";
  const sidebarGroupLabelClass =
    'px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground';
  const sidebarNavButtonBaseClass =
    'w-full flex min-h-9 items-center justify-between rounded-md px-3 py-2 text-left text-sm font-normal leading-5 transition-colors';
  const getSidebarNavButtonStateClass = (isActive: boolean) =>
    isActive
      ? 'bg-muted text-foreground'
      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50';

  const isTableHeavyFieldGroup = (fieldGroup: any) => {
    const fields = Array.isArray(fieldGroup?.fields) ? fieldGroup.fields : [];
    if (fields.length === 0) return false;

    const wideFieldCount = fields.filter((field: any) => isLayoutWideField(field)).length;

    if (wideFieldCount === 0) return false;

    return (
      wideFieldCount >= 2 ||
      wideFieldCount === fields.length
    );
  };

  // Helper to determine content layout
  const getContentLayout = (sectionId: string) => {
    if (sectionId === 'assets') return 'full-width';

    const section = sections.find(s => s.id === sectionId);
    if (!section || !section.isFieldGroup || !('fieldGroup' in section)) return 'form';

    return isTableHeavyFieldGroup(section.fieldGroup) ? 'full-width' : 'form';
  };

  useEffect(() => {
    if (isSharedBrandView) {
      setCanUseTranslateProduct(false);
      setTranslateRestrictionMessage(null);
      return;
    }

    let isCancelled = false;
    const fetchLocalizationEligibility = async () => {
      try {
        setLocalizationEligibilityLoading(true);
        const response = await fetch(`/api/${tenantSlug}/localization/eligibility`);
        if (!response.ok) {
          if (!isCancelled) {
            setCanUseTranslateProduct(false);
            setTranslateRestrictionMessage('Translation is currently unavailable.');
          }
          return;
        }

        const payload = await parseJsonSafely(response);
        if (isCancelled) return;

        const canTranslate = Boolean(payload?.data?.canTranslateProduct);
        setCanUseTranslateProduct(canTranslate);
        setTranslateRestrictionMessage(
          canTranslate
            ? null
            : String(
                payload?.data?.restrictions?.translateProduct ||
                  'Translation is unavailable on this plan.'
              )
        );
      } catch (eligibilityError) {
        console.error('Failed to load localization eligibility:', eligibilityError);
        if (!isCancelled) {
          setCanUseTranslateProduct(false);
          setTranslateRestrictionMessage('Translation is currently unavailable.');
        }
      } finally {
        if (!isCancelled) {
          setLocalizationEligibilityLoading(false);
        }
      }
    };

    fetchLocalizationEligibility();
    return () => {
      isCancelled = true;
    };
  }, [isSharedBrandView, tenantSlug]);

  const handleTranslateThisVariant = useCallback(() => {
    if (!variant?.id || !canUseTranslateProduct) return;

    const basePath = buildTenantPathForScope({
      tenantSlug,
      scope: selectedBrandSlug || null,
      suffix: '/settings/localization',
    });
    const query = new URLSearchParams();
    query.set('productId', variant.id);
    query.set('mode', 'translate');
    router.push(`${basePath}?${query.toString()}`);
  }, [canUseTranslateProduct, router, selectedBrandSlug, tenantSlug, variant?.id]);

  // Show loading state
  if (loading) {
    return <PageLoader />;
  }

  // Show error state
  if (error || !variant) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Package className="w-8 h-8 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-medium text-foreground mb-2">
            {error ? 'Error loading variant' : 'Variant not found'}
          </h3>
          <p className="text-muted-foreground mb-4">{error || 'No variant data available'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100%-var(--app-header-height,44px))] min-h-0 overflow-hidden flex flex-col">
      {isSharedBrandView ? (
        <div className="border-b border-border bg-muted/20 px-6 py-3 text-sm text-muted-foreground">
          Shared brand view is read-only. Editing is disabled.
        </div>
      ) : null}
      {/* Header with navigation */}
      <div className="border-b border-border/60 bg-background">
        <div className="flex">
          <div className="w-72 shrink-0 border-r border-border/60 bg-background" aria-hidden="true" />
          <div className="min-w-0 flex-1 px-6 py-3">
            <PageContentContainer mode="form">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-1.5">
              {/* Variant Navigation Header with cascading dropdowns */}
              {variant.family_id && (variant.parent_id || parentProduct?.id || parentProduct?.sku) && (
                <VariantNavigationHeader
                  tenantSlug={tenantSlug}
                  parentIdentifier={variant.parent_id || parentProduct?.id || parentProduct?.sku || ""}
                  parentName={
                    parentProduct?.product_name ||
                    variant.parent_product?.product_name ||
                    "Parent product"
                  }
                  currentVariantIdentifier={variant.id || variant.sku}
                  familyId={variant.family_id}
                  selectedBrandSlug={selectedBrandSlug || null}
                />
              )}

              <div className="flex items-center gap-3">
                <h1 className="text-lg font-semibold text-foreground">
                  {variant.product_name || variant.sku || variant.id}
                </h1>
                <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                  variant.status === 'Active' ? 'bg-green-100 text-green-700' :
                  variant.status === 'Draft' ? 'bg-yellow-100 text-yellow-700' :
                  variant.status === 'Enrichment' ? 'bg-blue-100 text-blue-700' :
                  variant.status === 'Review' ? 'bg-amber-100 text-amber-700' :
                  variant.status === 'Archived' ? 'bg-slate-100 text-slate-700' :
                  'bg-red-100 text-red-700'
                }`}>
                  {variant.status}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                <span>SCIN: {variant.scin || variant.id}</span>
                <span>SKU: {variant.sku || '-'}</span>
                <span>Barcode: {variant.barcode || '-'}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className="text-muted-foreground">View scope:</span>
                <span className={scopePillClass}>
                  {selectedMarketId ? selectedMarket?.name || "Market" : "All markets"}
                </span>
                <span className={scopePillClass}>
                  {selectedChannelId ? selectedChannel?.name || "Channel" : "All channels"}
                </span>
                <span className={scopePillClass}>
                  {selectedLocaleId ? selectedLocale?.code || "Language" : "All languages"}
                </span>
                <span className={scopePillClass}>
                  {selectedDestination?.name || "All destinations"}
                </span>
                <span className={scopeAuthoringPillClass}>
                  Authoring: {getAuthoringScopeSummary(authoringScope)}
                </span>
                {!isCurrentViewInsideAuthoringScope ? (
                  <button
                    type="button"
                    className={scopeAlertPillClass}
                    onClick={() => setActiveSection('attributes-missing')}
                    title="Current viewing scope is outside this variant's authoring scope."
                  >
                    Missing in this scope
                  </button>
                ) : null}
              </div>
              </div>

                <div className="flex w-full items-center gap-2 lg:w-auto lg:justify-end">
                  {!isSharedBrandView ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleTranslateThisVariant}
                      disabled={localizationEligibilityLoading || !canUseTranslateProduct || !variant?.id}
                      title={!canUseTranslateProduct ? translateRestrictionMessage || 'Translation unavailable' : 'Translate this product'}
                    >
                      <Languages className="mr-1.5 h-3.5 w-3.5" />
                      Translate this product
                    </Button>
                  ) : null}
                  <span className={scopePillClass}>
                    {saving
                      ? 'Saving changes...'
                      : Object.keys(pendingFieldChanges).length > 0
                      ? 'Unsaved changes'
                      : 'All changes saved'}
                  </span>
                  {!parentVariantInheritanceConfig.allowChildOverrides ? (
                    <span
                      className={scopeAlertPillClass}
                      title="Parent product settings currently lock inherited fields in this variant."
                    >
                      Overrides locked by parent
                    </span>
                  ) : null}
                  {!isCurrentViewInsideAuthoringScope ? (
                    <span
                      className={scopeAlertPillClass}
                      title="Current view scope is outside variant authoring scope."
                    >
                      Out of authoring scope
                    </span>
                  ) : null}
                  {!isSharedBrandView && !canUseTranslateProduct && !localizationEligibilityLoading ? (
                    <span className={scopeAlertPillClass} title={translateRestrictionMessage || undefined}>
                      Translation locked on Starter
                    </span>
                  ) : null}
                </div>
              </div>
            </PageContentContainer>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Sidebar navigation */}
        <div className="w-72 bg-background border-r border-border/60 h-full overflow-y-auto">
          <div className="px-2 py-3">
            <nav className="space-y-4">
              <div>
                <p className={sidebarGroupLabelClass}>Sections</p>
                <div className="space-y-0.5">
                  <button
                    onClick={() => setActiveSection('overview')}
                    className={`${sidebarNavButtonBaseClass} ${getSidebarNavButtonStateClass(activeSection === 'overview')}`}
                  >
                    <span className="truncate">Overview</span>
                  </button>
                </div>
              </div>

              <div>
                <p className={sidebarGroupLabelClass}>
                  Attributes
                </p>

                <div className="space-y-0.5">
                  {fieldGroupSections.map((section) => (
                    <button
                      key={section.id}
                      onClick={() => setActiveSection(section.id)}
                      className={`${sidebarNavButtonBaseClass} ${getSidebarNavButtonStateClass(activeSection === section.id)}`}
                    >
                      <span className="truncate">{section.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-3 space-y-0.5 border-t border-border pt-3">
                <button
                  onClick={() => setActiveSection('assets')}
                  className={`${sidebarNavButtonBaseClass} ${getSidebarNavButtonStateClass(activeSection === 'assets')}`}
                >
                  <span className="truncate">Assets</span>
                </button>
              </div>
            </nav>
          </div>
        </div>

        {/* Main content area */}
        <div className="flex-1 h-full overflow-y-auto">
          <div className="p-6">
            <PageContentContainer
              mode={getContentLayout(activeSection) === 'full-width' ? 'fluid' : 'form'}
            >
              <div className="mb-6">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {sections.find(s => s.id === activeSection)?.label || 'Variant Attributes'}
                </h2>
              </div>

              <div className="w-full">
                {activeSection === 'overview' && (
                  <div className="mx-auto w-full max-w-4xl space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-lg border border-border/60 bg-card p-4">
                        <p className="text-xs text-muted-foreground">Attribute groups</p>
                        <p className="mt-1 text-xl font-semibold text-foreground">{fieldGroupStats.length}</p>
                      </div>
                      <div className="rounded-lg border border-border/60 bg-card p-4">
                        <p className="text-xs text-muted-foreground">Fields in scope</p>
                        <p className="mt-1 text-xl font-semibold text-foreground">
                          {fieldGroupStats.reduce((sum, group) => sum + group.totalFieldCount, 0)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-border/60 bg-card p-4">
                        <p className="text-xs text-muted-foreground">Required fields</p>
                        <p className="mt-1 text-xl font-semibold text-foreground">
                          {fieldGroupStats.reduce((sum, group) => sum + group.requiredFieldCount, 0)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-border/60 bg-card p-4">
                        <p className="text-xs text-muted-foreground">Missing required</p>
                        <p className="mt-1 text-xl font-semibold text-foreground">
                          {fieldGroupStats.reduce((sum, group) => sum + group.missingRequiredCount, 0)}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-lg border border-border/60 bg-card p-4">
                      <p className="text-sm font-medium text-foreground">Quick actions</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" onClick={() => setActiveSection('attributes-all')}>
                          Browse attributes
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setActiveSection('attributes-missing')}>
                          Fix missing required
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setActiveSection('assets')}>
                          Review assets
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {attributeFilterSections.includes(activeSection) && (() => {
                  const groupsToShow =
                    activeSection === 'attributes-required'
                      ? requiredFieldGroupStats
                      : activeSection === 'attributes-missing'
                      ? missingFieldGroupStats
                      : fieldGroupStats;

                  const description =
                    activeSection === 'attributes-required'
                      ? 'Attribute groups with required fields for this variant.'
                      : activeSection === 'attributes-missing'
                      ? 'Attribute groups missing one or more required values for this variant context.'
                      : 'All attribute groups inherited by this variant.';

                  return (
                    <div className="mx-auto w-full max-w-4xl space-y-4">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant={activeSection === 'attributes-all' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setActiveSection('attributes-all')}
                        >
                          All groups ({fieldGroupStats.length})
                        </Button>
                        <Button
                          variant={activeSection === 'attributes-required' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setActiveSection('attributes-required')}
                        >
                          Required ({requiredFieldGroupStats.length})
                        </Button>
                        <Button
                          variant={activeSection === 'attributes-missing' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setActiveSection('attributes-missing')}
                        >
                          Missing ({missingFieldGroupStats.length})
                        </Button>
                      </div>

                      <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
                        <p className="text-sm text-muted-foreground">{description}</p>
                      </div>

                      {groupsToShow.length === 0 ? (
                        <div className="rounded-lg border border-border/60 bg-card p-6 text-sm text-muted-foreground">
                          No matching attribute groups in this view.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {groupsToShow.map((stats) => (
                            <button
                              key={stats.sectionId}
                              type="button"
                              onClick={() => setActiveSection(stats.sectionId)}
                              className="w-full rounded-lg border border-border/60 bg-card p-4 text-left transition-colors hover:bg-muted/20"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm font-medium text-foreground">
                                  {stats.group.field_group.name}
                                </p>
                                <span className="text-xs text-muted-foreground">
                                  {stats.totalFieldCount} fields
                                </span>
                              </div>
                              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                                <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                                  {stats.requiredFieldCount} required
                                </span>
                                <span
                                  className={`rounded-full px-2 py-0.5 ${
                                    stats.missingRequiredCount > 0
                                      ? 'bg-amber-50 text-amber-700'
                                      : 'bg-emerald-50 text-emerald-700'
                                  }`}
                                >
                                  {stats.missingRequiredCount > 0
                                    ? `${stats.missingRequiredCount} missing`
                                    : 'Required complete'}
                                </span>
                              </div>
                              {stats.group.field_group.description ? (
                                <p className="mt-2 text-xs text-muted-foreground">
                                  {stats.group.field_group.description}
                                </p>
                              ) : null}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {activeSection === 'assets' && (
                  <div className="text-center py-12">
                    <div className="text-muted-foreground mb-4">
                      <div className="w-12 h-12 mx-auto bg-muted rounded-md flex items-center justify-center">
                        <ImageIcon className="w-6 h-6" />
                      </div>
                    </div>
                    <h3 className="text-lg font-medium text-foreground mb-2">Assets</h3>
                    <p className="text-muted-foreground">Asset management coming soon</p>
                  </div>
                )}

                {/* Field Group Sections with Parent Inheritance */}
                {activeSection.startsWith('fieldgroup-') && (() => {
                  const section = sections.find(s => s.id === activeSection);
                  if (!section || !section.isFieldGroup || !('fieldGroup' in section)) return null;

                  const fieldGroup = section.fieldGroup;
                  const isWideFieldGroup = isTableHeavyFieldGroup(fieldGroup);
                  const requiredFields = fieldGroup.fields.filter((f: any) => {
                    const productField = f.product_field || f;
                    return Boolean(productField?.is_required);
                  });
                  const completedRequired = requiredFields.filter((f: any) => {
                    const productField = f.product_field || f;
                    const fieldCode = productField?.code;
                    const isScinField = isScinSystemField(productField);
                    if (isScinField) {
                      return isFieldValueFilled(variant?.scin || variant?.id);
                    }
                    const isVariantAxis = !isScinField && variant.variant_attributes &&
                      Object.prototype.hasOwnProperty.call(variant.variant_attributes, fieldCode);
                    const hasOverride = fieldCode ? Object.prototype.hasOwnProperty.call(fieldValues, fieldCode) : false;
                    const parentValue = fieldCode ? getParentFieldValue(fieldCode) : null;
                    const autoEditable = fieldCode
                      ? isAutoEditableByParentDefault({
                          fieldCode,
                          hasOverride,
                          isScinField,
                          isVariantAxis,
                        })
                      : false;
                    const overrideEnabled = isScinField
                      ? true
                      : hasOverride ||
                        (parentVariantInheritanceConfig.allowChildOverrides &&
                          ((fieldCode ? overrideModes[fieldCode] === true : false) || autoEditable));
                    const displayValue = isScinField
                      ? (variant?.scin || variant?.id || null)
                      : overrideEnabled
                      ? hasOverride
                        ? fieldValues[fieldCode]
                        : (fieldCode ? overrideDrafts[fieldCode] : undefined) ?? parentValue
                      : parentValue;
                    return isFieldValueFilled(displayValue);
                  }).length;
                  const missingRequired = requiredFields.length - completedRequired;

                  return (
                    <div
                      className={
                        isWideFieldGroup
                          ? 'space-y-5'
                          : 'mx-auto w-full max-w-4xl space-y-5'
                      }
                    >
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
                              <p className="text-xs text-muted-foreground">
                                Parent default: {parentVariantInheritanceConfig.inheritByDefault ? 'Inherit' : 'Start editable'}
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
                            {fieldGroup.fields
                              .filter((field: any) => field && (field.product_field || field.code))
                              .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0))
                              .map((field: any) => {
                                const productField = field.product_field || field;
                                const fieldCode = productField.code;

                                if (!fieldCode) {
                                  console.warn('Field missing code:', field);
                                  return null;
                                }

                                const isScinField = isScinSystemField(productField);
                                const isVariantAxis = !isScinField && variant.variant_attributes &&
                                  Object.prototype.hasOwnProperty.call(variant.variant_attributes, fieldCode);

                                const hasOverride = isScinField
                                  ? true
                                  : Object.prototype.hasOwnProperty.call(fieldValues, fieldCode);
                                const parentValue = isScinField ? null : getParentFieldValue(fieldCode);
                                const autoEditable = isAutoEditableByParentDefault({
                                  fieldCode,
                                  hasOverride,
                                  isScinField,
                                  isVariantAxis,
                                });
                                const overrideEnabled = isScinField
                                  ? true
                                  : hasOverride ||
                                    (parentVariantInheritanceConfig.allowChildOverrides &&
                                      (overrideModes[fieldCode] === true || autoEditable));
                                const displayValue = isScinField
                                  ? (variant?.scin || variant?.id || null)
                                  : overrideEnabled
                                  ? hasOverride
                                    ? fieldValues[fieldCode]
                                    : overrideDrafts[fieldCode] ?? parentValue
                                  : parentValue;
                                const inherits = isScinField ? false : !overrideEnabled;
                                const isLockedByParent =
                                  !isScinField &&
                                  !isVariantAxis &&
                                  inherits &&
                                  !hasOverride &&
                                  !parentVariantInheritanceConfig.allowChildOverrides;

                                const isWideField = isLayoutWideField(productField);
                                const hasDescription = Boolean(productField.description);

                                return (
                                  <div
                                    key={field.id || fieldCode}
                                    className="border-b border-border/50 p-4 last:border-b-0"
                                  >
                                    <div className="grid gap-4 md:grid-cols-[minmax(220px,280px),1fr] md:items-start">
                                      <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-2">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span className="text-sm font-medium text-foreground">
                                            {productField.name}
                                          </span>
                                          {productField.is_required && (
                                            <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
                                              Required
                                            </span>
                                          )}
                                          {isVariantAxis && (
                                            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                                              Variant Axis
                                            </span>
                                          )}
                                          {isScinField && (
                                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                                              System
                                            </span>
                                          )}
                                          {!isVariantAxis && !isScinField && (
                                            <span
                                              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                                isLockedByParent
                                                  ? 'bg-slate-100 text-slate-700'
                                                  : inherits
                                                  ? 'bg-emerald-50 text-emerald-700'
                                                  : 'bg-amber-50 text-amber-700'
                                              }`}
                                            >
                                              {isLockedByParent ? 'Inherited (locked)' : inherits ? 'Inherited' : 'Override'}
                                            </span>
                                          )}
                                          {isFieldValueFilled(displayValue) && (
                                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                                              Complete
                                            </span>
                                          )}
                                        </div>
                                        {!isVariantAxis && !isScinField && parentVariantInheritanceConfig.allowChildOverrides && (
                                          <div className="flex items-center gap-2">
                                            {!inherits && (
                                              <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => disableOverrideMode(fieldCode)}
                                              >
                                                Reset to parent
                                              </Button>
                                            )}
                                            <Switch
                                              className="scale-90 origin-right"
                                              checked={inherits}
                                              onCheckedChange={(checked) => {
                                                if (checked) {
                                                  disableOverrideMode(fieldCode);
                                                } else {
                                                  enableOverrideMode(fieldCode, parentValue);
                                                }
                                              }}
                                            />
                                          </div>
                                        )}
                                      </div>

                                      {hasDescription && (
                                        <div>
                                          <p className="text-xs text-muted-foreground">
                                            {productField.description}
                                          </p>
                                        </div>
                                      )}

                                      <div className={cn("md:pt-0.5", !hasDescription && "md:col-span-2")}>
                                        {isVariantAxis ? (
                                          <>
                                            <div className="w-full rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-sm text-foreground">
                                              {formatPreviewValue(displayValue)}
                                            </div>
                                            <div className="mt-2 text-xs text-blue-600">
                                              Variant attributes are managed in the parent product.
                                            </div>
                                          </>
                                        ) : (
                                          <>
                                            {isScinField ? (
                                              <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm text-foreground">
                                                {variant?.scin || variant?.id || '—'}
                                              </div>
                                            ) : inherits ? (
                                              <div className="space-y-2">
                                                <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                                                  {formatPreviewValue(parentValue)}
                                                </div>
                                                {isLockedByParent ? (
                                                  <p className="text-xs text-muted-foreground">
                                                    Parent product has disabled child overrides for inherited fields.
                                                  </p>
                                                ) : null}
                                              </div>
                                            ) : productField.field_type === 'table' ? (
                                              <div
                                                className={
                                                  productField.options?.table_definition?.meta?.uses_panel_instances
                                                    ? 'bg-transparent'
                                                    : 'rounded-lg border border-border/60 bg-muted/30 p-4'
                                                }
                                              >
                                                <DynamicFieldRenderer
                                                  field={productField}
                                                  value={displayValue}
                                                  onChange={(value) => {
                                                    setOverrideDrafts(prev => ({
                                                      ...prev,
                                                      [fieldCode]: value
                                                    }));
                                                    if (valuesEqual(value, parentValue)) {
                                                      disableOverrideMode(fieldCode);
                                                    } else {
                                                      setOverrideValue(fieldCode, value);
                                                    }
                                                  }}
                                                  tenantSlug={tenantSlug}
                                                  disabled={isSharedBrandView}
                                                  className={
                                                    productField.options?.table_definition?.meta?.uses_panel_instances
                                                      ? 'bg-transparent'
                                                      : 'bg-background rounded-lg border border-border/60 p-4'
                                                  }
                                                />
                                              </div>
                                            ) : isWideField ? (
                                              <div className="border-2 border-dashed border-border/70 rounded-lg p-8 text-center text-sm text-muted-foreground">
                                                {productField.field_type === 'gallery' && 'Image gallery will be rendered here'}
                                                {productField.field_type === 'asset_collection' && 'Asset collection will be rendered here'}
                                                {productField.field_type === 'data_grid' && 'Data grid will be rendered here'}
                                              </div>
                                            ) : (
                                              <DynamicFieldRenderer
                                                field={productField}
                                                value={displayValue}
                                                onChange={(value) => {
                                                  setOverrideDrafts(prev => ({
                                                    ...prev,
                                                    [fieldCode]: value
                                                  }));
                                                  if (valuesEqual(value, parentValue)) {
                                                    disableOverrideMode(fieldCode);
                                                  } else {
                                                    setOverrideValue(fieldCode, value);
                                                  }
                                                }}
                                                tenantSlug={tenantSlug}
                                                disabled={isSharedBrandView}
                                              />
                                            )}
                                          </>
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
                          <p className="text-muted-foreground">No fields in this group</p>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {!['overview', 'attributes-all', 'attributes-required', 'attributes-missing', 'assets', ...sections.filter(s => s.isFieldGroup).map(s => s.id)].includes(activeSection) && (
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
            </PageContentContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

