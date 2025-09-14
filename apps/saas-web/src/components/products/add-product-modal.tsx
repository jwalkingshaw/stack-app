"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Package, X } from "lucide-react";

interface AddProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantSlug: string;
}

export function AddProductModal({ isOpen, onClose, tenantSlug }: AddProductModalProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    sku: '',
    product_name: '',
    status: 'Draft'
  });
  const [errors, setErrors] = useState<{[key: string]: string}>({});

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
    
    if (!formData.sku.trim()) {
      newErrors.sku = 'SKU is required';
    }
    
    if (!formData.product_name.trim()) {
      newErrors.product_name = 'Product name is required';
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
      console.log('🚀 Creating product:', formData);
      
      const response = await fetch(`/api/${tenantSlug}/products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          type: 'standalone' // Default to standalone product
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        console.error('❌ Product creation failed:', result);
        
        if (result.error?.includes('SKU already exists')) {
          setErrors({ sku: 'A product with this SKU already exists' });
        } else {
          setErrors({ general: result.error || 'Failed to create product' });
        }
        return;
      }

      console.log('✅ Product created successfully:', result.data);
      
      // Close modal and redirect to product detail page
      onClose();
      router.push(`/${tenantSlug}/products/${result.data.id}`);
      
    } catch (error) {
      console.error('💥 Error creating product:', error);
      setErrors({ general: 'An unexpected error occurred' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      setFormData({ sku: '', product_name: '', status: 'Draft' });
      setErrors({});
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={handleClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-lg max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Package className="w-5 h-5" />
              Add New Product
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Enter the basic information to create your product. You'll be able to add more details on the next page.
            </p>
          </div>
          <button
            onClick={handleClose}
            disabled={isLoading}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-2">
            <label htmlFor="sku" className="block text-sm font-medium text-gray-700">
              SKU *
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
            <label htmlFor="status" className="block text-sm font-medium text-gray-700">
              Status
            </label>
            <select
              id="status"
              value={formData.status}
              onChange={(e) => handleInputChange('status', e.target.value)}
              disabled={isLoading}
              className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="Draft">Draft</option>
              <option value="Development">Development</option>
              <option value="Active">Active</option>
              <option value="Pending Launch">Pending Launch</option>
              <option value="Discontinued">Discontinued</option>
            </select>
          </div>

          {errors.general && (
            <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded">
              {errors.general}
            </div>
          )}

          {/* Footer */}
          <div className="flex gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isLoading}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="flex-1 min-w-[120px]"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Product'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}