"use client";

import React, { useState } from "react";
import { ArrowLeft, Save, Package, Zap, Shield, FileText, TrendingUp, ShoppingCart, BarChart3, Settings, ImageIcon } from "lucide-react";
import Link from "next/link";

interface ProductDetailClientProps {
  tenantSlug: string;
  productId: string;
}

export function ProductDetailClient({ tenantSlug, productId }: ProductDetailClientProps) {
  const [activeSection, setActiveSection] = useState('essentials');
  
  const sections = [
    { id: 'essentials', label: 'Essentials', icon: Package, completeness: 85 },
    { id: 'variants', label: 'Variants', icon: Settings, completeness: 60 },
    { id: 'formulation', label: 'Formulation', icon: Zap, completeness: 90 },
    { id: 'compliance', label: 'Compliance & Quality', icon: Shield, completeness: 75 },
    { id: 'content-seo', label: 'Content & SEO', icon: FileText, completeness: 40 },
    { id: 'marketplace-channels', label: 'Marketplace & Channels', icon: ShoppingCart, completeness: 20 },
    { id: 'analytics', label: 'Analytics & Performance', icon: BarChart3, completeness: 30 },
    { id: 'media', label: 'Media Assets', icon: ImageIcon, completeness: 10 },
    { id: 'pricing', label: 'Pricing & Cost', icon: TrendingUp, completeness: 80 },
    { id: 'inventory', label: 'Inventory & Supply', icon: Package, completeness: 50 },
    { id: 'quality', label: 'Quality Control', icon: Shield, completeness: 70 }
  ];

  const [product, setProduct] = useState({
    productName: "Gold Standard 100% Whey",
    brand: "Optimum Nutrition",
    category: "protein",
    shortDescription: "Premium whey protein isolates for lean muscle building and recovery",
    longDescription: "Gold Standard 100% Whey delivers 24g of whey protein to support muscle building, recovery, and immune system health. Made with premium whey protein isolates as the primary ingredient, this product mixes easily and comes in delicious flavors that taste great.",
    status: "active"
  });

  return (
    <div className="h-full">
      {/* Minimal header */}
      <div className="border-b border-border/60 bg-background">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link href={`/${tenantSlug}/products`}>
                <button className="flex items-center px-3 h-8 text-sm border border-border/60 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors">
                  Back
                </button>
              </Link>
              
              <div className="flex items-center gap-3">
                <div>
                  <h1 className="text-xl font-semibold text-foreground">
                    {product.productName}
                  </h1>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                    <span>Brand: {product.brand}</span>
                    <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                      product.status === 'active' ? 'bg-green-100 text-green-700' :
                      product.status === 'draft' ? 'bg-yellow-100 text-yellow-700' :
                      product.status === 'development' ? 'bg-blue-100 text-blue-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {product.status.charAt(0).toUpperCase() + product.status.slice(1)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Progress:</span>
                <div className="w-20 h-1.5 bg-muted rounded-sm">
                  <div className="w-3/4 h-1.5 bg-primary rounded-sm"></div>
                </div>
                <span className="text-sm font-medium text-foreground">75%</span>
              </div>
              
              <button className="flex items-center px-4 h-8 bg-primary hover:bg-primary/90 text-primary-foreground rounded text-sm font-medium">
                Save Changes
              </button>
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
              {sections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-left rounded-md transition-colors text-sm ${
                    activeSection === section.id
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <section.icon className="w-4 h-4" />
                    <span className="font-normal">{section.label}</span>
                  </div>
                  <span className="text-xs">{section.completeness}%</span>
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Main content area */}
        <div className="flex-1 h-full overflow-y-auto">
          <div className="p-6">
            <div className="max-w-4xl mx-auto">
              <div className="mb-6">
                <h1 className="text-2xl font-semibold text-foreground">
                  {sections.find(s => s.id === activeSection)?.label || 'Essentials'}
                </h1>
              </div>

              <div className="max-w-2xl mx-auto">
                {activeSection === 'essentials' && (
                  <div className="space-y-6" style={{ fontFamily: 'Inter, sans-serif' }}>
                    {/* Product Name */}
                    <div className="flex items-center gap-6">
                      <label className="w-40 text-foreground font-medium" style={{ fontSize: '15px' }}>
                        Product Name
                      </label>
                      <input 
                        type="text" 
                        value={product.productName}
                        onChange={(e) => setProduct({...product, productName: e.target.value})}
                        className="flex-1 px-3 py-2 border border-border/60 rounded-md text-foreground bg-background focus:ring-2 focus:ring-primary focus:border-primary"
                        style={{ fontSize: '15px' }}
                      />
                    </div>

                    {/* Brand */}
                    <div className="flex items-center gap-6">
                      <label className="w-40 text-foreground font-medium" style={{ fontSize: '15px' }}>
                        Brand
                      </label>
                      <input 
                        type="text" 
                        value={product.brand}
                        onChange={(e) => setProduct({...product, brand: e.target.value})}
                        className="flex-1 px-3 py-2 border border-border/60 rounded-md text-foreground bg-background focus:ring-2 focus:ring-primary focus:border-primary"
                        style={{ fontSize: '15px' }}
                      />
                    </div>

                    {/* Product Category */}
                    <div className="flex items-center gap-6">
                      <label className="w-40 text-foreground font-medium" style={{ fontSize: '15px' }}>
                        Product Category
                      </label>
                      <select 
                        value={product.category}
                        onChange={(e) => setProduct({...product, category: e.target.value})}
                        className="flex-1 px-3 py-2 border border-border/60 rounded-md text-foreground bg-background focus:ring-2 focus:ring-primary focus:border-primary"
                        style={{ fontSize: '15px' }}
                      >
                        <option value="protein">Protein</option>
                        <option value="pre-workout">Pre-Workout</option>
                        <option value="post-workout">Post-Workout</option>
                        <option value="creatine">Creatine</option>
                        <option value="vitamins">Vitamins</option>
                        <option value="fat-burner">Fat Burner</option>
                        <option value="amino-acids">Amino Acids</option>
                        <option value="health-wellness">Health & Wellness</option>
                      </select>
                    </div>

                    {/* Short Description */}
                    <div className="flex items-start gap-6">
                      <label className="w-40 text-foreground font-medium pt-2" style={{ fontSize: '15px' }}>
                        Short Description
                      </label>
                      <input 
                        type="text" 
                        value={product.shortDescription}
                        onChange={(e) => setProduct({...product, shortDescription: e.target.value})}
                        className="flex-1 px-3 py-2 border border-border/60 rounded-md text-foreground bg-background focus:ring-2 focus:ring-primary focus:border-primary"
                        style={{ fontSize: '15px' }}
                        placeholder="Brief product description for listings"
                      />
                    </div>

                    {/* Long Description */}
                    <div className="flex items-start gap-6">
                      <label className="w-40 text-foreground font-medium pt-2" style={{ fontSize: '15px' }}>
                        Long Description
                      </label>
                      <textarea 
                        value={product.longDescription}
                        onChange={(e) => setProduct({...product, longDescription: e.target.value})}
                        rows={4}
                        className="flex-1 px-3 py-2 border border-border/60 rounded-md text-foreground bg-background focus:ring-2 focus:ring-primary focus:border-primary resize-vertical"
                        style={{ fontSize: '15px' }}
                        placeholder="Detailed product description with benefits, usage instructions, etc."
                      />
                    </div>

                    {/* Status */}
                    <div className="flex items-center gap-6">
                      <label className="w-40 text-foreground font-medium" style={{ fontSize: '15px' }}>
                        Status
                      </label>
                      <select 
                        value={product.status}
                        onChange={(e) => setProduct({...product, status: e.target.value})}
                        className="flex-1 px-3 py-2 border border-border/60 rounded-md text-foreground bg-background focus:ring-2 focus:ring-primary focus:border-primary"
                        style={{ fontSize: '15px' }}
                      >
                        <option value="active">Active</option>
                        <option value="draft">Draft</option>
                        <option value="development">Development</option>
                        <option value="discontinued">Discontinued</option>
                      </select>
                    </div>
                  </div>
                )}

                {activeSection === 'marketplace-channels' && (
                  <div className="space-y-6">
                    <h3 className="text-lg font-medium text-foreground mb-4">Marketplace & Channels</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="border border-border/60 rounded-md p-4 bg-background">
                        <h4 className="font-medium text-foreground mb-2">Amazon</h4>
                        <p className="text-sm text-muted-foreground mb-3">Connect and manage Amazon listings</p>
                        <button className="w-full py-2 px-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded text-sm">
                          Connect to Amazon
                        </button>
                      </div>
                      <div className="border border-border/60 rounded-md p-4 bg-background">
                        <h4 className="font-medium text-foreground mb-2">Mercado Libre</h4>
                        <p className="text-sm text-muted-foreground mb-3">Expand to Latin American markets</p>
                        <button className="w-full py-2 px-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded text-sm">
                          Connect to MercadoLibre
                        </button>
                      </div>
                      <div className="border border-border/60 rounded-md p-4 bg-background">
                        <h4 className="font-medium text-foreground mb-2">Shopee</h4>
                        <p className="text-sm text-muted-foreground mb-3">Access Southeast Asian markets</p>
                        <button className="w-full py-2 px-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded text-sm">
                          Connect to Shopee
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {!['essentials', 'marketplace-channels'].includes(activeSection) && (
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