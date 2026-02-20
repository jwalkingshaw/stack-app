"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Package, Settings } from "lucide-react";
import { InlineVariantTable } from "@/components/products/InlineVariantTable";

interface VariantAttribute {
  id: string;
  product_field_id: string;
  field_code: string;
  field_name: string;
  field_type: string;
  field_description?: string;
  sort_order: number;
  is_required: boolean;
  validation_rules?: any;
  options?: any;
}

interface ProductVariant {
  id: string;
  sku: string | null;
  product_name: string;
  variant_attributes: Record<string, string>;
  barcode?: string;
  primary_image_url?: string;
  status: string;
  created_at: string;
}

interface VariantManagementProps {
  productId: string;
  productSku: string | null;
  tenantSlug: string;
  productType: 'standalone' | 'parent' | 'variant';
  productName: string;
  productFamilyId?: string;
  onProductTypeChange: (newType: 'parent') => void;
}

export function VariantManagement({
  productId,
  productSku,
  tenantSlug,
  productType,
  productName,
  productFamilyId,
  onProductTypeChange
}: VariantManagementProps) {
  const [variantAttributes, setVariantAttributes] = useState<VariantAttribute[]>([]);
  const [existingVariants, setExistingVariants] = useState<ProductVariant[]>([]);

  const loadVariantAttributes = useCallback(async () => {
    if (!productFamilyId) return;

    try {
      const response = await fetch(`/api/${tenantSlug}/product-families/${productFamilyId}/variant-attributes`);
      if (response.ok) {
        const data = await response.json();
        setVariantAttributes(data.data || []);
      }
    } catch (error) {
      console.error('Error loading variant attributes:', error);
    }
  }, [productFamilyId, tenantSlug]);

  const loadExistingVariants = useCallback(async () => {
    try {
      const response = await fetch(`/api/${tenantSlug}/products/${productId}/variants`);
      if (response.ok) {
        const data = await response.json();
        setExistingVariants(data.data || []);
      }
    } catch (error) {
      console.error('Error loading existing variants:', error);
    }
  }, [productId, tenantSlug]);

  // Load variant attributes from family and existing variants in parallel
  useEffect(() => {
    const loadData = async () => {
      const promises = [];

      if (productFamilyId) {
        promises.push(loadVariantAttributes());
      }
      if (productType === 'parent') {
        promises.push(loadExistingVariants());
      }

      // Load in parallel
      await Promise.all(promises);
    };

    loadData();
  }, [productFamilyId, productType, loadVariantAttributes, loadExistingVariants]);

  // Get parent SKU for URL generation
  const getParentSku = async () => {
    try {
      const response = await fetch(`/api/${tenantSlug}/products/${productId}`);
      if (response.ok) {
        const data = await response.json();
        return data.data?.sku;
      }
    } catch (error) {
      console.error('Error getting parent SKU:', error);
    }
    return null;
  };

  if (productType === 'variant') {
    return (
      <div className="text-center py-8">
        <Settings className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium text-foreground mb-2">Variant Product</h3>
        <p className="text-muted-foreground">This is a variant of a parent product. Variant management is done at the parent level.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Inline Variant Table */}
      {productType === 'parent' || existingVariants.length > 0 ? (
        <InlineVariantTable
          productId={productId}
          productSku={productSku}
          productName={productName}
          tenantSlug={tenantSlug}
          variantAttributes={variantAttributes}
          existingVariants={existingVariants}
          onVariantCreated={loadExistingVariants}
          onProductTypeChange={onProductTypeChange}
          productType={productType}
        />
      ) : (
        <InlineVariantTable
          productId={productId}
          productSku={productSku}
          productName={productName}
          tenantSlug={tenantSlug}
          variantAttributes={variantAttributes}
          existingVariants={[]}
          onVariantCreated={loadExistingVariants}
          onProductTypeChange={onProductTypeChange}
          productType={productType}
          emptyStateOverride={{
            title: "No Variants Yet",
            description: "Add your first variant to convert this product to a parent.",
            icon: <Package className="w-8 h-8 text-muted-foreground" />
          }}
        />
      )}
    </div>
  );
}
