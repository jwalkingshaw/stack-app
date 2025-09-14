"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { 
  ArrowUpDown,
  Check,
  Eye,
  MoreHorizontal,
  Plus,
  Search,
  Filter,
  Settings,
  ChevronDown,
  ChevronRight,
  Package,
  TrendingUp,
  Calendar,
  ImageIcon,
  Layers,
  GitBranch
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { BulkActionToolbar } from "@/components/dam/bulk-action-toolbar";
import { KeyboardShortcutsHelp } from "@/components/dam/keyboard-shortcuts-help";
import { MOCK_PIM_PRODUCTS, STATUS_COLORS, type PIMProduct } from "./mock-pim-data";


// Type guards for product hierarchy
const isParentProduct = (product: PIMProduct): boolean => product.type === 'parent';
const isVariantProduct = (product: PIMProduct): boolean => product.type === 'variant';
const isStandaloneProduct = (product: PIMProduct): boolean => product.type === 'standalone';

interface PIMTableProps {
  tenantSlug: string;
  onProductClick?: (product: PIMProduct) => void;
  onCreateProduct?: () => void;
}



export function PIMTable({ tenantSlug, onProductClick, onCreateProduct }: PIMTableProps) {
  const [products, setProducts] = useState<PIMProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("All");
  const [sortField, setSortField] = useState<keyof PIMProduct>("productName");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  
  // Auto-save timer reference
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  
  // Product creation workflow state
  const [creationMode, setCreationMode] = useState(false);
  const [creatingProducts, setCreatingProducts] = useState<Partial<PIMProduct>[]>([]);
  
  // Column visibility state
  const [visibleColumns, setVisibleColumns] = useState({
    productName: true,
    sku: true,
    brandLine: true,
    family: true,
    upc: true,
    status: true,
    msrp: true,
    costOfGoods: true,
    marginPercent: true,
    assetsCount: true,
    contentScore: true,
    lastModified: true
  });
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  
  // Hierarchy state
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());
  const [showVariantHierarchy, setShowVariantHierarchy] = useState(true);
  
  // Get filtered products with hierarchy (memoized for performance)
  const getFilteredProductsWithHierarchy = useMemo(() => {
    let filtered = products.filter(product => {
      const matchesSearch = searchQuery === "" || 
        product.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.brandLine?.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesFilter = filterStatus === "All" || product.status === filterStatus;
      
      return matchesSearch && matchesFilter;
    });

    if (!showVariantHierarchy) {
      return filtered;
    }

    const result: PIMProduct[] = [];
    const processedIds = new Set<string>();

    filtered.forEach(product => {
      if (processedIds.has(product.id)) return;

      if (isParentProduct(product)) {
        result.push(product);
        processedIds.add(product.id);

        if (expandedParents.has(product.id)) {
          const variants = filtered.filter(p => p.parentId === product.id);
          
          // Show first 15 variants
          const visibleVariants = variants.slice(0, 15);
          visibleVariants.forEach(variant => {
            result.push(variant);
            processedIds.add(variant.id);
          });
          
          // Add "view all" link as pseudo-product if there are more than 15 variants
          if (variants.length > 15) {
            result.push({
              id: `${product.id}_view_all`,
              type: 'standalone' as const,
              productName: `View all ${variants.length} variations`,
              sku: '',
              assetsCount: 0,
              contentScore: 0,
              lastModified: '',
              lastModifiedBy: '',
              status: 'Active' as const,
              // Special flag to identify this as a "view all" row
              isViewAllLink: true,
              parentId: product.id
            } as PIMProduct & { isViewAllLink: boolean });
          }
        }
      } else if (isVariantProduct(product)) {
        const hasParentInResults = filtered.some(p => p.id === product.parentId);
        if (!hasParentInResults) {
          result.push(product);
          processedIds.add(product.id);
        }
      } else {
        result.push(product);
        processedIds.add(product.id);
      }
    });

    return result;
  }, [products, searchQuery, filterStatus, showVariantHierarchy, expandedParents]);

  // Load products
  useEffect(() => {
    const loadProducts = async () => {
      try {
        const response = await fetch(`/api/${tenantSlug}/products`);
        const data = await response.json();
        
        if (data.success && data.data) {
          // Transform Supabase data to PIMProduct format
          const transformedProducts = data.data.map((product: any) => ({
            id: product.id,
            type: product.type,
            parentId: product.parent_id,
            hasVariants: product.has_variants,
            variantCount: product.variant_count,
            productName: product.product_name,
            sku: product.sku,
            upc: product.upc,
            brandLine: product.brand_line,
            family: product.product_families?.name,
            variantAxis: product.variant_axis || {},
            status: product.status,
            launchDate: product.launch_date,
            msrp: product.msrp,
            costOfGoods: product.cost_of_goods,
            marginPercent: product.margin_percent,
            assetsCount: product.assets_count,
            contentScore: product.content_score,
            shortDescription: product.short_description,
            longDescription: product.long_description,
            features: product.features || [],
            specifications: product.specifications || {},
            metaTitle: product.meta_title,
            metaDescription: product.meta_description,
            keywords: product.keywords || [],
            weightG: product.weight_g,
            dimensions: product.dimensions || {},
            inheritance: product.inheritance || {},
            isInherited: product.is_inherited || {},
            marketplaceContent: product.marketplace_content || {},
            createdBy: product.created_by,
            createdAt: product.created_at,
            updatedAt: product.updated_at,
            lastModifiedBy: product.last_modified_by,
            lastModified: product.updated_at
          }));
          
          setProducts(transformedProducts);
        } else {
          // No products found - start with empty state
          setProducts([]);
        }
      } catch (error) {
        console.error("Failed to load products:", error);
        // Start with empty state on error
        setProducts([]);
      } finally {
        setLoading(false);
      }
    };

    loadProducts();
  }, [tenantSlug]);

  // Cleanup auto-save timer on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, []);

  // Start product creation workflow (clear view)
  const handleStartCreation = () => {
    const newId = `new_${Date.now()}`;
    const newProductRow: Partial<PIMProduct> = {
      id: newId,
      type: 'parent',
      productName: '',
      sku: '',
      status: 'Development',
      brandLine: '',
      family: '',
      contentScore: 0,
      assetsCount: 0,
      variantCount: 0,
      hasVariants: false,
    };
    
    setCreationMode(true);
    setCreatingProducts([newProductRow]);
  };

  // Add another product row in creation mode
  const handleAddProductRow = () => {
    const newId = `new_${Date.now()}`;
    const newProductRow: Partial<PIMProduct> = {
      id: newId,
      type: 'parent',
      productName: '',
      sku: '',
      upc: '',
      status: 'Development',
      brandLine: '',
      family: '',
      contentScore: 0,
      assetsCount: 0,
      variantCount: 0,
      hasVariants: false,
    };
    
    setCreatingProducts(prev => [...prev, newProductRow]);
  };

  // Exit creation mode
  const handleExitCreationMode = () => {
    setCreationMode(false);
    setCreatingProducts([]);
  };

  // Save new product to database
  const handleSaveNewProduct = async (productData: Partial<PIMProduct>) => {
    console.log('💾 Saving new product:', productData);
    
    if (!productData.productName || !productData.sku) {
      console.error('❌ Product name and SKU are required');
      return;
    }

    try {
      console.log('🌐 Making API call to:', `/api/${tenantSlug}/products`);
      console.log('🌐 Product name:', productData.productName);
      console.log('🌐 SKU:', productData.sku);
      console.log('🌐 Type:', productData.type || 'parent');
      
      const response = await fetch(`/api/${tenantSlug}/products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: productData.type || 'parent',
          parent_id: productData.parentId,
          product_name: productData.productName,
          sku: productData.sku,
          upc: productData.upc,
          brand_line: productData.brandLine,
          family_id: productData.family, // TODO: Map family name to ID
          status: productData.status || 'Development',
          msrp: productData.msrp,
          cost_of_goods: productData.costOfGoods,
          margin_percent: productData.marginPercent,
        })
      });

      const data = await response.json();

      if (data.success) {
        // Transform and add to products list
        const savedProduct = {
          id: data.data.id,
          type: data.data.type,
          parentId: data.data.parent_id,
          hasVariants: data.data.has_variants,
          variantCount: data.data.variant_count,
          productName: data.data.product_name,
          sku: data.data.sku,
          upc: data.data.upc,
          brandLine: data.data.brand_line,
          family: data.data.product_families?.name,
          status: data.data.status,
          msrp: data.data.msrp,
          costOfGoods: data.data.cost_of_goods,
          marginPercent: data.data.margin_percent,
          assetsCount: data.data.assets_count,
          contentScore: data.data.content_score,
          createdAt: data.data.created_at,
          updatedAt: data.data.updated_at,
          lastModified: data.data.updated_at,
          lastModifiedBy: data.data.last_modified_by || 'Unknown'
        };

        setProducts(prev => [savedProduct, ...prev]);
        // Remove the created product from creating products and exit creation mode if this was the last one
        setCreatingProducts(prev => {
          const remaining = prev.filter(p => p.id !== productData.id);
          if (remaining.length === 0) {
            setCreationMode(false);
          }
          return remaining;
        });
        console.log('✅ Product created successfully');
      } else {
        console.error('❌ Failed to create product:', data.error);
      }
    } catch (error) {
      console.error('❌ Error creating product:', error);
      console.error('❌ Error message:', error instanceof Error ? error.message : 'Unknown error');
      console.error('❌ Error type:', typeof error);
      console.error('❌ Product data:', productData);
      console.error('❌ Tenant slug:', tenantSlug);
    }
  };

  // Delayed auto-save function
  const scheduleAutoSave = useCallback((productData: Partial<PIMProduct>) => {
    // Clear existing timer
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    
    // Only schedule auto-save if we have minimum required fields
    if (productData.productName && productData.sku) {
      console.log('⏱️ Scheduling auto-save in 3 seconds for:', productData.productName);
      autoSaveTimerRef.current = setTimeout(() => {
        console.log('🚀 Auto-save triggered for:', productData.productName);
        handleSaveNewProduct(productData);
      }, 3000); // 3 second delay
    }
  }, []);


  // Get filtered products with hierarchy, then sort (memoized for performance)
  const filteredAndSortedProducts = useMemo(() => {
    return getFilteredProductsWithHierarchy.sort((a, b) => {
      const aValue = a[sortField];
      const bValue = b[sortField];
      
      // Handle different data types
      let comparison = 0;
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        comparison = aValue.toLowerCase().localeCompare(bValue.toLowerCase());
      } else if (typeof aValue === 'number' && typeof bValue === 'number') {
        comparison = aValue - bValue;
      } else {
        // Handle undefined/null values
        if (aValue === undefined && bValue === undefined) return 0;
        if (aValue === undefined) return 1;
        if (bValue === undefined) return -1;
        comparison = String(aValue).localeCompare(String(bValue));
      }
      
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [getFilteredProductsWithHierarchy, sortField, sortDirection]);

  // Selection handlers
  const handleProductSelect = useCallback((productId: string, event?: React.MouseEvent) => {
    event?.stopPropagation();
    
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    setSelectedProductIds(prev => {
      const newSet = new Set(prev);
      const isCurrentlySelected = newSet.has(productId);
      
      if (isParentProduct(product)) {
        // Parent product selection - toggle parent + all variants
        const variants = products.filter(p => p.parentId === productId);
        
        if (isCurrentlySelected) {
          // Unselect parent and all variants
          newSet.delete(productId);
          variants.forEach(variant => newSet.delete(variant.id));
        } else {
          // Select parent and all variants
          newSet.add(productId);
          variants.forEach(variant => newSet.add(variant.id));
        }
      } else {
        // Regular product or variant selection
        if (isCurrentlySelected) {
          newSet.delete(productId);
          
          // If this was a variant, check if we should unselect the parent
          if (isVariantProduct(product) && product.parentId) {
            const parentVariants = products.filter(p => p.parentId === product.parentId);
            const remainingSelectedVariants = parentVariants.filter(v => newSet.has(v.id));
            
            // If no variants of this parent are selected, unselect the parent too
            if (remainingSelectedVariants.length === 0) {
              newSet.delete(product.parentId);
            }
          }
        } else {
          newSet.add(productId);
          
          // If this is a variant and we're selecting it, check if all variants are now selected
          if (isVariantProduct(product) && product.parentId) {
            const parentVariants = products.filter(p => p.parentId === product.parentId);
            const selectedVariants = parentVariants.filter(v => newSet.has(v.id) || v.id === productId);
            
            // If all variants are selected, auto-select the parent
            if (selectedVariants.length === parentVariants.length) {
              newSet.add(product.parentId);
            }
          }
        }
      }
      
      return newSet;
    });
  }, [products]);

  const handleSelectAll = useCallback(() => {
    if (selectedProductIds.size === filteredAndSortedProducts.length) {
      setSelectedProductIds(new Set());
    } else {
      setSelectedProductIds(new Set(filteredAndSortedProducts.map(p => p.id)));
    }
  }, [filteredAndSortedProducts, selectedProductIds]);

  const handleClearSelection = useCallback(() => {
    setSelectedProductIds(new Set());
  }, []);

  // Bulk action handlers
  const handleBulkEdit = () => {
    // TODO: Open bulk edit modal with selected products
    console.log('Bulk editing products:', Array.from(selectedProductIds));
  };

  const handleBulkStatusUpdate = () => {
    // TODO: Open status update modal
    console.log('Bulk status update for:', Array.from(selectedProductIds));
  };

  const handleBulkMove = () => {
    // TODO: Implement bulk category/brand line move
    console.log('Bulk move products:', Array.from(selectedProductIds));
  };

  const handleBulkDelete = () => {
    // TODO: Show confirmation modal then delete
    if (confirm(`Delete ${selectedProductIds.size} selected products?`)) {
      console.log('Bulk deleting products:', Array.from(selectedProductIds));
      setProducts(prev => prev.filter(p => !selectedProductIds.has(p.id)));
      setSelectedProductIds(new Set());
    }
  };

  const handleBulkExport = () => {
    // TODO: Export selected products to CSV/Excel
    console.log('Exporting products:', Array.from(selectedProductIds));
  };

  // Sorting handlers
  const handleSort = useCallback((field: keyof PIMProduct) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  }, [sortField, sortDirection]);

  // Content score color coding
  const getContentScoreColor = (score: number) => {
    if (score >= 90) return "text-green-600";
    if (score >= 70) return "text-yellow-600"; 
    return "text-red-600";
  };

  // Margin color coding
  const getMarginColor = (margin?: number) => {
    if (!margin) return "text-muted-foreground";
    if (margin >= 55) return "text-green-600";
    if (margin >= 45) return "text-yellow-600";
    return "text-red-600";
  };


  // Hierarchy handling functions
  const toggleParentExpansion = (parentId: string) => {
    setExpandedParents(prev => {
      const newSet = new Set(prev);
      if (newSet.has(parentId)) {
        newSet.delete(parentId);
      } else {
        newSet.add(parentId);
      }
      return newSet;
    });
  };

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  // Calculate summary stats with variant awareness
  const stats = {
    total: products.length,
    parents: products.filter(p => isParentProduct(p)).length,
    variants: products.filter(p => isVariantProduct(p)).length,
    standalone: products.filter(p => isStandaloneProduct(p)).length,
    active: products.filter(p => p.status === "Active").length,
    development: products.filter(p => p.status === "Development").length,
    avgContentScore: Math.round(products.reduce((sum, p) => sum + p.contentScore, 0) / products.length),
    totalAssets: products.reduce((sum, p) => sum + p.assetsCount, 0)
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'a' && filteredAndSortedProducts.length > 0) {
        e.preventDefault();
        handleSelectAll();
      }
      if (e.key === 'Escape' && selectedProductIds.size > 0) {
        handleClearSelection();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredAndSortedProducts.length, selectedProductIds.size]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-1/3" />
          <div className="h-64 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Stats Cards */}
      <div className="flex items-center gap-4">
        <div className="bg-white h-8 px-3 rounded border border-border flex items-center justify-between min-w-32">
          <span className="text-sm font-medium text-muted-foreground">Total Products</span>
          <span className="text-sm font-bold text-gray-900 ml-2">{stats.total}</span>
        </div>
        
        <div className="bg-white h-8 px-3 rounded border border-border flex items-center justify-between min-w-32">
          <span className="text-sm font-medium text-muted-foreground">In Development</span>
          <span className="text-sm font-bold text-gray-900 ml-2">{stats.development}</span>
        </div>
        
        <div className="bg-white h-8 px-3 rounded border border-border flex items-center justify-between min-w-32">
          <span className="text-sm font-medium text-muted-foreground">Avg Content Score</span>
          <span className="text-sm font-bold text-gray-900 ml-2">
            {stats.avgContentScore}%
          </span>
        </div>
        
        <div className="bg-white h-8 px-3 rounded border border-border flex items-center justify-between min-w-32">
          <span className="text-sm font-medium text-muted-foreground">Total Assets</span>
          <span className="text-sm font-bold text-gray-900 ml-2">{stats.totalAssets}</span>
        </div>
      </div>

      {/* Search and Controls */}
      <div className="flex items-center justify-between gap-4">
        {creationMode ? (
          <div className="flex items-center gap-4 flex-1">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-primary rounded-full"></div>
              <span className="text-sm font-medium text-blue-900">Product Creation Mode</span>
              <span className="text-xs text-muted-foreground">({creatingProducts.length} products)</span>
            </div>
            
            <Button
              onClick={onCreateProduct}
              size="sm"
              className="gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Product
            </Button>

            <Button
              onClick={handleExitCreationMode}
              variant="outline"
              size="sm"
            >
              Done
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-4 flex-1">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            
            {/* Status Filter */}
            <div className="relative">
              <select 
                value={filterStatus} 
                onChange={(e) => setFilterStatus(e.target.value)}
                className="appearance-none bg-white border border-input rounded-md px-4 h-8 pr-8 focus:outline-none focus:ring-2 focus:ring-blue-500" style={{ fontSize: '0.9375rem', fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}
              >
                <option value="All">All Status</option>
                <option value="Development">Development</option>
                <option value="Active">Active</option>
                <option value="Pending Launch">Pending Launch</option>
                <option value="Discontinued">Discontinued</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            </div>
            
            {/* Column Settings */}
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowColumnSettings(!showColumnSettings)}
                className="gap-2"
              >
                <Settings className="w-4 h-4" />
                Columns
              </Button>
              
              {showColumnSettings && (
                <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-border rounded-lg shadow-lg z-50 p-4">
                  <h3 className="font-medium text-gray-900 mb-3">Show/Hide Columns</h3>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {Object.entries(visibleColumns).map(([key, isVisible]) => (
                      <label key={key} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isVisible}
                          onChange={(e) => setVisibleColumns(prev => ({ ...prev, [key]: e.target.checked }))}
                          className="w-4 h-4 text-blue-600 border-input rounded focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700 capitalize">
                          {key === 'productName' ? 'Product Name' :
                           key === 'sku' ? 'SKU' :
                           key === 'brandLine' ? 'Brand Line' :
                           key === 'family' ? 'Family' :
                           key === 'upc' ? 'UPC' :
                           key === 'costOfGoods' ? 'COGS' :
                           key === 'marginPercent' ? 'Margin %' :
                           key === 'assetsCount' ? 'Assets' :
                           key === 'contentScore' ? 'Content Score' :
                           key === 'lastModified' ? 'Last Modified' :
                           key.charAt(0).toUpperCase() + key.slice(1)}
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className="mt-3 pt-3 border-t border-border flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setVisibleColumns({
                        productName: true,
                        sku: true,
                        brandLine: true,
                        family: true,
                        upc: true,
                        status: true,
                        msrp: true,
                        costOfGoods: true,
                        marginPercent: true,
                        assetsCount: true,
                        contentScore: true,
                        lastModified: true
                      })}
                    >
                      Show All
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowColumnSettings(false)}
                    >
                      Done
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Selection Info */}
        {!creationMode && selectedProductIds.size > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-700 rounded-lg border border-blue-200">
            <span className="text-sm font-medium">{selectedProductIds.size} selected</span>
            <Button 
              size="sm" 
              variant="ghost" 
              onClick={handleClearSelection}
              className="h-6 w-6 p-0 hover:bg-blue-100"
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        )}
      </div>

      {/* Products Table */}
      <div className="bg-background rounded-md border border-border/60 overflow-hidden shadow-soft">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border/40">
            {/* Table Header */}
            <thead className="bg-muted/30 border-b border-border/60">
              <tr>
                {/* Hierarchy Toggle + Select All */}
                <th className="w-16 px-4 py-3">
                  <div className="flex items-center gap-1">
                    {/* Reserve space to align with chevron position in body rows */}
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowVariantHierarchy(!showVariantHierarchy)}
                        className="h-4 w-4 p-0 hover:bg-gray-200"
                        title={showVariantHierarchy ? "Flatten view" : "Show hierarchy"}
                      >
                        {showVariantHierarchy ? <GitBranch className="w-3 h-3" /> : <Layers className="w-3 h-3" />}
                      </Button>
                    </div>
                    
                    {/* Select All Checkbox */}
                    <input
                      type="checkbox"
                      checked={filteredAndSortedProducts.length > 0 && selectedProductIds.size === filteredAndSortedProducts.length}
                      onChange={handleSelectAll}
                      className="w-3 h-3 text-blue-600 border-input rounded focus:ring-blue-500"
                    />
                  </div>
                </th>

                {/* Product Name */}
                {visibleColumns.productName && (
                  <th 
                    className="px-6 py-3 text-left text-sm font-medium text-muted-foreground cursor-pointer hover:bg-muted/20 transition-colors min-w-96 w-96"
                    onClick={() => handleSort("productName")}
                  >
                    <div className="flex items-center gap-1">
                      Product Name
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                )}

                {/* SKU */}
                {visibleColumns.sku && (
                  <th 
                    className="px-6 py-3 text-left text-sm font-medium text-muted-foreground cursor-pointer hover:bg-muted/20 transition-colors"
                    onClick={() => handleSort("sku")}
                  >
                    <div className="flex items-center gap-1">
                      SKU
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                )}

                {/* Brand Line */}
                {visibleColumns.brandLine && (
                  <th 
                    className="px-6 py-3 text-left text-sm font-medium text-muted-foreground cursor-pointer hover:bg-muted/20 transition-colors"
                    onClick={() => handleSort("brandLine")}
                  >
                    <div className="flex items-center gap-1">
                      Brand Line
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                )}

                {/* Family */}
                {visibleColumns.family && (
                  <th 
                    className="px-6 py-3 text-left text-sm font-medium text-muted-foreground cursor-pointer hover:bg-muted/20 transition-colors"
                    onClick={() => handleSort("family")}
                  >
                    <div className="flex items-center gap-1">
                      Family
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                )}

                {/* UPC */}
                {visibleColumns.upc && (
                  <th 
                    className="px-6 py-3 text-left text-sm font-medium text-muted-foreground cursor-pointer hover:bg-muted/20 transition-colors"
                    onClick={() => handleSort("upc")}
                  >
                    <div className="flex items-center gap-1">
                      UPC
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                )}

                {/* Status */}
                {visibleColumns.status && (
                  <th 
                    className="px-6 py-3 text-left text-sm font-medium text-muted-foreground cursor-pointer hover:bg-muted/20 transition-colors"
                    onClick={() => handleSort("status")}
                  >
                    <div className="flex items-center gap-1">
                      Status
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                )}

                {/* MSRP */}
                {visibleColumns.msrp && (
                  <th 
                    className="px-6 py-3 text-left text-sm font-medium text-muted-foreground cursor-pointer hover:bg-muted/20 transition-colors"
                    onClick={() => handleSort("msrp")}
                  >
                    <div className="flex items-center gap-1">
                      MSRP
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                )}

                {/* Cost of Goods */}
                {visibleColumns.costOfGoods && (
                  <th 
                    className="px-6 py-3 text-left text-sm font-medium text-muted-foreground cursor-pointer hover:bg-muted/20 transition-colors"
                    onClick={() => handleSort("costOfGoods")}
                  >
                    <div className="flex items-center gap-1">
                      COGS
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                )}

                {/* Margin % */}
                {visibleColumns.marginPercent && (
                  <th 
                    className="px-6 py-3 text-left text-sm font-medium text-muted-foreground cursor-pointer hover:bg-muted/20 transition-colors"
                    onClick={() => handleSort("marginPercent")}
                  >
                    <div className="flex items-center gap-1">
                      Margin %
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                )}

                {/* Assets */}
                {visibleColumns.assetsCount && (
                  <th 
                    className="px-6 py-3 text-left text-sm font-medium text-muted-foreground cursor-pointer hover:bg-muted/20 transition-colors"
                    onClick={() => handleSort("assetsCount")}
                  >
                    <div className="flex items-center gap-1">
                      Assets
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                )}

                {/* Content Score */}
                {visibleColumns.contentScore && (
                  <th 
                    className="px-6 py-3 text-left text-sm font-medium text-muted-foreground cursor-pointer hover:bg-muted/20 transition-colors"
                    onClick={() => handleSort("contentScore")}
                  >
                    <div className="flex items-center gap-1">
                      Content Score
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                )}

                {/* Last Modified */}
                {visibleColumns.lastModified && (
                  <th 
                    className="px-6 py-3 text-left text-sm font-medium text-muted-foreground cursor-pointer hover:bg-muted/20 transition-colors"
                    onClick={() => handleSort("lastModified")}
                  >
                    <div className="flex items-center gap-1">
                      Last Modified
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                )}

                {/* Actions */}
                <th className="px-6 py-3 text-right text-sm font-medium text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="bg-background divide-y divide-border/40">
              {/* Creation Mode - Show creating products only */}
              {creationMode ? (
                creatingProducts.map((product, index) => (
                <tr key={product.id} className="bg-blue-50 border-2 border-blue-200 h-12">
                  {/* Hierarchy + Checkbox */}
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        disabled
                        className="w-4 h-4"
                      />
                    </div>
                  </td>

                  {/* Product Name */}
                  {visibleColumns.productName && (
                    <td className="px-6 py-4 max-w-120">
                      <div className="break-words">
                        {product.productName || <span className="text-muted-foreground">Enter product name...</span>}
                      </div>
                    </td>
                  )}

                  {/* SKU */}
                  {visibleColumns.sku && (
                    <td className="px-6 py-4">
                      <span className="font-mono">
                        {product.sku || <span className="text-muted-foreground">Enter SKU...</span>}
                      </span>
                    </td>
                  )}

                  {/* Brand Line */}
                  {visibleColumns.brandLine && (
                    <td className="px-6 py-4">
                      {product.brandLine || <span className="text-muted-foreground">Enter brand line...</span>}
                    </td>
                  )}

                  {/* Family */}
                  {visibleColumns.family && (
                    <td className="px-6 py-4">
                      {product.family || <span className="text-muted-foreground">Enter family...</span>}
                    </td>
                  )}

                  {/* UPC */}
                  {visibleColumns.upc && (
                    <td className="px-6 py-4">
                      <span className="font-mono">
                        {product.upc || <span className="text-muted-foreground">Enter UPC...</span>}
                      </span>
                    </td>
                  )}

                  {/* Status */}
                  {visibleColumns.status && (
                    <td className="px-6 py-4">
                      <Badge className={`${
                        !product.status || product.status === 'Development' 
                          ? 'bg-blue-100 text-blue-800 border-blue-200' 
                          : product.status === 'Active'
                          ? 'bg-green-100 text-green-800 border-green-200'
                          : 'bg-red-100 text-red-800 border-red-200'
                      }`}>
                        {product.status || 'Development'}
                      </Badge>
                    </td>
                  )}

                  {/* Actions */}
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          // Cancel auto-save timer and save immediately
                          if (autoSaveTimerRef.current) {
                            clearTimeout(autoSaveTimerRef.current);
                          }
                          console.log('✅ Manual "Done" triggered for:', product.productName);
                          if (product.productName && product.sku) {
                            handleSaveNewProduct(product);
                          } else {
                            console.error('Product name and SKU are required');
                          }
                        }}
                        disabled={!product.productName || !product.sku}
                        className="h-7 px-3 text-xs bg-primary hover:bg-primary/90"
                      >
                        <Check className="w-3 h-3 mr-1" />
                        Done
                      </Button>
                    </div>
                  </td>
                </tr>
                ))
              ) : (
                filteredAndSortedProducts.map((product, index) => {
                const isSelected = selectedProductIds.has(product.id);
                const nextProduct = filteredAndSortedProducts[index + 1];
                const prevProduct = filteredAndSortedProducts[index - 1];
                const isViewAllLink = (product as any).isViewAllLink;
                
                // Determine if this row is part of an expanded variant group
                const isInExpandedGroup = (isVariantProduct(product) || isViewAllLink) && 
                  expandedParents.has(product.parentId || '');
                const isFirstInGroup = isInExpandedGroup && 
                  (!prevProduct || (prevProduct.parentId !== product.parentId && !(prevProduct as any).isViewAllLink));
                const isLastInGroup = isInExpandedGroup && 
                  (!nextProduct || (nextProduct.parentId !== product.parentId && !isViewAllLink));
                
                // Special handling for "View all variations" link
                if (isViewAllLink) {
                  return (
                    <tr 
                      key={product.id}
                      className={cn(
                        "hover:bg-muted/30 transition-colors cursor-pointer",
                        "bg-blue-50/30 border-l-2 border-r-2 border-blue-200",
                        isLastInGroup && "border-b-2 border-blue-200"
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        // Find the parent product and navigate to its detail page
                        const parentProduct = products.find(p => p.id === product.parentId);
                        if (parentProduct) {
                          onProductClick?.(parentProduct);
                        }
                      }}
                    >
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-1">
                          <div className="flex items-center gap-1" style={{ marginLeft: '16px' }}>
                            <div className="w-3 h-3 flex items-center justify-center">
                              <div className="w-2 h-px bg-gray-300" />
                            </div>
                          </div>
                          {/* No checkbox for view all link */}
                        </div>
                      </td>
                      
                      {/* Product Name - View All Link */}
                      {visibleColumns.productName && (
                        <td className="px-6 py-4" colSpan={Object.values(visibleColumns).filter(Boolean).length + 1}>
                          <div className="flex items-center gap-3">
                            <div className="flex-shrink-0 w-12 h-12"></div>
                            <div className="flex-1 min-w-0">
                              <div className="text-blue-600 hover:underline font-medium text-sm">
                                {product.productName}
                              </div>
                            </div>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                }
                
                return (
                  <tr 
                    key={product.id}
                    className={cn(
                      "hover:bg-muted/30 transition-colors cursor-pointer",
                      isSelected && "bg-blue-50 hover:bg-blue-100",
                      // Visual grouping for expanded variants
                      isInExpandedGroup && "bg-blue-50/30",
                      isFirstInGroup && "border-t-2 border-blue-200",
                      isLastInGroup && "border-b-2 border-blue-200",
                      isInExpandedGroup && "border-l-2 border-blue-200 border-r-2 border-blue-200"
                    )}
                    onClick={() => onProductClick?.(product)}
                  >
                    {/* Hierarchy + Checkbox */}
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1">
                        {/* Hierarchy indicators - always reserve space */}
                        <div className="flex items-center gap-1" style={{ marginLeft: isVariantProduct(product) ? '16px' : '0px' }}>
                          {showVariantHierarchy && isParentProduct(product) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleParentExpansion(product.id);
                              }}
                              className="h-4 w-4 p-0 hover:bg-gray-200"
                            >
                              {expandedParents.has(product.id) ? (
                                <ChevronDown className="w-3 h-3" />
                              ) : (
                                <ChevronRight className="w-3 h-3" />
                              )}
                            </Button>
                          )}
                          {showVariantHierarchy && isVariantProduct(product) && (
                            <div className="w-3 h-3 flex items-center justify-center">
                              <div className="w-2 h-px bg-gray-300" />
                            </div>
                          )}
                          {/* Reserve space for chevron even when not showing hierarchy or for standalone products */}
                          {(!showVariantHierarchy || isStandaloneProduct(product)) && (
                            <div className="w-4 h-4"></div>
                          )}
                        </div>
                        
                        {/* Checkbox */}
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => handleProductSelect(product.id, e)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-3 h-3 text-blue-600 border-input rounded focus:ring-blue-500"
                        />
                      </div>
                    </td>

                    {/* Product Name with Image */}
                    {visibleColumns.productName && (
                      <td className="px-6 py-4">
                        <div className="flex items-start gap-3">
                          {/* Product Image */}
                          <div className="flex-shrink-0 w-12 h-12 bg-gray-100 rounded-lg border border-border flex items-center justify-center overflow-hidden">
                            {product.assetsCount > 0 ? (
                              <div className="w-full h-full bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center">
                                <ImageIcon className="w-5 h-5 text-muted-foreground" />
                              </div>
                            ) : (
                              <div className="text-xs text-muted-foreground text-center">No image</div>
                            )}
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            {/* Clear product name display */}
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <div className={cn(
                                  "font-semibold flex-1 min-w-0",
                                  isParentProduct(product) ? "text-base text-gray-900" : "text-sm text-gray-800"
                                )}>
                                  {product.productName}
                                </div>
                                
                                {/* Content inheritance indicator */}
                                {isVariantProduct(product) && product.isInherited?.productName && (
                                  <div className="w-2 h-2 bg-blue-400 rounded-full flex-shrink-0" title="Inherited from parent" />
                                )}
                              </div>
                              
                              {/* Secondary info row */}
                              <div className="flex items-center gap-2 flex-wrap">
                                {/* Variation count indicator for parents */}
                                {isParentProduct(product) && (
                                  <span className="text-sm text-muted-foreground whitespace-nowrap">
                                    {product.variantCount && product.variantCount > 15 ? (
                                      <button 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onProductClick?.(product);
                                        }}
                                        className="text-blue-600 hover:underline"
                                      >
                                        View {product.variantCount} variations
                                      </button>
                                    ) : (
                                      `Variations (${product.variantCount})`
                                    )}
                                  </span>
                                )}
                                
                                {/* Variant attributes for variants */}
                                {isVariantProduct(product) && product.variantAxis && (
                                  <div className="flex gap-1 flex-wrap">
                                    {Object.entries(product.variantAxis).map(([key, value]) => (
                                      <Badge key={key} variant="secondary" className="text-xs px-1.5 py-0.5 whitespace-nowrap">
                                        {value}
                                      </Badge>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                            
                            {/* Simplified product metadata - no categories or parent references for cleaner display */}
                          </div>
                        </div>
                      </td>
                    )}

                    {/* SKU */}
                    {visibleColumns.sku && (
                      <td className="px-6 py-4">
                        <div className="text-sm text-foreground font-mono">
                          {product.sku}
                        </div>
                      </td>
                    )}

                    {/* Brand Line */}
                    {visibleColumns.brandLine && (
                      <td className="px-6 py-4">
                        <div className="text-sm text-foreground">
                          {product.brandLine || '-'}
                        </div>
                      </td>
                    )}

                    {/* Family */}
                    {visibleColumns.family && (
                      <td className="px-6 py-4">
                        <div className="text-sm text-foreground">
                          <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                            {product.family || 'Uncategorized'}
                          </Badge>
                        </div>
                      </td>
                    )}

                    {/* UPC */}
                    {visibleColumns.upc && (
                      <td className="px-6 py-4">
                        <div className="text-sm text-foreground font-mono">
                          {product.upc || '-'}
                        </div>
                      </td>
                    )}

                    {/* Status */}
                    {visibleColumns.status && (
                      <td className="px-6 py-4">
                        <Badge className={cn("text-xs", STATUS_COLORS[product.status])}>
                          {product.status}
                        </Badge>
                      </td>
                    )}

                    {/* MSRP */}
                    {visibleColumns.msrp && (
                      <td className="px-6 py-4">
                        <div className="text-sm text-foreground">
                          {product.msrp ? `$${product.msrp}` : '-'}
                        </div>
                      </td>
                    )}

                    {/* Cost of Goods */}
                    {visibleColumns.costOfGoods && (
                      <td className="px-6 py-4">
                        <div className="text-sm text-foreground">
                          {product.costOfGoods ? `$${product.costOfGoods}` : '-'}
                        </div>
                      </td>
                    )}

                    {/* Margin % */}
                    {visibleColumns.marginPercent && (
                      <td className="px-6 py-4 text-sm">
                        <span className={cn("font-medium", getMarginColor(product.marginPercent))}>
                          {product.marginPercent ? `${product.marginPercent}%` : '-'}
                        </span>
                      </td>
                    )}

                    {/* Assets */}
                    {visibleColumns.assetsCount && (
                      <td className="px-6 py-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <ImageIcon className="w-4 h-4" />
                          {product.assetsCount}
                        </div>
                      </td>
                    )}

                    {/* Content Score */}
                    {visibleColumns.contentScore && (
                      <td className="px-6 py-4 text-sm">
                        <span className={cn("text-sm font-medium", getContentScoreColor(product.contentScore))}>
                          {product.contentScore}%
                        </span>
                      </td>
                    )}

                    {/* Last Modified */}
                    {visibleColumns.lastModified && (
                      <td className="px-6 py-4 text-sm text-muted-foreground">
                        <div>{formatDate(product.lastModified)}</div>
                        <div className="text-xs text-muted-foreground">{product.lastModifiedBy}</div>
                      </td>
                    )}

                    {/* Actions */}
                    <td className="px-6 py-4 text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-8 w-8 p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            onProductClick?.(product);
                          }}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              }))
              }
            </tbody>
          </table>
        </div>

        {/* Empty State */}
        {filteredAndSortedProducts.length === 0 && (
          <div className="text-center py-12">
            <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No products found
            </h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery || filterStatus !== "All" 
                ? "Try adjusting your search or filters"
                : "Get started by creating your first product"
              }
            </p>
            {searchQuery === "" && filterStatus === "All" && (
              <Button onClick={onCreateProduct}>
                <Plus className="w-4 h-4 mr-2" />
                Add Product
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Bulk Action Toolbar */}
      <BulkActionToolbar
        selectedCount={selectedProductIds.size}
        onEdit={handleBulkEdit}
        onTag={handleBulkStatusUpdate}
        onMove={handleBulkMove}
        onDelete={handleBulkDelete}
        onShare={handleBulkExport}
        onClear={handleClearSelection}
      />

      {/* Keyboard Shortcuts Help */}
      <KeyboardShortcutsHelp />
    </div>
  );
}