"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { generateProductUrl } from "@/lib/product-utils";
import { useMarketContext } from "@/components/market-context";
import { FullscreenFormModal } from "@/components/ui/modal-shells";

interface ProductFamily {
  id: string;
  name: string;
  description?: string | null;
}

interface ProductCreateErrorDetail {
  field?: string;
  message?: string;
}

interface ProductCreateResponse {
  data?: {
    id: string;
    product_name?: string | null;
    title?: string | null;
    sku?: string | null;
  };
  error?: string;
  details?: ProductCreateErrorDetail[] | unknown;
}

interface AddProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantSlug: string;
}

export function AddProductModal({ isOpen, onClose, tenantSlug }: AddProductModalProps) {
  const router = useRouter();
  const {
    selectedMarketId,
    selectedLocaleId,
    selectedLocale,
  } = useMarketContext();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    sku: '',
    product_name: '',
    family_id: '',
    status: 'Draft'
  });
  const [errors, setErrors] = useState<{[key: string]: string}>({});

  // Product models data from API
  const [families, setFamilies] = useState<ProductFamily[]>([]);
  const [familiesLoading, setFamiliesLoading] = useState(false);

  const buildScopedApiUrl = useCallback((basePath: string) => {
    const query = new URLSearchParams();
    if (selectedMarketId) query.set("marketId", selectedMarketId);
    if (selectedLocale?.code) query.set("locale", selectedLocale.code);

    return query.toString()
      ? `${basePath}?${query.toString()}`
      : basePath;
  }, [selectedMarketId, selectedLocale?.code]);

  // Fetch families when modal opens
  const fetchFamilies = useCallback(async () => {
    try {
      setFamiliesLoading(true);
      const response = await fetch(buildScopedApiUrl(`/api/${tenantSlug}/product-families`));
      const result = await response.json();

      if (response.ok) {
        setFamilies(result.data || []);
      }
    } catch {
      // Error fetching product models - continue with empty list
    } finally {
      setFamiliesLoading(false);
    }
  }, [tenantSlug, buildScopedApiUrl]);

  // Load families when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchFamilies();
    }
  }, [isOpen, fetchFamilies]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: ''
      }));
    }
  };

  const validateForm = () => {
    const newErrors: {[key: string]: string} = {};

    if (!formData.product_name.trim()) {
      newErrors.product_name = 'Product name is required';
    }

    if (!formData.family_id.trim()) {
      newErrors.family_id = 'Family is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(buildScopedApiUrl(`/api/${tenantSlug}/products`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          type: 'standalone', // Default to standalone product
        }),
      });

      let result: ProductCreateResponse;
      try {
        result = await response.json();
      } catch {
        setErrors({ general: 'Invalid server response' });
        return;
      }

      if (!response.ok) {
        let errorMessage = 'Failed to create product';

        if (result && result.error && typeof result.error === 'string') {
          errorMessage = result.error;
        }

        // Handle validation errors
        if (result && result.error === 'Validation failed' && result.details) {
          const validationErrors: {[key: string]: string} = {};

          if (Array.isArray(result.details)) {
            result.details.forEach((detail) => {
              if (detail.field && detail.message) {
                validationErrors[detail.field] = detail.message;
              }
            });
          }

          if (Object.keys(validationErrors).length > 0) {
            setErrors(validationErrors);
            return;
          }
        }

        if (errorMessage.includes('SKU already exists')) {
          setErrors({ sku: 'A product with this SKU already exists' });
        } else {
          setErrors({ general: errorMessage });
        }
        return;
      }
      
      // Close modal and redirect to product detail page using SKU-based URL
      if (!result.data) {
        setErrors({ general: 'Product was created but response payload was incomplete' });
        return;
      }
      onClose();
      const productUrl = generateProductUrl(
        tenantSlug,
        result.data.product_name || result.data.title || result.data.sku,
        result.data.id
      );
      router.push(productUrl);
      
    } catch {
      setErrors({ general: 'An unexpected error occurred' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      setFormData({ sku: '', product_name: '', family_id: '', status: 'Draft' });
      setErrors({});
      onClose();
    }
  };

  const isFormValid = formData.product_name.trim() && formData.family_id.trim();

  if (!isOpen) return null;

  return (
    <FullscreenFormModal
      open={isOpen}
      title="Add New Product"
      onOpenChange={(open) => !open && handleClose()}
      onBack={handleClose}
      headerContentClassName="max-w-2xl px-0 sm:px-0"
      primaryActionLabel="Create Product"
      onPrimaryAction={() => void handleSubmit()}
      primaryActionDisabled={!isFormValid}
      primaryActionLoading={isLoading}
      primaryActionLoadingLabel="Creating..."
      bodyClassName="mx-auto w-full max-w-2xl"
    >
      <p className="text-sm text-muted-foreground">
        Select a family to define the product&apos;s schema. You&apos;ll fill in attributes on the product page.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4" id="add-product-form">
          <div className="space-y-2">
            <label htmlFor="sku" className="block text-sm font-medium text-gray-700">
              SKU (optional)
            </label>
            <Input
              id="sku"
              value={formData.sku}
              onChange={(e) => handleInputChange('sku', e.target.value)}
              placeholder="Enter product SKU"
              disabled={isLoading}
              className={errors.sku ? 'border-red-500' : ''}
            />
            {errors.sku && (
              <p className="text-sm text-red-600">{errors.sku}</p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="product_name" className="block text-sm font-medium text-gray-700">
              Product Name *
            </label>
            <Input
              id="product_name"
              value={formData.product_name}
              onChange={(e) => handleInputChange('product_name', e.target.value)}
              placeholder="Enter product name"
              disabled={isLoading}
              className={errors.product_name ? 'border-red-500' : ''}
            />
            {errors.product_name && (
              <p className="text-sm text-red-600">{errors.product_name}</p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="family_id" className="block text-sm font-medium text-gray-700">
              Family *
            </label>
            <Select
              value={formData.family_id || ""}
              onValueChange={(value) => handleInputChange('family_id', value)}
              disabled={isLoading || familiesLoading || families.length === 0}
            >
              <SelectTrigger
                className={`h-10 ${errors.family_id ? 'border-red-500' : 'border-input'}`}
              >
                <SelectValue
                  placeholder={
                    familiesLoading
                      ? "Loading families..."
                      : families.length === 0
                      ? "No families available — create one in Settings"
                      : "Select a family..."
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {families.map((family) => (
                  <SelectItem key={family.id} value={family.id}>
                    {family.name}{family.description ? ` - ${family.description}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.family_id && (
              <p className="text-sm text-red-600">{errors.family_id}</p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="status" className="block text-sm font-medium text-gray-700">
              Status
            </label>
            <Select
              value={formData.status}
              onValueChange={(value) => handleInputChange('status', value)}
              disabled={isLoading}
            >
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Draft" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Draft">Draft</SelectItem>
                <SelectItem value="Enrichment">Enrichment</SelectItem>
                <SelectItem value="Review">Review</SelectItem>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Discontinued">Discontinued</SelectItem>
                <SelectItem value="Archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>


                  {/* Display all validation errors */}
                  {Object.entries(errors).length > 0 && (
                    <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded space-y-1">
                      {errors.general && (
                        <div className="font-medium">{errors.general}</div>
                      )}
                      {Object.entries(errors)
                        .filter(([key]) => key !== 'general' && !['sku', 'product_name', 'family_id'].includes(key))
                        .map(([field, message]) => (
                          <div key={field} className="text-xs">
                            <span className="font-medium capitalize">{field.replace('_', ' ')}:</span> {message}
                          </div>
                        ))
                      }
                    </div>
                  )}
                </form>
    </FullscreenFormModal>
  );
}
