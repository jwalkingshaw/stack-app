"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import {
  buildCanonicalProductIdentifier,
  generateVariantUrl,
  parseProductIdentifier,
} from "@/lib/product-utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { buildTenantPathForScope } from "@/lib/tenant-view-scope";
import { useMarketContext } from "@/components/market-context";
import { fetchJsonWithDedupe } from "@/lib/client-request-cache";

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
  parentIdentifier: string;
  parentName: string;
  currentVariantIdentifier?: string;
  familyId: string;
  selectedBrandSlug?: string | null;
}

export function VariantNavigationHeader({
  tenantSlug,
  parentIdentifier,
  parentName,
  currentVariantIdentifier,
  familyId,
  selectedBrandSlug
}: VariantNavigationHeaderProps) {
  const router = useRouter();
  const {
    channels,
    locales,
    markets,
    selectedChannel,
    selectedLocale,
    selectedMarketId,
    selectedDestination,
    availableDestinations,
    isLoading: marketContextLoading,
  } = useMarketContext();
  const [variantAttributes, setVariantAttributes] = useState<VariantAttribute[]>([]);
  const [allVariants, setAllVariants] = useState<Variant[]>([]);
  const [selectedValues, setSelectedValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const normalizedSelectedBrand = (selectedBrandSlug || "").trim().toLowerCase();
  const isScopeReady = useMemo(() => {
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
  const buildScopeQuery = () => {
    const query = new URLSearchParams();
    if (selectedMarketId) query.set("marketId", selectedMarketId);
    if (selectedLocale?.code) query.set("locale", selectedLocale.code);
    if (selectedChannel?.code) query.set("channel", selectedChannel.code);
    if (selectedDestination?.code) query.set("destination", selectedDestination.code);
    if (normalizedSelectedBrand) query.set("brand", normalizedSelectedBrand);
    return query.toString();
  };
  const buildParentHref = () =>
    buildTenantPathForScope({
      tenantSlug,
      scope: normalizedSelectedBrand || null,
      suffix: `/products/${buildCanonicalProductIdentifier(parentIdentifier, parentName)}`,
    });

  const loadVariantData = useCallback(async () => {
    try {
      setLoading(true);
      const scopeQuery = buildScopeQuery();
      const scopedSuffix = scopeQuery ? `?${scopeQuery}` : "";

      // Fetch variant attributes configuration
      const attrsUrl = `/api/${tenantSlug}/product-families/${familyId}/variant-attributes${scopedSuffix}`;
      const attrsResult = await fetchJsonWithDedupe<{ data?: VariantAttribute[] }>(attrsUrl, {
        ttlMs: 5000,
      });
      if (attrsResult.ok) {
        setVariantAttributes(attrsResult.data?.data || []);
      }

      // Fetch all variants for this parent
      const variantsUrl = `/api/${tenantSlug}/products/${parentIdentifier}/variants${scopedSuffix}`;
      const variantsResult = await fetchJsonWithDedupe<{ data?: Variant[] }>(variantsUrl, {
        ttlMs: 3000,
      });
      if (variantsResult.ok) {
        setAllVariants(variantsResult.data?.data || []);

        // If we have a current variant identifier, find it and extract its attribute values
        if (currentVariantIdentifier) {
          const parsedCurrentIdentifier = parseProductIdentifier(currentVariantIdentifier);
          const normalizedCurrentIdentifier = (
            parsedCurrentIdentifier.uuid || currentVariantIdentifier
          )
            .trim()
            .toLowerCase();
          const currentVariant = variantsResult.data?.data?.find(
            (v: Variant) =>
              (v.id || "").toLowerCase() === normalizedCurrentIdentifier ||
              (v.sku || "").toLowerCase() === normalizedCurrentIdentifier
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
  }, [
    tenantSlug,
    familyId,
    parentIdentifier,
    currentVariantIdentifier,
    normalizedSelectedBrand,
    selectedMarketId,
    selectedLocale?.code,
    selectedChannel?.code,
    selectedDestination?.code,
  ]);

  useEffect(() => {
    if (!isScopeReady) return;
    loadVariantData();
  }, [isScopeReady, loadVariantData]);

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
          parentIdentifier,
          matchingVariant.id || matchingVariant.sku || "",
          {
            parentLabel: parentName || parentIdentifier,
            variantLabel: matchingVariant.product_name || matchingVariant.sku || null,
          }
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
        <Link href={buildParentHref()}>
          <span className="inline-block max-w-[280px] truncate text-sm text-foreground hover:underline">
            {parentName}
          </span>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Link href={buildParentHref()}>
        <span className="inline-block max-w-[280px] truncate text-sm text-foreground hover:underline">
          {parentName}
        </span>
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
              <SelectTrigger className="h-8 min-w-[160px] max-w-[280px] px-2 text-sm">
                <SelectValue className="truncate" placeholder={attr.field_name} />
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
