"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Package, FileText, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { generateProductSlug } from "@/lib/product-utils";
import { VariantNavigationHeader } from "@/components/products/VariantNavigationHeader";
import { DynamicFieldRenderer } from "@/components/field-types/DynamicFieldRenderer";
import { PageLoader } from "@/components/ui/loading-spinner";
import { cn } from "@/lib/utils";
import { useMarketContext } from "@/components/market-context";
import { useSearchParams } from "next/navigation";

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

export function VariantDetailClient({
  tenantSlug,
  productId,
  variantId,
  selectedBrandSlug: selectedBrandSlugProp,
}: VariantDetailClientProps) {
  const searchParams = useSearchParams();
  const selectedBrandSlug = (selectedBrandSlugProp || searchParams.get("brand") || "")
    .trim()
    .toLowerCase();
  const isSharedBrandView =
    selectedBrandSlug.length > 0 && selectedBrandSlug !== tenantSlug.toLowerCase();
  const { selectedChannel, selectedLocale, selectedMarketId } = useMarketContext();
  const [activeSection, setActiveSection] = useState('');
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

  const buildScopeQueryString = useCallback(() => {
    const query = new URLSearchParams();
    if (selectedMarketId) query.set('marketId', selectedMarketId);
    if (selectedLocale?.code) query.set('locale', selectedLocale.code);
    if (selectedChannel?.code) query.set('channel', selectedChannel.code);
    if (selectedBrandSlug) query.set('brand', selectedBrandSlug);
    return query.toString();
  }, [selectedMarketId, selectedLocale?.code, selectedChannel?.code, selectedBrandSlug]);

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

  // System sections
  const systemSections: SectionConfig[] = [
    { id: 'assets', label: 'Assets', icon: ImageIcon, isSystem: true, isFieldGroup: false }
  ];

  // Combine system sections with field group sections
  const sections: SectionConfig[] = [
    ...systemSections,
    ...fieldGroups.map(fg => ({
      id: `fieldgroup-${fg.field_group.id}`,
      label: fg.field_group.name,
      icon: FileText,
      isSystem: false,
      isFieldGroup: true,
      fieldGroup: fg
    }))
  ];

  // Set default active section to first field group when they load
  React.useEffect(() => {
    if (fieldGroups.length > 0 && !activeSection) {
      setActiveSection(`fieldgroup-${fieldGroups[0].field_group.id}`);
    }
  }, [fieldGroups, activeSection]);

  // Handle field value changes with auto-save
  const handleFieldChange = (fieldCode: string, value: any) => {
    if (isSharedBrandView) return;
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

    try {
      setSaving(true);
      console.log('ðŸ’¾ Saving field values:', fieldsToSave);

      const response = await fetch(buildProductUrl(variant.id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fieldsToSave)
      });

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.error || 'Failed to save changes');
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
    setOverrideModes(prev => ({
      ...prev,
      [fieldCode]: true
    }));
    setOverrideDrafts(prev => ({
      ...prev,
      [fieldCode]: parentValue ?? ''
    }));
  };

  const disableOverrideMode = async (fieldCode: string) => {
    setOverrideModes(prev => {
      const next = { ...prev };
      delete next[fieldCode];
      return next;
    });
    setOverrideDrafts(prev => {
      const next = { ...prev };
      delete next[fieldCode];
      return next;
    });
    await clearOverrideValue(fieldCode);
  };

  // Load variant data and field groups from API
  useEffect(() => {
    const fetchVariant = async () => {
      try {
        setLoading(true);
        console.log('ðŸ” Fetching variant:', variantId, 'of parent:', productId);

        const scopeQuery = buildScopeQueryString();
        const variantUrl = scopeQuery
          ? `/api/${tenantSlug}/products/${productId}/variants/${variantId}?${scopeQuery}`
          : `/api/${tenantSlug}/products/${productId}/variants/${variantId}`;
        const response = await fetch(variantUrl);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to fetch variant');
        }

        if (data.success && data.data) {
          const variantData = data.data;
          setVariant(variantData);

          // Fetch parent product data for inheritance (including field groups and values)
          const parentResponse = await fetch(buildProductUrl(productId));
          if (parentResponse.ok) {
            const parentData = await parentResponse.json();
            if (parentData.success && parentData.data) {
              setParentProduct(parentData.data);

              // Fetch parent's field groups (variant inherits parent's field groups)
              if (parentData.data.family_id) {
                console.log('ðŸ” Fetching field groups for family:', parentData.data.family_id);
                const fieldGroupsUrl = scopeQuery
                  ? `/api/${tenantSlug}/product-families/${parentData.data.family_id}/field-groups?${scopeQuery}`
                  : `/api/${tenantSlug}/product-families/${parentData.data.family_id}/field-groups`;
                const fieldGroupsResponse = await fetch(fieldGroupsUrl);
                if (fieldGroupsResponse.ok) {
                  const groupsData = await fieldGroupsResponse.json();
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
                  console.error('âŒ Field groups fetch failed:', fieldGroupsResponse.status);
                }
              } else {
                console.log('âš ï¸ No family_id on parent product');
              }

          const parentDetailsResponse = await fetch(buildProductUrl(parentData.data.id));
          if (parentDetailsResponse.ok) {
            const parentDetails = await parentDetailsResponse.json();
            if (parentDetails.success && parentDetails.data) {
              const parentValuesMap = extractCustomFieldValues(parentDetails.data);
              setParentProduct((prev: any) => ({
                ...prev,
                field_values_map: parentValuesMap
              }));
            }
          }
        }
      }

      const variantDetailsResponse = await fetch(buildProductUrl(variantData.id));
      if (variantDetailsResponse.ok) {
        const variantDetails = await variantDetailsResponse.json();
        if (variantDetails.success && variantDetails.data) {
          const valuesMap = extractCustomFieldValues(variantDetails.data);
          setFieldValues(valuesMap);
        }
      }

          console.log('âœ… Variant loaded:', variantData.product_name);
        } else {
          throw new Error('Invalid response format');
        }
      } catch (err) {
        console.error('âŒ Error fetching variant:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    if (variantId && productId && tenantSlug) {
      fetchVariant();
    }
  }, [variantId, productId, tenantSlug, buildProductUrl, buildScopeQueryString]);

  // Helper to get parent field value for inheritance display
  const getParentFieldValue = (fieldCode: string) => {
    if (!parentProduct) return null;

    // Use the parent's field values map
    return parentProduct.field_values_map?.[fieldCode] || null;
  };

  // Helper to check if field needs wide layout
  const needsWideLayout = (fieldGroup: any) => {
    if (!fieldGroup?.fields) return false;

    const wideFieldTypes = ['textarea', 'rich_text', 'table', 'image', 'file'];
    return fieldGroup.fields.some((field: any) => {
      const fieldType = field.product_field?.field_type ?? field.field_type;
      return wideFieldTypes.includes(fieldType);
    });
  };

  // Helper to determine content layout
  const getContentLayout = (sectionId: string) => {
    if (sectionId === 'assets') return 'full-width';

    const section = sections.find(s => s.id === sectionId);
    if (!section || !section.isFieldGroup || !('fieldGroup' in section)) return 'form';

    return needsWideLayout(section.fieldGroup) ? 'full-width' : 'form';
  };

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
    <div className="h-full">
      {isSharedBrandView ? (
        <div className="border-b border-border bg-muted/20 px-6 py-3 text-sm text-muted-foreground">
          Shared brand view is read-only. Editing is disabled.
        </div>
      ) : null}
      {/* Header with navigation */}
      <div className="bg-background border-b border-border">
        <div className="px-6 py-4">
          <div className="flex items-start justify-between gap-6">
            <div className="space-y-2">
              {/* Variant Navigation Header with cascading dropdowns */}
              {variant.family_id && (variant.parent_product?.sku || variant.parent_id) && (
                <VariantNavigationHeader
                  tenantSlug={tenantSlug}
                  parentSku={variant.parent_product?.sku || variant.parent_id}
                  parentName={variant.parent_product.product_name}
                  currentVariantSku={variant.sku || variant.id}
                  familyId={variant.family_id}
                  selectedBrandSlug={selectedBrandSlug || null}
                />
              )}

              <div className="flex items-center gap-3">
                <h1 className="text-xl font-semibold text-foreground">
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

              <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                <span>SCIN: {variant.scin || variant.id}</span>
                <span>SKU: {variant.sku || '-'}</span>
                <span>Barcode: {variant.barcode || '-'}</span>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <span className="text-xs text-muted-foreground">
                {saving
                  ? 'Saving changes...'
                  : Object.keys(pendingFieldChanges).length > 0
                  ? 'Unsaved changes'
                  : 'All changes saved'}
              </span>
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
                  {sections.find(s => s.id === activeSection)?.label || 'Variant Attributes'}
                </h2>
              </div>

              <div className="w-full">
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
                  const requiredFields = fieldGroup.fields.filter((f: any) => {
                    const productField = f.product_field || f;
                    return Boolean(productField?.is_required);
                  });
                  const completedRequired = requiredFields.filter((f: any) => {
                    const productField = f.product_field || f;
                    const fieldCode = productField?.code;
                    const hasOverride = fieldCode ? Object.prototype.hasOwnProperty.call(fieldValues, fieldCode) : false;
                    const parentValue = fieldCode ? getParentFieldValue(fieldCode) : null;
                    const displayValue = hasOverride ? fieldValues[fieldCode] : overrideDrafts[fieldCode] ?? parentValue;
                    return isFieldValueFilled(displayValue);
                  }).length;
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

                                const isVariantAxis = variant.variant_attributes &&
                                  Object.prototype.hasOwnProperty.call(variant.variant_attributes, fieldCode);

                                const hasOverride = Object.prototype.hasOwnProperty.call(fieldValues, fieldCode);
                                const parentValue = getParentFieldValue(fieldCode);
                                const overrideEnabled = hasOverride || overrideModes[fieldCode];
                                const displayValue = hasOverride
                                  ? fieldValues[fieldCode]
                                  : overrideDrafts[fieldCode] ?? parentValue;
                                const inherits = !overrideEnabled;

                                const isWideField = ['table', 'gallery', 'asset_collection', 'data_grid'].includes(
                                  productField.field_type
                                );
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
                                          {!isVariantAxis && (
                                            <span
                                              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                                inherits
                                                  ? 'bg-emerald-50 text-emerald-700'
                                                  : 'bg-amber-50 text-amber-700'
                                              }`}
                                            >
                                              {inherits ? 'Inherited' : 'Override'}
                                            </span>
                                          )}
                                          {isFieldValueFilled(displayValue) && (
                                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                                              Complete
                                            </span>
                                          )}
                                        </div>
                                        {!isVariantAxis && (
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
                                            {inherits ? (
                                              <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                                                {formatPreviewValue(parentValue)}
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

                {!['assets', ...sections.filter(s => s.isFieldGroup).map(s => s.id)].includes(activeSection) && (
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

