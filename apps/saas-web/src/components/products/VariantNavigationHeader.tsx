"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown } from "lucide-react";
import Link from "next/link";
import { generateVariantUrl } from "@/lib/product-utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { buildTenantPathForScope } from "@/lib/tenant-view-scope";

interface VariantAttribute {
  field_code: string;
  field_name: string;
  sort_order: number;
}

interface Variant {
  id: string;
  sku: string | null;
  product_name: string;
  variant_attributes: Record<string, any>;
}

interface VariantNavigationHeaderProps {
  tenantSlug: string;
  parentSku: string;
  parentName: string;
  currentVariantSku?: string;
  familyId: string;
  selectedBrandSlug?: string | null;
}

export function VariantNavigationHeader({
  tenantSlug,
  parentSku,
  parentName,
  currentVariantSku,
  familyId,
  selectedBrandSlug
}: VariantNavigationHeaderProps) {
  const router = useRouter();
  const [variantAttributes, setVariantAttributes] = useState<VariantAttribute[]>([]);
  const [allVariants, setAllVariants] = useState<Variant[]>([]);
  const [selectedValues, setSelectedValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const normalizedSelectedBrand = (selectedBrandSlug || "").trim().toLowerCase();
  const buildScopeQuery = () => {
    if (!normalizedSelectedBrand) return "";
    const query = new URLSearchParams();
    query.set("brand", normalizedSelectedBrand);
    return query.toString();
  };
  const buildProductsHref = () =>
    buildTenantPathForScope({
      tenantSlug,
      scope: normalizedSelectedBrand || null,
      suffix: "/products",
    });
  const buildParentHref = () =>
    buildTenantPathForScope({
      tenantSlug,
      scope: normalizedSelectedBrand || null,
      suffix: `/products/${parentSku}`,
    });

  const loadVariantData = useCallback(async () => {
    try {
      setLoading(true);
      const scopeQuery = buildScopeQuery();
      const scopedSuffix = scopeQuery ? `?${scopeQuery}` : "";

      // Fetch variant attributes configuration
      const attrsResponse = await fetch(`/api/${tenantSlug}/product-families/${familyId}/variant-attributes${scopedSuffix}`);
      if (attrsResponse.ok) {
        const attrsData = await attrsResponse.json();
        setVariantAttributes(attrsData.data || []);
      }

      // Fetch all variants for this parent
      const variantsResponse = await fetch(`/api/${tenantSlug}/products/${parentSku}/variants${scopedSuffix}`);
      if (variantsResponse.ok) {
        const variantsData = await variantsResponse.json();
        setAllVariants(variantsData.data || []);

        // If we have a current variant SKU, find it and extract its attribute values
        if (currentVariantSku) {
          const currentVariant = variantsData.data?.find(
            (v: Variant) => v.sku === currentVariantSku || v.id === currentVariantSku
          );
          if (currentVariant) {
            setSelectedValues(currentVariant.variant_attributes || {});
          }
        }
      }
    } catch (error) {
      console.error('Error loading variant navigation data:', error);
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, familyId, parentSku, currentVariantSku, normalizedSelectedBrand]);

  useEffect(() => {
    loadVariantData();
  }, [loadVariantData]);

  // Get available values for a specific attribute based on previous selections
  const getAvailableValues = (attributeCode: string, attributeIndex: number): string[] => {
    // Get all attributes before this one
    const previousAttributes = variantAttributes.slice(0, attributeIndex);

    // Filter variants based on previous selections
    let filteredVariants = allVariants;
    for (const prevAttr of previousAttributes) {
      const selectedValue = selectedValues[prevAttr.field_code];
      if (selectedValue) {
        filteredVariants = filteredVariants.filter(
          v => v.variant_attributes?.[prevAttr.field_code] === selectedValue
        );
      }
    }

    // Get unique values for current attribute from filtered variants
    const values = new Set<string>();
    filteredVariants.forEach(variant => {
      const value = variant.variant_attributes?.[attributeCode];
      if (value) {
        values.add(value);
      }
    });

    return Array.from(values).sort();
  };

  const handleAttributeChange = (attributeCode: string, value: string, attributeIndex: number) => {
    // Update selected values
    const newSelectedValues = { ...selectedValues };

    // Clear this and all subsequent selections
    const attributesToClear = variantAttributes.slice(attributeIndex);
    attributesToClear.forEach(attr => {
      delete newSelectedValues[attr.field_code];
    });

    // Set the new value
    newSelectedValues[attributeCode] = value;
    setSelectedValues(newSelectedValues);

    // Check if we have all attributes selected
    const allSelected = variantAttributes.every(attr => newSelectedValues[attr.field_code]);

    if (allSelected) {
      // Find the matching variant
      const matchingVariant = allVariants.find(variant => {
        return variantAttributes.every(attr =>
          variant.variant_attributes?.[attr.field_code] === newSelectedValues[attr.field_code]
        );
      });

      if (matchingVariant) {
        // Navigate to the variant
        const variantUrl = generateVariantUrl(
          tenantSlug,
          parentSku,
          matchingVariant.sku || matchingVariant.id
        );
        if (variantUrl) {
          const scopeRoot = buildTenantPathForScope({
            tenantSlug,
            scope: normalizedSelectedBrand || null,
          });
          const tenantPrefix = `/${tenantSlug}`;
          const scopedVariantUrl = variantUrl.startsWith(tenantPrefix)
            ? `${scopeRoot}${variantUrl.slice(tenantPrefix.length)}`
            : variantUrl;
          router.push(scopedVariantUrl);
        }
      }
    }
  };

  if (loading || variantAttributes.length === 0) {
    return (
      <div className="flex items-center gap-2">
        <Link href={buildProductsHref()}>
          <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
        </Link>
        <ChevronDown className="w-3 h-3 text-muted-foreground rotate-[-90deg]" />
        <Link href={buildParentHref()}>
          <span className="text-sm text-foreground hover:underline">{parentName}</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Link href={buildProductsHref()}>
        <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>
      </Link>
      <ChevronDown className="w-3 h-3 text-muted-foreground rotate-[-90deg]" />
      <Link href={buildParentHref()}>
        <span className="text-sm text-foreground hover:underline">{parentName}</span>
      </Link>

      {/* Cascading Variant Attribute Dropdowns */}
      {variantAttributes.map((attr, index) => {
        const availableValues = getAvailableValues(attr.field_code, index);
        const selectedValue = selectedValues[attr.field_code];

        // Don't show dropdown if there are no available values
        if (availableValues.length === 0) return null;

        // Check if previous attribute is selected (for cascading)
        const previousAttr = variantAttributes[index - 1];
        const isPreviousSelected = index === 0 || selectedValues[previousAttr?.field_code];

        return (
          <div key={attr.field_code} className="flex items-center gap-2">
            <ChevronDown className="w-3 h-3 text-muted-foreground rotate-[-90deg]" />
            <Select
              value={selectedValue || ""}
              onValueChange={(value) => handleAttributeChange(attr.field_code, value, index)}
              disabled={!isPreviousSelected}
            >
              <SelectTrigger className="h-8 px-2 text-sm">
                <SelectValue placeholder={attr.field_name} />
              </SelectTrigger>
              <SelectContent>
                {availableValues.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      })}
    </div>
  );
}
