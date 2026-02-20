"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ActionButton } from "@/components/ui/action-button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Package, X } from "lucide-react";
import { generateProductUrl } from "@/lib/product-utils";
import { useMarketContext } from "@/components/market-context";
import * as DialogPrimitive from "@radix-ui/react-dialog";

interface AddProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantSlug: string;
}

export function AddProductModal({ isOpen, onClose, tenantSlug }: AddProductModalProps) {
  const router = useRouter();
  const { selectedMarketId, selectedLocale, selectedChannel } = useMarketContext();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    sku: '',
    product_name: '',
    family_id: '',
    status: 'Draft'
  });
  const [errors, setErrors] = useState<{[key: string]: string}>({});

  // Product families data from API
  const [families, setFamilies] = useState([]);
  const [familiesLoading, setFamiliesLoading] = useState(false);

  const [selectedFamily, setSelectedFamily] = useState<any>(null);

  const buildScopedApiUrl = useCallback((basePath: string) => {
    const query = new URLSearchParams();
    if (selectedMarketId) query.set("marketId", selectedMarketId);
    if (selectedLocale?.code) query.set("locale", selectedLocale.code);
    if (selectedChannel?.code) query.set("channel", selectedChannel.code);

    return query.toString()
      ? `${basePath}?${query.toString()}`
      : basePath;
  }, [selectedMarketId, selectedLocale?.code, selectedChannel?.code]);

  // Fetch families when modal opens
  const fetchFamilies = useCallback(async () => {
    try {
      setFamiliesLoading(true);
      const response = await fetch(buildScopedApiUrl(`/api/${tenantSlug}/product-families`));
      const result = await response.json();

      if (response.ok) {
        setFamilies(result.data || []);
      }
    } catch (error) {
      // Error fetching families - continue with empty list
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

  // Handle family selection
  useEffect(() => {
    if (formData.family_id) {
      const family = (families as any[]).find(f => f.id === formData.family_id);
      setSelectedFamily(family);
    } else {
      setSelectedFamily(null);
    }
  }, [formData.family_id, families]);

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
      newErrors.family_id = 'Product family is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
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
          type: 'standalone' // Default to standalone product
        }),
      });

      let result;
      try {
        result = await response.json();
      } catch (parseError) {
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
            result.details.forEach((detail: any) => {
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
      onClose();
      const productUrl = generateProductUrl(tenantSlug, result.data.sku, result.data.id);
      router.push(productUrl);
      
    } catch (error) {
      setErrors({ general: 'An unexpected error occurred' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      setFormData({ sku: '', product_name: '', family_id: '', status: 'Draft' });
      setSelectedFamily(null);
      setErrors({});
      onClose();
    }
  };

  const isFormValid = formData.product_name.trim() && formData.family_id.trim();

  if (!isOpen) return null;

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-white" />
        <DialogPrimitive.Content className="fixed inset-0 z-50 bg-white">
          <div className="h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-border">
              <DialogPrimitive.Title className="text-lg font-semibold flex items-center gap-2">
                <Package className="w-5 h-5" />
                Add New Product
              </DialogPrimitive.Title>
              <button
                onClick={handleClose}
                disabled={isLoading}
                className="p-1.5 hover:bg-muted rounded-md transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-2xl mx-auto space-y-6">
                <p className="text-sm text-muted-foreground">
                  Select a product family to define the product template. You'll configure attributes on the product page.
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
              Product Family *
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
                      ? "No families available - Create one in Settings"
                      : "Select a product family..."
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {(families as any[]).map((family) => (
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
              </div>
            </div>

            {/* Fixed footer */}
            <div className="border-t border-border p-6">
              <div className="max-w-2xl mx-auto flex justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                  disabled={isLoading}
                >
                  Cancel
                </Button>
                <ActionButton
                  type="submit"
                  form="add-product-form"
                  loading={isLoading}
                  disabled={!isFormValid}
                  variant="accent-blue"
                  className="enabled:bg-[#CCDCFF] enabled:hover:bg-[#99BAFF]"
                >
                  {isLoading ? 'Creating' : 'Create Product'}
                </ActionButton>
              </div>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
