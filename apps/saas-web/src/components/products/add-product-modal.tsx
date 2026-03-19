"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ActionButton } from "@/components/ui/action-button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Globe2, Package, X } from "lucide-react";
import { generateProductUrl } from "@/lib/product-utils";
import { useMarketContext } from "@/components/market-context";
import {
  AuthoringScopePicker,
  AuthoringScopeValue,
  createGlobalAuthoringScope,
  getAuthoringScopeSummary,
  normalizeAuthoringScope,
} from "@/components/scope/authoring-scope-picker";
import * as DialogPrimitive from "@radix-ui/react-dialog";

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
    selectedMarket,
    selectedChannelId,
    selectedChannel,
    selectedLocaleId,
    selectedLocale,
    selectedDestinationId,
    selectedDestination,
  } = useMarketContext();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    sku: '',
    product_name: '',
    family_id: '',
    status: 'Draft'
  });
  const [errors, setErrors] = useState<{[key: string]: string}>({});
  const [showInitialScope, setShowInitialScope] = useState(false);
  const [initialScope, setInitialScope] = useState<AuthoringScopeValue>(createGlobalAuthoringScope());

  // Product models data from API
  const [families, setFamilies] = useState<ProductFamily[]>([]);
  const [familiesLoading, setFamiliesLoading] = useState(false);

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
      newErrors.family_id = 'Product model is required';
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
          type: 'standalone', // Default to standalone product
          initialScope: normalizeAuthoringScope(initialScope),
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
      setShowInitialScope(false);
      setInitialScope(createGlobalAuthoringScope());
      setErrors({});
      onClose();
    }
  };

  const isFormValid = formData.product_name.trim() && formData.family_id.trim();
  const isScopedInitialScope = initialScope.mode === "scoped";
  const hasScopedDimensions =
    initialScope.marketIds.length > 0 ||
    initialScope.channelIds.length > 0 ||
    initialScope.localeIds.length > 0 ||
    initialScope.destinationIds.length > 0;
  const currentContextSummary = `${selectedMarket?.name || "Market"} / ${
    selectedChannel?.name || "Channel"
  } / ${selectedLocale?.code || "Language"} / ${
    selectedDestination?.name || "All destinations"
  }`;

  const applyGlobalInitialScope = () => {
    setInitialScope(createGlobalAuthoringScope());
    setShowInitialScope(false);
  };

  const applyCurrentContextInitialScope = () => {
    setInitialScope(
      normalizeAuthoringScope({
        mode: "scoped",
        marketIds: selectedMarketId ? [selectedMarketId] : [],
        channelIds: selectedChannelId ? [selectedChannelId] : [],
        localeIds: selectedLocaleId ? [selectedLocaleId] : [],
        destinationIds: selectedDestinationId ? [selectedDestinationId] : [],
      })
    );
    setShowInitialScope(false);
  };

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
                  Select a product model to define the product template. You&apos;ll configure attributes on the product page.
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
              Product Model *
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
                      ? "Loading product models..."
                      : families.length === 0
                      ? "No product models available - Create one in Settings"
                      : "Select a product model..."
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

          <div className="rounded-xl border border-border bg-white p-4 shadow-soft space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-foreground">Initial Authoring Scope</p>
                  <Badge variant={isScopedInitialScope ? "info" : "neutral"}>
                    {isScopedInitialScope ? "Scoped" : "Global"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">(optional)</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Viewing context is not written automatically unless you apply it here.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setShowInitialScope((prev) => !prev)}
              >
                {showInitialScope ? "Hide options" : "Edit scope"}
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={!isScopedInitialScope ? "default" : "outline"}
                className="h-8"
                onClick={applyGlobalInitialScope}
              >
                <Globe2 className="mr-1.5 h-3.5 w-3.5" />
                Use global
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8"
                onClick={applyCurrentContextInitialScope}
              >
                Use current context
              </Button>
              <Button
                type="button"
                size="sm"
                variant={showInitialScope ? "default" : "outline"}
                className="h-8"
                onClick={() => setShowInitialScope((prev) => !prev)}
              >
                Custom
              </Button>
            </div>

            <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-xs">
              <p className="font-medium text-foreground">Current: {getAuthoringScopeSummary(initialScope)}</p>
              <p className="mt-1 text-muted-foreground">View context: {currentContextSummary}</p>
              {isScopedInitialScope && !hasScopedDimensions ? (
                <p className="mt-1 text-amber-700">
                  Select at least one scope dimension or switch back to global.
                </p>
              ) : null}
            </div>

            {showInitialScope ? (
              <div className="rounded-lg border border-border/70 bg-background p-3">
                <AuthoringScopePicker
                  showHeader={false}
                  value={initialScope}
                  onChange={(next) => setInitialScope(normalizeAuthoringScope(next))}
                />
              </div>
            ) : null}
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
